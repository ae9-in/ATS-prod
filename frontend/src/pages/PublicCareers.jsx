import React, { useEffect, useState } from 'react';
import { PageEnter, Reveal } from '../components/PageMotion';
import AntiGravityEngine from '../components/AntiGravityEngine';
import { apiGet } from '../lib/api';

const fallbackJobs = [
  { title: 'Systems Architect', department: 'Engineering', location: 'Palo Alto', employmentType: 'Full-time' },
  { title: 'UX Research Lead', department: 'Design', location: 'Remote', employmentType: 'Contract' },
];

const PublicCareers = () => {
  const [jobs, setJobs] = useState(fallbackJobs);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await apiGet('/jobs/public');
        if (!mounted) return;
        if (Array.isArray(res.data) && res.data.length > 0) {
          setJobs(res.data);
        }
      } catch (_) {
        // Keep fallback list for public view if API is unavailable.
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="bg-[#f3f7f8] text-[#102047] min-h-screen">
      <PageEnter>
        <header className="relative h-[60vh] min-h-[420px] flex items-center justify-center overflow-hidden bg-[#0B1B3D]">
          <div className="absolute inset-0 opacity-35"><AntiGravityEngine /></div>
          <div className="relative z-10 text-center px-6">
            <span className="text-[11px] font-semibold text-blue-300 uppercase tracking-[0.28em]">Join the Nexus</span>
            <h1 className="mt-4 text-5xl md:text-7xl font-bold text-white font-[Manrope] leading-[1.05]">Build the Future of<br />Human Capital</h1>
            <p className="mt-4 text-blue-100 text-base max-w-2xl mx-auto">Explore open roles and join the next generation of talent intelligence.</p>
          </div>
        </header>

        <main className="max-w-6xl mx-auto py-14 px-6">
          <Reveal><div className="flex flex-col md:flex-row items-end justify-between gap-6 border-b border-[#dbe4ee] pb-8"><div><h2 className="text-4xl font-bold font-[Manrope]">Available Requisitions</h2><p className="text-[#6f7d98] text-sm mt-1">Showing {jobs.length} active roles</p></div></div></Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
            {jobs.map((job, i) => (
              <Reveal key={`${job.title}-${i}`} delay={i * 0.06}>
                <div className="bg-white p-6 rounded-2xl border border-[#e3eaf2] shadow-sm hover:shadow-lg transition-shadow">
                  <span className="px-3 py-1 bg-[#edf2fb] text-[11px] font-semibold text-[#5c6f97] uppercase tracking-[.08em] rounded-lg inline-block">{job.department || 'General'}</span>
                  <h3 className="text-2xl font-semibold font-[Manrope] mt-4">{job.title}</h3>
                  <div className="flex items-center gap-4 text-xs text-[#74839f] uppercase tracking-[.08em] mt-4"><span className="flex items-center gap-1"><span className="material-symbols-outlined text-base">location_on</span>{job.location || 'Remote'}</span><span className="flex items-center gap-1"><span className="material-symbols-outlined text-base">schedule</span>{job.employmentType || 'Full-time'}</span></div>
                  <button className="os-btn-primary w-full mt-6">View Details</button>
                </div>
              </Reveal>
            ))}
          </div>
        </main>

        <footer className="bg-white border-t border-[#e3eaf2] py-12 px-6"><div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-[#0B1B3D] rounded-xl flex items-center justify-center text-white"><span className="material-symbols-outlined">dataset</span></div><h2 className="text-xl font-bold font-[Manrope]">ATS</h2></div><p className="text-[#7a88a3] text-sm">(c) 2026 Nexus Infrastructure. All nodes synchronized.</p></div></footer>
      </PageEnter>
    </div>
  );
};

export default PublicCareers;
