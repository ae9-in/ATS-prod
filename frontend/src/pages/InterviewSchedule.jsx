import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EnterpriseLayout, { EnterpriseSidebar, EnterpriseTopbar } from '../components/EnterpriseLayout';
import { PageEnter, Reveal } from '../components/PageMotion';
import UserChip from '../components/UserChip';
import NotificationBell from '../components/NotificationBell';
import { apiGet, apiGetBlob, apiPost, getStoredUser } from '../lib/api';
import { enterpriseFooterLinks, enterpriseNavItems } from '../config/enterpriseNav';

const emptyScheduleForm = {
  applicationId: '',
  roundNo: 1,
  round: 'Round 1',
  interviewerIds: [],
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
  const [loading, setLoading] = useState(true);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [candidateHistory, setCandidateHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [uploadingRecording, setUploadingRecording] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [viewMode, setViewMode] = useState('list');
  const [viewDate, setViewDate] = useState(new Date());
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
        setLoading(true);
        setError('');
        await loadAll();
      } catch (err) {
        if (!mounted) return;
        setError(err.message || 'Failed to load interviews');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);
 
  const downloadDailyPdf = async () => {
    try {
      const start = new Date(viewDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(viewDate);
      end.setHours(23, 59, 59, 999);
      
      const startISO = start.toISOString();
      const endISO = end.toISOString();
      
      // Standardize date for filename (YYYY-MM-DD)
      const year = start.getFullYear();
      const month = String(start.getMonth() + 1).padStart(2, '0');
      const day = String(start.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const path = `/reports/export?report=dailyinterviews&start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}&date=${encodeURIComponent(dateStr)}`;
      
      const blob = await apiGetBlob(path);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `interviews-${dateStr}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      setBanner(`Interviews for ${dateStr} export started.`);
    } catch (err) {
      setError(err.message || 'Failed to start download');
    }
  };
 
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
 
    const days = [];
    const offset = firstDay === 0 ? 6 : firstDay - 1; // Mon-Sun
    for (let i = offset; i > 0; i -= 1) {
      days.push({ day: prevMonthDays - i + 1, month: 'prev', date: new Date(year, month - 1, prevMonthDays - i + 1) });
    }
    for (let i = 1; i <= daysInMonth; i += 1) {
      days.push({ day: i, month: 'current', date: new Date(year, month, i) });
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i += 1) {
      days.push({ day: i, month: 'next', date: new Date(year, month + 1, i) });
    }
    return days;
  }, [viewDate]);

  const selectedInterview = useMemo(
    () => interviews.find((item) => item.id === selectedId) || interviews[0] || null,
    [interviews, selectedId],
  );

  const selectedCandidate = selectedInterview?.application?.candidate;
  const selectedFeedbacks = selectedInterview?.feedbacks || [];
  const myFeedback = selectedFeedbacks.find(f => f.submittedById === currentUser?.id);

  const loadCandidateHistory = async (candidateId) => {
    if (!candidateId) return;
    try {
      setLoadingHistory(true);
      const res = await apiGet(`/candidates/${candidateId}/history`);
      setCandidateHistory(res.data?.timeline || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (selectedCandidate?.id) {
      loadCandidateHistory(selectedCandidate.id);
    } else {
      setCandidateHistory([]);
    }
  }, [selectedCandidate?.id]);

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
      
      // Determine round number from label
      const roundMap = { 'Round 1': 1, 'Round 2': 2, 'Formal HR Round': 3 };
      const roundNo = roundMap[scheduleForm.round] || 1;

      await apiPost('/interviews', {
        applicationId: scheduleForm.applicationId,
        roundNo,
        round: scheduleForm.round,
        interviewerIds: scheduleForm.interviewerIds,
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
      sidebar={<EnterpriseSidebar active="interviews" items={enterpriseNavItems} footerLinks={enterpriseFooterLinks} />}
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
      <div className="flex items-center justify-between px-5 h-14 bg-white border-b border-[#e4ebf1]">
        <div className="flex gap-2">
          <button
            className={`os-btn-outline !h-9 ${viewMode === 'list' ? '!bg-[#1f52cc] !text-white' : ''}`}
            onClick={() => setViewMode('list')}
            type="button"
          >
            <span className="material-symbols-outlined text-sm">list</span>
            List View
          </button>
          <button
            className={`os-btn-outline !h-9 ${viewMode === 'calendar' ? '!bg-[#1f52cc] !text-white' : ''}`}
            onClick={() => setViewMode('calendar')}
            type="button"
          >
            <span className="material-symbols-outlined text-sm">calendar_month</span>
            Calendar Grid
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold text-[#142651]">
            {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </div>
          <div className="flex border border-[#dbe4ee] rounded-lg overflow-hidden">
            <button className="p-1 px-2 hover:bg-[#f6f9fc] border-r border-[#dbe4ee]" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}>
              <span className="material-symbols-outlined text-sm">chevron_left</span>
            </button>
            <button className="p-1 px-2 hover:bg-[#f6f9fc]" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}>
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
          <button className="os-btn-primary !h-9" onClick={downloadDailyPdf}>
            <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
            Daily PDF
          </button>
        </div>
      </div>
      <PageEnter className={`grid grid-cols-1 ${viewMode === 'list' ? 'lg:grid-cols-[280px_1fr] xl:grid-cols-[300px_1fr_320px]' : 'lg:grid-cols-1'} h-[calc(100vh-126px)] overflow-hidden`}>
        {viewMode === 'list' && (
        <Reveal className="bg-white border-r border-[#e4ebf1] p-4 overflow-auto max-h-[42vh] lg:max-h-none">
          <div className="flex items-center justify-between pb-4">
            <h2 className="text-2xl font-semibold font-[Manrope] px-2">Interviews</h2>
            {loading ? <div className="text-xs text-[#a1acbd] animate-pulse">Syncing...</div> : null}
          </div>
          {interviews.map((row) => {
            const candidate = row.application?.candidate;
            return (
              <button
                key={row.id}
                className={`w-full text-left flex gap-3 p-3 rounded-xl mb-1 ${selectedInterview?.id === row.id ? 'bg-[#eef3ff] border-l-4 border-[#1f4bc6]' : 'hover:bg-[#f6f9fc]'}`}
                onClick={() => setSelectedId(row.id)}
                type="button"
              >
                {candidate?.profilePhotoFile?.storageKey ? (
                  <img className="w-10 h-10 rounded-full object-cover" src={candidate.profilePhotoFile.storageKey} alt={candidate?.fullName || 'candidate'} />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#1f52cc] text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {(candidate?.fullName || 'C').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 1)}
                  </div>
                )}
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
        )}
 
        {viewMode === 'calendar' ? (
          <Reveal delay={0.06} className="bg-white p-6 overflow-auto lg:col-span-2 xl:col-span-3">
            <div className="calendar-grid">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <div key={day} className="calendar-day-label">{day}</div>
              ))}
              {calendarDays.map((cell, idx) => {
                const dayInterviews = interviews.filter((item) => {
                  const d = new Date(item.scheduledStart);
                  return d.getDate() === cell.day && d.getMonth() === cell.date.getMonth() && d.getFullYear() === cell.date.getFullYear();
                });
                const isToday = new Date().toDateString() === cell.date.toDateString();
                const isOtherMonth = cell.month !== 'current';
 
                return (
                  <div
                    key={`${cell.month}-${cell.day}-${idx}`}
                    className={`calendar-cell ${isToday ? 'today' : ''} ${isOtherMonth ? 'other-month' : ''} cursor-pointer`}
                    onClick={() => {
                      if (dayInterviews.length > 0) {
                        setSelectedId(dayInterviews[0].id);
                        setViewMode('list');
                      }
                    }}
                  >
                    <div className="calendar-date-num">{cell.day}</div>
                    {dayInterviews.map((item) => (
                      <div key={item.id} className={`calendar-event result-${item.result?.toLowerCase() || 'pending'}`}>
                        {new Date(item.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {item.application?.candidate?.fullName || 'Interview'}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </Reveal>
        ) : (
          <>

        <Reveal delay={0.04} className="bg-[#eef3f3] border-r border-[#e4ebf1] flex flex-col overflow-auto max-h-[58vh] lg:max-h-none">
          <div className="h-16 bg-white border-b border-[#e4ebf1] px-5 flex items-center justify-between">
            <div className="flex gap-3 items-center min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#b7c7f2] text-[#2f4ea8] text-sm font-semibold flex items-center justify-center">
                {(selectedCandidate?.fullName || 'C').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xl font-semibold font-[Manrope] truncate">{selectedCandidate?.fullName || (loading ? 'Loading...' : 'Candidate')}</div>
                <div className={selectedInterview ? 'text-[#2ca764] text-xs' : 'text-[#8c97ad] text-xs'}>{selectedInterview ? 'Interview Active' : 'No active interview'}</div>
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
              <div>Interviewers: {selectedInterview?.interviewers?.map(u => u.fullName).join(', ') || '-'}</div>
              <div>Mode: {selectedInterview?.mode || '-'}</div>
              <div>Status: {selectedInterview?.result || '-'}</div>
              <div>Date: {selectedInterview?.scheduledStart ? new Date(selectedInterview.scheduledStart).toLocaleString() : '-'}</div>
              {selectedInterview?.voiceRecordingFile?.storageKey ? (
                <a 
                  className="text-[#1f4bc6] inline-block mt-2" 
                  href={selectedInterview.voiceRecordingFile.storageKey?.startsWith('http')
                    ? selectedInterview.voiceRecordingFile.storageKey
                    : `${import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:4000'}/uploads/${selectedInterview.voiceRecordingFile.storageKey}`
                  } 
                  target="_blank" 
                  rel="noreferrer"
                >
                  Listen Recording: {selectedInterview.voiceRecordingFile.originalName}
                </a>
              ) : null}
            </div>

            {/* Candidate Journey Timeline */}
            <div className="os-card p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="font-semibold text-[#142651]">Round History</div>
                {loadingHistory && <div className="text-[10px] text-blue-500 animate-pulse">Syncing...</div>}
              </div>
              <div className="space-y-4 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-[2px] before:bg-[#e4ebf1]">
                {candidateHistory.length === 0 && !loadingHistory && (
                  <div className="text-xs text-[#a1acbd] pl-8">No journey records found.</div>
                )}
                {candidateHistory.map((event, idx) => (
                  <div key={idx} className="relative pl-10">
                    <div className={`absolute left-0 top-1 w-9 h-9 rounded-full border-4 border-white flex items-center justify-center ${
                      event.type === 'INTERVIEW_FEEDBACK_SUBMITTED' ? 'bg-[#2ca764] text-white' : 
                      event.type === 'INTERVIEW_SCHEDULED' ? 'bg-[#1f52cc] text-white' : 'bg-[#a1acbd] text-white'
                    }`}>
                      <span className="material-symbols-outlined text-sm">
                        {event.type === 'INTERVIEW_FEEDBACK_SUBMITTED' ? 'check_circle' : 
                         event.type === 'INTERVIEW_SCHEDULED' ? 'event' : 'info'}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-[#142651]">
                      {event.type === 'INTERVIEW_SCHEDULED' ? `Round ${event.roundNo} Scheduled` : 
                       event.type === 'INTERVIEW_FEEDBACK_SUBMITTED' ? `Feedback: ${event.recommendation}` : 
                       event.type.replace(/_/g, ' ')}
                    </div>
                    <div className="text-[11px] text-[#6f7894] mb-1">
                      {new Date(event.at).toLocaleString()}
                    </div>
                    {event.overallComments && (
                      <div className="text-xs text-[#5e6a85] bg-[#f8fbff] p-2 rounded-lg border border-[#eef3ff]">
                        "{event.overallComments}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Multiple Feedback Display */}
            {selectedFeedbacks.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase text-[#8b95ad] tracking-wider ml-1">Interviewer Assessments ({selectedFeedbacks.length})</div>
                {selectedFeedbacks.map((f) => (
                  <div key={f.id} className="os-card p-4 transition-all hover:shadow-md border-l-4 border-[#2ca764]">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#eef3ff] flex items-center justify-center text-[10px] font-bold text-[#1f52cc]">
                          {(f.submittedBy?.fullName || 'U').split(' ').map(n=>n[0]).join('')}
                        </div>
                        <div className="text-sm font-medium text-[#142651]">{f.submittedBy?.fullName}</div>
                      </div>
                      <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        f.recommendation === 'PASS' ? 'bg-[#e8f5ed] text-[#2ca764]' : 
                        f.recommendation === 'FAIL' ? 'bg-[#fbeaea] text-[#cf3a3a]' : 'bg-[#fef4e8] text-[#f2994a]'
                      }`}>
                        {f.recommendation}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="bg-[#f8f9fa] p-2 rounded text-center">
                        <div className="text-[10px] text-[#868fa0] uppercase">Tech</div>
                        <div className="text-xs font-bold">{f.technicalRating}/5</div>
                      </div>
                      <div className="bg-[#f8f9fa] p-2 rounded text-center">
                        <div className="text-[10px] text-[#868fa0] uppercase">Comm</div>
                        <div className="text-xs font-bold">{f.communicationRating}/5</div>
                      </div>
                      <div className="bg-[#f8f9fa] p-2 rounded text-center">
                        <div className="text-[10px] text-[#868fa0] uppercase">Culture</div>
                        <div className="text-xs font-bold">{f.cultureFitRating}/5</div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs">
                        <span className="font-semibold text-[#142651]">Strengths:</span>
                        <span className="text-[#5e6a85] ml-1">{f.strengths}</span>
                      </div>
                      <div className="text-xs">
                        <span className="font-semibold text-[#142651]">Comments:</span>
                        <p className="text-[#5e6a85] mt-1 italic text-[13px]">"{f.overallComments}"</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                <div className="text-xs font-semibold text-[#6d7893] mt-1">Select Interviewers (Multiple)</div>
                <div className="max-h-32 overflow-y-auto border border-[#dbe4ee] rounded-lg p-2 space-y-1 bg-white">
                  {interviewers.map((person) => (
                    <label key={person.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors">
                      <input 
                        type="checkbox" 
                        checked={scheduleForm.interviewerIds.includes(person.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setScheduleForm(prev => {
                            const newIds = checked 
                              ? [...prev.interviewerIds, person.id]
                              : prev.interviewerIds.filter(id => id !== person.id);
                            return { ...prev, interviewerIds: newIds };
                          });
                        }}
                      />
                      <span className="text-xs text-[#2a344f]">{person.fullName}</span>
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select className="h-10 rounded-lg border border-[#dbe4ee] px-2 text-sm" value={scheduleForm.round} onChange={(event) => setScheduleForm((prev) => ({ ...prev, round: event.target.value }))}>
                    <option value="Round 1">Round 1</option>
                    <option value="Round 2">Round 2</option>
                    <option value="Formal HR Round">Formal HR Round</option>
                  </select>
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
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-1">
                <label className="text-[10px] uppercase font-bold text-[#8b95ad] ml-1">Technical Skills (1-5)</label>
                <input className="h-10 rounded-lg border border-[#dbe4ee] px-2 text-sm" type="number" min="1" max="5" value={feedbackForm.technicalRating} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, technicalRating: event.target.value }))} />
              </div>
              <div className="grid grid-cols-1 gap-1">
                <label className="text-[10px] uppercase font-bold text-[#8b95ad] ml-1">Communication (1-5)</label>
                <input className="h-10 rounded-lg border border-[#dbe4ee] px-2 text-sm" type="number" min="1" max="5" value={feedbackForm.communicationRating} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, communicationRating: event.target.value }))} />
              </div>
              <div className="grid grid-cols-1 gap-1">
                <label className="text-[10px] uppercase font-bold text-[#8b95ad] ml-1">Culture Fit (1-5)</label>
                <input className="h-10 rounded-lg border border-[#dbe4ee] px-2 text-sm" type="number" min="1" max="5" value={feedbackForm.cultureFitRating} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, cultureFitRating: event.target.value }))} />
              </div>
            </div>
            <textarea className="mt-3 min-h-[68px] w-full rounded-lg border border-[#dbe4ee] px-2 py-2 text-sm" placeholder="Key Strengths..." value={feedbackForm.strengths} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, strengths: event.target.value }))} required />
            <textarea className="mt-2 min-h-[68px] w-full rounded-lg border border-[#dbe4ee] px-2 py-2 text-sm" placeholder="Potential Concerns..." value={feedbackForm.concerns} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, concerns: event.target.value }))} required />
            <select className="mt-2 h-10 w-full rounded-lg border border-[#dbe4ee] px-2 text-sm" value={feedbackForm.recommendation} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, recommendation: event.target.value }))}>
              <option value="PASS">PASS</option>
              <option value="FAIL">FAIL</option>
              <option value="HOLD">HOLD</option>
              <option value="PENDING">PENDING</option>
            </select>
            <textarea className="mt-2 min-h-[68px] w-full rounded-lg border border-[#dbe4ee] px-2 py-2 text-sm" placeholder="Overall Decision Comments..." value={feedbackForm.overallComments} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, overallComments: event.target.value }))} required />
            <button className="os-btn-primary w-full mt-3" type="submit" disabled={savingFeedback || !selectedInterview || Boolean(myFeedback)}>
              {myFeedback ? 'You have submitted feedback' : savingFeedback ? 'Submitting...' : 'Submit Feedback'}
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
        </>
        )}
      </PageEnter>
    </EnterpriseLayout>
  );
};

export default InterviewSchedule;
