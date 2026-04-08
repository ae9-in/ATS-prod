import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import EnterpriseLayout, { EnterpriseSidebar, EnterpriseTopbar } from '../components/EnterpriseLayout';
import { PageEnter, Reveal } from '../components/PageMotion';
import UserChip from '../components/UserChip';
import NotificationBell from '../components/NotificationBell';
import { apiGet, apiPatch, apiPost, getStoredUser } from '../lib/api';
import { enterpriseFooterLinks, enterpriseNavItems } from '../config/enterpriseNav';

const emptyApplicationForm = {
  candidateId: '',
  jobId: '',
};

const emptyStageForm = {
  name: '',
  sortOrder: '',
  isTerminal: false,
  jobId: '',
};

const Pipeline = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const jobFilterId = query.get('jobId') || '';
  const candidateFilterId = query.get('candidateId') || '';

  const [viewMode, setViewMode] = useState('board'); // 'board' or 'table'
  const [stages, setStages] = useState([]);
  const [applications, setApplications] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedStages, setSelectedStages] = useState({});
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [loading, setLoading] = useState(true);
  const [moveRemarks, setMoveRemarks] = useState({});
  const [movingId, setMovingId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showStageCreate, setShowStageCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [applicationForm, setApplicationForm] = useState(emptyApplicationForm);
  const [stageForm, setStageForm] = useState({
    ...emptyStageForm,
    jobId: jobFilterId || '',
  });
  const [historyByApp, setHistoryByApp] = useState({});
  const currentUser = getStoredUser();
  const canMovePipeline = ['SUPER_ADMIN', 'RECRUITER', 'INTERVIEWER'].includes(currentUser?.role);
  const canCreateApplication = ['SUPER_ADMIN', 'RECRUITER'].includes(currentUser?.role);

  const loadAll = async () => {
    const appQuery = [
      'limit=200',
      jobFilterId ? `jobId=${encodeURIComponent(jobFilterId)}` : '',
      candidateFilterId ? `candidateId=${encodeURIComponent(candidateFilterId)}` : '',
    ]
      .filter(Boolean)
      .join('&');

    const fetchRequests = [
      apiGet(`/pipeline/stages${jobFilterId ? `?jobId=${encodeURIComponent(jobFilterId)}` : ''}`),
      apiGet(`/applications?${appQuery}`),
    ];

    // Only fetch candidates and jobs if we don't have them yet or if we're doing a full reload
    const shouldFetchLists = candidates.length === 0 || jobs.length === 0;
    if (shouldFetchLists) {
      fetchRequests.push(apiGet('/candidates?limit=200'));
      fetchRequests.push(apiGet('/jobs?limit=200'));
    }

    const results = await Promise.all(fetchRequests);
    const stagesRes = results[0];
    const applicationsRes = results[1];
    const candidatesRes = shouldFetchLists ? results[2] : null;
    const jobsRes = shouldFetchLists ? results[3] : null;


    const stageRows = stagesRes.data || [];
    const applicationRows = applicationsRes.data || [];

    setStages(stageRows);
    setApplications(applicationRows);
    if (candidatesRes) setCandidates(candidatesRes.data || []);
    if (jobsRes) setJobs(jobsRes.data || []);
    setSelectedStages(
      applicationRows.reduce((acc, app) => {
        acc[app.id] = app.currentStage?.id || '';
        return acc;
      }, {}),
    );
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
        setError(err.message || 'Failed to load pipeline');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [jobFilterId, candidateFilterId]);

  useEffect(() => {
    setStageForm((prev) => ({ ...prev, jobId: prev.jobId || jobFilterId || '' }));
  }, [jobFilterId]);

  const onCreateApplication = async (event) => {
    event.preventDefault();
    setError('');
    setBanner('');

    try {
      setSaving(true);
      await apiPost('/applications', {
        candidateId: applicationForm.candidateId,
        jobId: applicationForm.jobId,
      });
      await loadAll();
      setApplicationForm(emptyApplicationForm);
      setShowCreate(false);
      setBanner('Application added to pipeline.');
    } catch (err) {
      setError(err.message || 'Failed to add application');
    } finally {
      setSaving(false);
    }
  };

  const onCreateStage = async (event) => {
    event.preventDefault();
    setError('');
    setBanner('');

    try {
      setSavingStage(true);
      await apiPost('/pipeline/stages', {
        name: stageForm.name.trim(),
        sortOrder: Number(stageForm.sortOrder),
        isTerminal: Boolean(stageForm.isTerminal),
        jobId: stageForm.jobId || null,
      });
      await loadAll();
      setStageForm({ ...emptyStageForm, jobId: jobFilterId || '' });
      setShowStageCreate(false);
      setBanner('Pipeline stage created successfully.');
    } catch (err) {
      setError(err.message || 'Failed to create stage');
    } finally {
      setSavingStage(false);
    }
  };

  const onToggleShortlist = async (application) => {
    setError('');
    setBanner('');
    try {
      await apiPatch(`/applications/${application.id}/shortlist`, {
        shortlisted: !Boolean(application.shortlisted),
      });
      await loadAll();
      setBanner(`Application ${application.shortlisted ? 'removed from' : 'added to'} shortlist.`);
    } catch (err) {
      setError(err.message || 'Failed to update shortlist');
    }
  };

  const onMoveStage = async (applicationId) => {
    const toStageId = selectedStages[applicationId];
    if (!toStageId) {
      setError('Please select a stage before moving.');
      return;
    }

    setError('');
    setBanner('');
    setMovingId(applicationId);
    try {
      const remark = moveRemarks[applicationId] || 'Moved from pipeline board';
      await apiPatch(`/pipeline/applications/${applicationId}/move`, {
        toStageId,
        remark,
      });
      setMoveRemarks((prev) => {
        const next = { ...prev };
        delete next[applicationId];
        return next;
      });
      await loadAll();
      await onLoadHistory(applicationId); // Refresh visible history immediately
      setBanner('Application moved successfully.');
    } catch (err) {
      setError(err.message || 'Failed to move pipeline stage');
    } finally {
      setMovingId('');
    }
  };

  const onLoadHistory = async (applicationId) => {
    try {
      const res = await apiGet(`/pipeline/applications/${applicationId}/history`);
      setHistoryByApp((prev) => ({
        ...prev,
        [applicationId]: res.data || [],
      }));
    } catch (err) {
      setError(err.message || 'Failed to load stage history');
    }
  };

  const columns = useMemo(() => {
    const stageOrder = [...(stages || [])].sort((a, b) => a.sortOrder - b.sortOrder);
    const grouped = stageOrder.map((stage) => ({ ...stage, items: [] }));
    const groupedById = new Map(grouped.map((item) => [item.id, item]));

    applications.forEach((app) => {
      const key = app.currentStage?.id;
      if (key && groupedById.has(key)) {
        groupedById.get(key).items.push(app);
      }
    });

    const unassigned = applications.filter((app) => !app.currentStage?.id || !groupedById.has(app.currentStage.id));
    if (unassigned.length > 0) {
      grouped.push({
        id: 'unassigned',
        name: 'Unassigned',
        sortOrder: 999,
        items: unassigned,
      });
    }

    return grouped;
  }, [applications, stages]);

  return (
    <EnterpriseLayout
      sidebar={<EnterpriseSidebar active="pipeline" items={enterpriseNavItems} footerLinks={enterpriseFooterLinks} />}
      topbar={
        <EnterpriseTopbar
          searchPlaceholder="Search candidates, jobs, or tasks..."
          tabs={[
            { key: 'pipeline', label: 'Pipeline', href: '/pipeline', active: true },
            { key: 'sourcing', label: 'Sourcing', href: '/sourcing' },
            { key: 'referrals', label: 'Referrals', href: '/referrals' },
          ]}
          right={
            <>
              <NotificationBell />
              {canCreateApplication ? (
                <button className="os-btn-primary" type="button" onClick={() => setShowCreate((value) => !value)}>
                  {showCreate ? 'Close Form' : 'Add App'}
                </button>
              ) : null}
              {canCreateApplication ? (
                <button className="os-btn-outline" type="button" onClick={() => setShowStageCreate((value) => !value)}>
                  {showStageCreate ? 'Close Stage' : 'Add Stage'}
                </button>
              ) : null}
              <UserChip fallbackName={currentUser?.fullName || 'Marcus Thorne'} fallbackRole={String(currentUser?.role || 'Head of Talent').replace('_', ' ')} avatarSeed="pipeline-user" />
            </>
          }
        />
      }
    >
      <PageEnter>
        <div>
          <div className="os-eyebrow">Recruitment Flow</div>
          <h1 className="os-h1">{jobs.find((j) => j.id === jobFilterId)?.title || 'Recruitment'} Pipeline</h1>
        </div>

        {showCreate && canCreateApplication ? (
          <Reveal className="os-card mt-4 p-5">
            <form className="grid md:grid-cols-2 gap-3" onSubmit={onCreateApplication}>
              <div>
                <label className="text-[11px] uppercase tracking-[.12em] text-[#7b86a0]">Candidate</label>
                <select className="mt-1 h-10 w-full rounded-lg border border-[#dbe4ee] px-3 text-sm" value={applicationForm.candidateId} onChange={(event) => setApplicationForm((prev) => ({ ...prev, candidateId: event.target.value }))} required>
                  <option value="">Select candidate</option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.fullName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[.12em] text-[#7b86a0]">Job</label>
                <select className="mt-1 h-10 w-full rounded-lg border border-[#dbe4ee] px-3 text-sm" value={applicationForm.jobId} onChange={(event) => setApplicationForm((prev) => ({ ...prev, jobId: event.target.value }))} required>
                  <option value="">Select job</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>{job.title}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2 flex justify-end gap-2">
                <button className="os-btn-outline" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="os-btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Add To Pipeline'}</button>
              </div>
            </form>
          </Reveal>
        ) : null}

        {showStageCreate && canCreateApplication ? (
          <Reveal className="os-card mt-4 p-5">
            <form className="grid md:grid-cols-4 gap-3" onSubmit={onCreateStage}>
              <div>
                <label className="text-[11px] uppercase tracking-[.12em] text-[#7b86a0]">Stage Name</label>
                <input
                  className="mt-1 h-10 w-full rounded-lg border border-[#dbe4ee] px-3 text-sm"
                  value={stageForm.name}
                  onChange={(event) => setStageForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[.12em] text-[#7b86a0]">Sort Order</label>
                <input
                  className="mt-1 h-10 w-full rounded-lg border border-[#dbe4ee] px-3 text-sm"
                  type="number"
                  min="1"
                  value={stageForm.sortOrder}
                  onChange={(event) => setStageForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[.12em] text-[#7b86a0]">Job Scope</label>
                <select
                  className="mt-1 h-10 w-full rounded-lg border border-[#dbe4ee] px-3 text-sm"
                  value={stageForm.jobId}
                  onChange={(event) => setStageForm((prev) => ({ ...prev, jobId: event.target.value }))}
                >
                  <option value="">Global (all jobs)</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>{job.title}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <label className="text-sm text-[#5e6b87] flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={stageForm.isTerminal}
                    onChange={(event) => setStageForm((prev) => ({ ...prev, isTerminal: event.target.checked }))}
                  />
                  Terminal
                </label>
                <button className="os-btn-primary ml-auto" type="submit" disabled={savingStage}>
                  {savingStage ? 'Saving...' : 'Create'}
                </button>
              </div>
            </form>
          </Reveal>
        ) : null}

        {error ? <div className="mt-4 os-card p-4 text-red-600 text-sm">{error}</div> : null}
        {banner ? <div className="mt-4 os-card p-4 text-[#2454cf] text-sm">{banner}</div> : null}
        {loading ? <div className="mt-4 os-card p-4 text-sm text-[#6f7d98]">Loading pipeline...</div> : null}
        {(jobFilterId || candidateFilterId) ? (
          <div className="mt-4 os-card p-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <div className="text-[#5f6a84]">Filtered view {jobFilterId ? '(Job)' : ''} {candidateFilterId ? '(Candidate)' : ''}</div>
              <div className="flex bg-[#f2f5f8] rounded-lg p-1 gap-1">
                <button
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${viewMode === 'board' ? 'bg-white shadow-sm text-[#1f52cc]' : 'text-[#7a88a3]'}`}
                  onClick={() => setViewMode('board')}
                >
                  Board
                </button>
                <button
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${viewMode === 'table' ? 'bg-white shadow-sm text-[#1f52cc]' : 'text-[#7a88a3]'}`}
                  onClick={() => setViewMode('table')}
                >
                  Table
                </button>
              </div>
            </div>
            <button className="os-btn-outline !h-9" type="button" onClick={() => navigate('/pipeline')}>Clear Filter</button>
          </div>
        ) : (
          <div className="mt-4 flex justify-end">
            <div className="flex bg-[#f2f5f8] rounded-lg p-1 gap-1">
              <button
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${viewMode === 'board' ? 'bg-white shadow-sm text-[#1f52cc]' : 'text-[#7a88a3]'}`}
                onClick={() => setViewMode('board')}
              >
                Kanban Board
              </button>
              <button
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${viewMode === 'table' ? 'bg-white shadow-sm text-[#1f52cc]' : 'text-[#7a88a3]'}`}
                onClick={() => setViewMode('table')}
              >
                Candidate Table
              </button>
            </div>
          </div>
        )}

        {viewMode === 'board' ? (
          <div className="mt-4 overflow-x-auto pb-4">
            <div className="flex gap-4 min-w-max pb-2">
              {columns.map((column, idx) => (
                <Reveal key={column.id} delay={idx * 0.03}>
                  <div className="rounded-2xl border border-[#e2e8ef] bg-[#f6fafb] p-3 min-h-[520px] w-[320px] shrink-0 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-semibold text-sm">{column.name}</div>
                      <div className="text-xs text-[#8090ad]">{column.items.length}</div>
                    </div>
                    <div className="space-y-3">
                      {column.items.map((app) => (
                        <div key={app.id} className="os-card p-3">
                          <div className="flex items-center gap-2">
                            {app.candidate?.profilePhotoFile?.storageKey ? (
                              <img className="w-9 h-9 rounded-lg object-cover" src={app.candidate.profilePhotoFile.storageKey} alt={app.candidate?.fullName} />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-[#1f52cc] text-white flex items-center justify-center font-bold text-xs shrink-0">
                                {(app.candidate?.fullName || 'C').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 1)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <button className="text-sm font-semibold text-left w-full truncate leading-5" type="button" onClick={() => navigate(`/candidate/${app.candidate?.id || ''}`)}>
                                {app.candidate?.fullName || 'Candidate'}
                              </button>
                              <div className="text-xs text-[#7a88a3] truncate text-left">{app.job?.title || 'Role'}</div>
                            </div>
                          </div>

                          <div className="mt-3">
                            <div className="mb-2 flex items-center justify-between">
                              <span className={`text-[11px] uppercase tracking-[.1em] ${app.shortlisted ? 'text-[#218b55]' : 'text-[#7a88a3]'}`}>
                                {app.shortlisted ? 'Shortlisted' : 'Not Shortlisted'}
                              </span>
                              {canCreateApplication ? (
                                <button className="os-btn-outline !h-8 !px-2 !text-[11px]" type="button" onClick={() => onToggleShortlist(app)}>
                                  {app.shortlisted ? 'Remove' : 'Shortlist'}
                                </button>
                              ) : null}
                            </div>
                            <select
                              className="h-9 w-full rounded-lg border border-[#dbe4ee] px-2 text-xs"
                              value={selectedStages[app.id] || ''}
                              onChange={(event) => setSelectedStages((prev) => ({ ...prev, [app.id]: event.target.value }))}
                              disabled={!canMovePipeline}
                            >
                              {stages.map((stage) => (
                                <option key={stage.id} value={stage.id}>{stage.name}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="Add a remark (optional)..."
                              className="mt-2 h-9 w-full rounded-lg border border-[#dbe4ee] px-2 text-xs"
                              value={moveRemarks[app.id] || ''}
                              onChange={(event) => setMoveRemarks((prev) => ({ ...prev, [app.id]: event.target.value }))}
                              disabled={!canMovePipeline || movingId === app.id}
                            />
                            <div className="mt-2 flex gap-2">
                              {canMovePipeline ? (
                                <button className="os-btn-primary !h-9 flex-1" type="button" onClick={() => onMoveStage(app.id)} disabled={movingId === app.id}>
                                  {movingId === app.id ? 'Moving...' : 'Move'}
                                </button>
                              ) : (
                                <div className="os-btn-outline !h-9 flex-1 !justify-center !cursor-default">Read Only</div>
                              )}
                              <button className="os-btn-outline !h-9 flex-1" type="button" onClick={() => onLoadHistory(app.id)}>
                                Refresh
                              </button>
                            </div>
                          </div>

                          {(() => {
                            const displayHistory = (historyByApp[app.id] && historyByApp[app.id].length > 0)
                              ? historyByApp[app.id]
                              : (app.pipelineEvents || []);

                            if (displayHistory.length === 0) return null;

                            return (
                              <div className="mt-4 border-t border-[#edf1f6] pt-3">
                                <div className="text-[10px] uppercase tracking-widest font-bold text-[#8b95ad] mb-2 px-1">Journey History</div>
                                <div className="space-y-3 max-h-[160px] overflow-y-auto px-1 pr-2 thin-scrollbar">
                                  {displayHistory.map((item, hIdx) => (
                                    <div key={hIdx} className="relative pl-3 before:absolute before:left-0 before:top-1.5 before:bottom-0 before:w-0.5 before:bg-[#e2e8f0]">
                                      <div className="text-[10px] font-bold text-[#1f52cc]">
                                        {item.toStage?.name || 'Next Stage'}
                                      </div>
                                      <div className="text-[10px] text-[#5e6a85] mt-1 leading-relaxed">
                                        {item.remark || 'No remark provided'}
                                      </div>
                                      <div className="text-[9px] text-[#abb5cc] mt-1 flex justify-between">
                                        <span>{item.movedBy?.fullName || 'System'}</span>
                                        <span>{new Date(item.movedAt || item.at).toLocaleDateString()}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                      {column.items.length === 0 ? <div className="text-xs os-muted">No applications.</div> : null}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        ) : (
          <Reveal className="os-card mt-4 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f8fafc] text-[#7a88a3] text-[11px] uppercase tracking-[.15em] border-b border-[#e2e8f0]">
                <tr>
                  <th className="px-5 py-3">Candidate</th>
                  <th className="px-5 py-3">Current Stage</th>
                  <th className="px-5 py-3">Job Title</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr key={app.id} className="border-b border-[#f1f5f9] hover:bg-[#f9fafb] transition-colors">
                    <td className="px-5 py-4 font-semibold text-[#101c43]">{app.candidate?.fullName}</td>
                    <td className="px-5 py-4">
                      <span className="bg-[#ebf3ff] text-[#1f52cc] px-2 py-1 rounded-md font-medium text-xs">
                        {app.currentStage?.name || 'Unassigned'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[#5e6b86]">{app.job?.title}</td>
                    <td className="px-5 py-4">
                      <button className="os-btn-outline !h-8 !px-3" onClick={() => navigate(`/candidate/${app.candidate?.id}`)}>View Profile</button>
                    </td>
                  </tr>
                ))}
                {applications.length === 0 ? (
                  <tr>
                    <td className="px-5 py-10 text-center os-muted" colSpan={4}>No applications currently in this pipeline view.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Reveal>
        )}
      </PageEnter>
    </EnterpriseLayout>
  );
};

export default Pipeline;
