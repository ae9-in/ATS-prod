import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EnterpriseLayout, { EnterpriseSidebar, EnterpriseTopbar } from '../components/EnterpriseLayout';
import { PageEnter, Reveal } from '../components/PageMotion';
import UserChip from '../components/UserChip';
import NotificationBell from '../components/NotificationBell';
import { apiGet, apiPost, getStoredUser } from '../lib/api';
import { enterpriseFooterLinks, enterpriseNavItems } from '../config/enterpriseNav';

const emptyScheduleForm = {
  applicationId: '',
  roundNo: 1,
  interviewerId: '',
  scheduledStart: '',
  scheduledEnd: '',
  mode: 'ONLINE',
  meetingLink: '',
};

const emptyFeedbackForm = {
  technicalRating: 4,
  communicationRating: 4,
  cultureFitRating: 4,
  strengths: '',
  concerns: '',
  recommendation: 'PASS',
  overallComments: '',
};

const InterviewSchedule = () => {
  const navigate = useNavigate();
  const [interviews, setInterviews] = useState([]);
  const [applications, setApplications] = useState([]);
  const [interviewers, setInterviewers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [scheduleForm, setScheduleForm] = useState(emptyScheduleForm);
  const [feedbackForm, setFeedbackForm] = useState(emptyFeedbackForm);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [recordingFile, setRecordingFile] = useState(null);
  const [uploadingRecording, setUploadingRecording] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const currentUser = getStoredUser();
  const canScheduleInterview = ['SUPER_ADMIN', 'RECRUITER'].includes(currentUser?.role);
  const recorderSupported = typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined';

  const loadAll = async () => {
    const [interviewsRes, applicationsRes] = await Promise.all([
      apiGet('/interviews'),
      apiGet('/applications?limit=200'),
    ]);

    let interviewerRows = [];
    try {
      const interviewerRes = await apiGet('/users/interviewers');
      interviewerRows = interviewerRes.data || [];
    } catch (_) {
      interviewerRows = (interviewsRes.data || [])
        .map((item) => item.interviewer)
        .filter(Boolean);
    }

    const interviewRows = interviewsRes.data || [];
    setInterviews(interviewRows);
    setApplications(applicationsRes.data || []);
    setInterviewers(interviewerRows);
    setSelectedId((prev) => prev || interviewRows[0]?.id || '');
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setError('');
        await loadAll();
      } catch (err) {
        if (!mounted) return;
        setError(err.message || 'Failed to load interviews');
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const selectedInterview = useMemo(
    () => interviews.find((item) => item.id === selectedId) || interviews[0] || null,
    [interviews, selectedId],
  );

  const selectedCandidate = selectedInterview?.application?.candidate;
  const selectedFeedback = selectedInterview?.feedback;

  const openMeetingLink = () => {
    const link = selectedInterview?.meetingLink;
    if (!link) {
      setBanner('No meeting link on this interview.');
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const callCandidate = () => {
    const phone = selectedCandidate?.phone;
    if (!phone) {
      setBanner('No phone number available for this candidate.');
      return;
    }
    window.location.href = `tel:${phone}`;
  };

  const onScheduleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setBanner('');

    try {
      setSavingSchedule(true);
      await apiPost('/interviews', {
        applicationId: scheduleForm.applicationId,
        roundNo: Number(scheduleForm.roundNo),
        interviewerId: scheduleForm.interviewerId,
        scheduledStart: new Date(scheduleForm.scheduledStart).toISOString(),
        scheduledEnd: scheduleForm.scheduledEnd ? new Date(scheduleForm.scheduledEnd).toISOString() : null,
        mode: scheduleForm.mode,
        meetingLink: scheduleForm.meetingLink.trim() || null,
      });

      await loadAll();
      setScheduleForm(emptyScheduleForm);
      setBanner('Interview scheduled successfully.');
    } catch (err) {
      setError(err.message || 'Failed to schedule interview');
    } finally {
      setSavingSchedule(false);
    }
  };

  const onFeedbackSubmit = async (event) => {
    event.preventDefault();
    if (!selectedInterview) {
      setError('Select an interview before submitting feedback.');
      return;
    }

    setError('');
    setBanner('');

    try {
      setSavingFeedback(true);
      await apiPost(`/interviews/${selectedInterview.id}/feedback`, {
        technicalRating: Number(feedbackForm.technicalRating),
        communicationRating: Number(feedbackForm.communicationRating),
        cultureFitRating: Number(feedbackForm.cultureFitRating),
        strengths: feedbackForm.strengths.trim(),
        concerns: feedbackForm.concerns.trim(),
        recommendation: feedbackForm.recommendation,
        overallComments: feedbackForm.overallComments.trim(),
      });

      await loadAll();
      setFeedbackForm(emptyFeedbackForm);
      setBanner('Feedback submitted successfully.');
    } catch (err) {
      setError(err.message || 'Failed to submit feedback');
    } finally {
      setSavingFeedback(false);
    }
  };

  const onUploadRecording = async () => {
    const uploadTarget = recordingFile || (recordedBlob ? new File([recordedBlob], `interview-${selectedInterview?.id || 'recording'}.webm`, { type: recordedBlob.type || 'audio/webm' }) : null);
    if (!selectedInterview?.id || !uploadTarget) {
      setError('Select interview and recording file first.');
      return;
    }

    setError('');
    setBanner('');
    try {
      setUploadingRecording(true);
      const token = localStorage.getItem('ats_token');
      const formData = new FormData();
      formData.append('file', uploadTarget);

      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'}/interviews/${selectedInterview.id}/voice-recording`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Recording upload failed');
      }

      await loadAll();
      setRecordingFile(null);
      setRecordedBlob(null);
      setRecordedUrl('');
      setRecordingSeconds(0);
      setBanner('Voice recording uploaded successfully.');
    } catch (err) {
      setError(err.message || 'Failed to upload recording');
    } finally {
      setUploadingRecording(false);
    }
  };

  const clearRecordingTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startBrowserRecording = async () => {
    if (!recorderSupported) {
      setError('Browser recording is not supported. Please use file upload.');
      return;
    }

    setError('');
    setBanner('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        setIsRecording(false);
        clearRecordingTimer();
        stopStream();
      };

      recorder.start(500);
      setRecordedBlob(null);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      setRecordedUrl('');
      setRecordingSeconds(0);
      setIsRecording(true);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      setError(err?.message || 'Unable to access microphone');
      setIsRecording(false);
      clearRecordingTimer();
      stopStream();
    }
  };

  const stopBrowserRecording = () => {
    if (!recorderRef.current) return;
    recorderRef.current.stop();
  };

  useEffect(() => () => {
    clearRecordingTimer();
    stopStream();
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  }, [recordedUrl]);

  return (
    <EnterpriseLayout
      sidebar={<EnterpriseSidebar active="interviews" items={enterpriseNavItems} footerLinks={enterpriseFooterLinks} footerButton={<button className="os-btn-primary w-full" type="button" onClick={() => navigate('/schedule')}>Interview Hub</button>} />}
      topbar={
        <EnterpriseTopbar
          searchPlaceholder="Search conversations or candidates..."
          tabs={[
            { key: 'pipeline', label: 'Pipeline', href: '/pipeline' },
            { key: 'sourcing', label: 'Sourcing', href: '/sourcing' },
            { key: 'referrals', label: 'Referrals', href: '/referrals' },
          ]}
          right={
            <>
              <NotificationBell />
              <button className="os-icon-btn" type="button" onClick={() => navigate('/pipeline')}>
                <span className="material-symbols-outlined">chat</span>
              </button>
              <UserChip fallbackName="Alex Sterling" fallbackRole="Sr. Recruiter" avatarSeed="interview-user" />
            </>
          }
        />
      }
      contentClassName="!p-0"
    >
      <PageEnter className="grid grid-cols-1 lg:grid-cols-[280px_1fr] xl:grid-cols-[300px_1fr_320px] h-[calc(100vh-70px)]">
        <Reveal className="bg-white border-r border-[#e4ebf1] p-4 overflow-auto max-h-[42vh] lg:max-h-none">
          <h2 className="text-2xl font-semibold font-[Manrope] px-2 pb-4">Interviews</h2>
          {interviews.map((row) => {
            const candidate = row.application?.candidate;
            return (
              <button
                key={row.id}
                className={`w-full text-left flex gap-3 p-3 rounded-xl mb-1 ${selectedInterview?.id === row.id ? 'bg-[#eef3ff] border-l-4 border-[#1f4bc6]' : 'hover:bg-[#f6f9fc]'}`}
                onClick={() => setSelectedId(row.id)}
                type="button"
              >
                <img className="w-10 h-10 rounded-full" src={`https://i.pravatar.cc/80?u=${candidate?.id || row.id}`} alt={candidate?.fullName || 'candidate'} />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{candidate?.fullName || 'Candidate'}</div>
                  <div className="text-xs text-[#6f7894] truncate">{row.application?.job?.title || 'Interview conversation'}</div>
                  <div className="text-[11px] text-[#7d88a4] mt-1">
                    {row.scheduledStart ? new Date(row.scheduledStart).toLocaleString() : 'Not scheduled'}
                  </div>
                </div>
              </button>
            );
          })}
          {interviews.length === 0 ? <div className="text-sm os-muted px-2">No interviews found.</div> : null}
        </Reveal>

        <Reveal delay={0.04} className="bg-[#eef3f3] border-r border-[#e4ebf1] flex flex-col overflow-auto max-h-[58vh] lg:max-h-none">
          <div className="h-16 bg-white border-b border-[#e4ebf1] px-5 flex items-center justify-between">
            <div className="flex gap-3 items-center min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#b7c7f2] text-[#2f4ea8] text-sm font-semibold flex items-center justify-center">
                {(selectedCandidate?.fullName || 'C').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-xl font-semibold font-[Manrope] truncate">{selectedCandidate?.fullName || 'Candidate'}</div>
                <div className="text-[#2ca764] text-xs">{selectedInterview ? 'Interview Active' : 'No active interview'}</div>
              </div>
            </div>
            <div className="text-[#6d7893] flex gap-3">
              <button className="os-icon-btn !h-8 !w-8" type="button" onClick={openMeetingLink}>
                <span className="material-symbols-outlined">videocam</span>
              </button>
              <button className="os-icon-btn !h-8 !w-8" type="button" onClick={callCandidate}>
                <span className="material-symbols-outlined">call</span>
              </button>
              <button className="os-icon-btn !h-8 !w-8" type="button" onClick={() => setBanner('More actions are available in quick actions panel.')}>
                <span className="material-symbols-outlined">more_vert</span>
              </button>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {error ? <div className="os-card p-3 text-xs text-red-600">{error}</div> : null}
            {banner ? <div className="os-card p-3 text-xs text-[#2454cf]">{banner}</div> : null}

            <div className="os-card p-4 text-sm text-[#2a344f]">
              <div className="font-semibold text-[#142651] mb-2">Current Interview Details</div>
              <div>Role: {selectedInterview?.application?.job?.title || '-'}</div>
              <div>Interviewer: {selectedInterview?.interviewer?.fullName || '-'}</div>
              <div>Mode: {selectedInterview?.mode || '-'}</div>
              <div>Status: {selectedInterview?.result || '-'}</div>
              <div>Date: {selectedInterview?.scheduledStart ? new Date(selectedInterview.scheduledStart).toLocaleString() : '-'}</div>
              {selectedInterview?.voiceRecordingFile?.storageKey ? (
                <a className="text-[#1f4bc6] inline-block mt-2" href={`${import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:4000'}/uploads/${selectedInterview.voiceRecordingFile.storageKey}`} target="_blank" rel="noreferrer">
                  Listen Recording: {selectedInterview.voiceRecordingFile.originalName}
                </a>
              ) : null}
            </div>

            {selectedFeedback ? (
              <div className="os-card p-4 text-sm text-[#2a344f]">
                <div className="font-semibold text-[#142651] mb-2">Submitted Feedback</div>
                <div>Recommendation: {selectedFeedback.recommendation}</div>
                <div>Technical: {selectedFeedback.technicalRating}/5</div>
                <div>Communication: {selectedFeedback.communicationRating}/5</div>
                <div>Culture Fit: {selectedFeedback.cultureFitRating}/5</div>
                <div className="mt-2 text-[#5e6a85]">{selectedFeedback.overallComments}</div>
              </div>
            ) : null}
          </div>
        </Reveal>

        <Reveal delay={0.08} className="bg-[#f8fbfb] p-4 overflow-auto border-t lg:border-t-0 border-[#e4ebf1]">
          <div className="os-eyebrow">Quick Actions</div>

          {canScheduleInterview ? (
            <form className="os-card p-4 mt-2" onSubmit={onScheduleSubmit}>
              <div className="text-sm font-semibold text-[#142651] mb-3">Schedule Interview</div>
              <div className="space-y-2">
                <select className="h-10 w-full rounded-lg border border-[#dbe4ee] px-2 text-sm" value={scheduleForm.applicationId} onChange={(event) => setScheduleForm((prev) => ({ ...prev, applicationId: event.target.value }))} required>
                  <option value="">Select application</option>
                  {applications.map((application) => (
                    <option key={application.id} value={application.id}>
                      {(application.candidate?.fullName || 'Candidate')} - {(application.job?.title || 'Role')}
                    </option>
                  ))}
                </select>
                <select className="h-10 w-full rounded-lg border border-[#dbe4ee] px-2 text-sm" value={scheduleForm.interviewerId} onChange={(event) => setScheduleForm((prev) => ({ ...prev, interviewerId: event.target.value }))} required>
                  <option value="">Select interviewer</option>
                  {interviewers.map((person) => (
                    <option key={person.id} value={person.id}>{person.fullName}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input className="h-10 rounded-lg border border-[#dbe4ee] px-2 text-sm" type="number" min="1" value={scheduleForm.roundNo} onChange={(event) => setScheduleForm((prev) => ({ ...prev, roundNo: event.target.value }))} />
                  <select className="h-10 rounded-lg border border-[#dbe4ee] px-2 text-sm" value={scheduleForm.mode} onChange={(event) => setScheduleForm((prev) => ({ ...prev, mode: event.target.value }))}>
                    <option value="ONLINE">ONLINE</option>
                    <option value="OFFLINE">OFFLINE</option>
                    <option value="PHONE">PHONE</option>
                  </select>
                </div>
                <input className="h-10 w-full rounded-lg border border-[#dbe4ee] px-2 text-sm" type="datetime-local" value={scheduleForm.scheduledStart} onChange={(event) => setScheduleForm((prev) => ({ ...prev, scheduledStart: event.target.value }))} required />
                <input className="h-10 w-full rounded-lg border border-[#dbe4ee] px-2 text-sm" type="datetime-local" value={scheduleForm.scheduledEnd} onChange={(event) => setScheduleForm((prev) => ({ ...prev, scheduledEnd: event.target.value }))} />
                <input className="h-10 w-full rounded-lg border border-[#dbe4ee] px-2 text-sm" placeholder="Meeting link (optional)" value={scheduleForm.meetingLink} onChange={(event) => setScheduleForm((prev) => ({ ...prev, meetingLink: event.target.value }))} />
              </div>
              <button className="os-btn-primary w-full mt-3" type="submit" disabled={savingSchedule}>
                {savingSchedule ? 'Scheduling...' : 'Schedule'}
              </button>
            </form>
          ) : null}

          <form className="os-card p-4 mt-3" onSubmit={onFeedbackSubmit}>
            <div className="text-sm font-semibold text-[#142651] mb-3">Submit Feedback</div>
            <div className="grid grid-cols-3 gap-2">
              <input className="h-10 rounded-lg border border-[#dbe4ee] px-2 text-sm" type="number" min="1" max="5" value={feedbackForm.technicalRating} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, technicalRating: event.target.value }))} />
              <input className="h-10 rounded-lg border border-[#dbe4ee] px-2 text-sm" type="number" min="1" max="5" value={feedbackForm.communicationRating} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, communicationRating: event.target.value }))} />
              <input className="h-10 rounded-lg border border-[#dbe4ee] px-2 text-sm" type="number" min="1" max="5" value={feedbackForm.cultureFitRating} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, cultureFitRating: event.target.value }))} />
            </div>
            <textarea className="mt-2 min-h-[68px] w-full rounded-lg border border-[#dbe4ee] px-2 py-2 text-sm" placeholder="Strengths" value={feedbackForm.strengths} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, strengths: event.target.value }))} required />
            <textarea className="mt-2 min-h-[68px] w-full rounded-lg border border-[#dbe4ee] px-2 py-2 text-sm" placeholder="Concerns" value={feedbackForm.concerns} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, concerns: event.target.value }))} required />
            <select className="mt-2 h-10 w-full rounded-lg border border-[#dbe4ee] px-2 text-sm" value={feedbackForm.recommendation} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, recommendation: event.target.value }))}>
              <option value="PASS">PASS</option>
              <option value="FAIL">FAIL</option>
              <option value="HOLD">HOLD</option>
              <option value="PENDING">PENDING</option>
            </select>
            <textarea className="mt-2 min-h-[68px] w-full rounded-lg border border-[#dbe4ee] px-2 py-2 text-sm" placeholder="Overall comments" value={feedbackForm.overallComments} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, overallComments: event.target.value }))} required />
            <button className="os-btn-primary w-full mt-3" type="submit" disabled={savingFeedback || !selectedInterview || Boolean(selectedFeedback)}>
              {selectedFeedback ? 'Feedback Already Submitted' : savingFeedback ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </form>

          <div className="os-card p-4 mt-3">
            <div className="text-sm font-semibold text-[#142651] mb-3">Upload Voice Recording</div>
            {recorderSupported ? (
              <div className="rounded-lg border border-[#dbe4ee] bg-[#f7faff] p-3 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-[#5f6a84]">In-browser Recorder</div>
                  <div className="text-xs font-semibold text-[#1f4bc6]">{Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:{(recordingSeconds % 60).toString().padStart(2, '0')}</div>
                </div>
                <div className="flex gap-2">
                  {!isRecording ? (
                    <button className="os-btn-primary !h-9 flex-1" type="button" onClick={startBrowserRecording}>Start Recording</button>
                  ) : (
                    <button className="os-btn-outline !h-9 flex-1" type="button" onClick={stopBrowserRecording}>Stop Recording</button>
                  )}
                  <button
                    className="os-btn-outline !h-9"
                    type="button"
                    onClick={() => {
                      setRecordedBlob(null);
                      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
                      setRecordedUrl('');
                      setRecordingSeconds(0);
                    }}
                    disabled={!recordedBlob}
                  >
                    Clear
                  </button>
                </div>
                {recordedUrl ? (
                  <audio controls className="w-full mt-2">
                    <source src={recordedUrl} type="audio/webm" />
                  </audio>
                ) : null}
              </div>
            ) : null}
            <input className="os-file-input" type="file" accept="audio/*" onChange={(event) => setRecordingFile(event.target.files?.[0] || null)} />
            <button className="os-btn-outline w-full mt-3" type="button" onClick={onUploadRecording} disabled={uploadingRecording}>
              {uploadingRecording ? 'Uploading...' : 'Upload Recording'}
            </button>
          </div>
        </Reveal>
      </PageEnter>
    </EnterpriseLayout>
  );
};

export default InterviewSchedule;
