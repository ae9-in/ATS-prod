import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { hasToken } from '../lib/api';

const earthImage =
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1800&q=80";

const SignupPage = () => {
  const navigate = useNavigate();
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    role: 'RECRUITER',
    accepted: false,
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('First name and last name are required.');
      return;
    }
    if (!form.email.trim()) {
      setError('Email is required.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!form.accepted) {
      setError('Please accept the service protocol.');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${apiBaseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          password: form.password,
          role: form.role,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'Signup failed');
      }

      setSuccess('Registration successful. Redirecting to login...');
      setTimeout(() => navigate('/login'), 1100);
    } catch (err) {
      setError(err.message || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      <motion.section
        className="relative hidden lg:block overflow-hidden"
        initial={{ backgroundPosition: 'center 42%' }}
        animate={{ backgroundPosition: ['center 42%', 'center 56%', 'center 42%'] }}
        transition={{ duration: 42, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          backgroundImage:
            `linear-gradient(135deg, rgba(5, 29, 91, 0.96), rgba(20, 61, 182, 0.88)), url('${earthImage}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 42%',
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(120,160,255,.2),transparent_45%)]" />

        <div className="absolute inset-0 pointer-events-none">
          {[0, 1, 2, 3, 4].map((idx) => (
            <motion.span
              key={idx}
              className="absolute w-2 h-2 rounded-full bg-[#bdd2ff]/70"
              style={{ left: `${14 + idx * 15}%`, top: `${22 + (idx % 3) * 17}%` }}
              animate={{ y: [0, -10, 0], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 7 + idx, repeat: Infinity, ease: 'easeInOut' }}
            />
          ))}
        </div>

        <div className="relative z-10 h-full p-16 text-white flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-12">
            <div className="h-10 w-10 rounded-lg bg-white text-[#1f52cc] flex items-center justify-center">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>hub</span>
            </div>
            <div className="text-5xl font-bold font-[Manrope]">ATS</div>
          </div>

          <h1 className="text-6xl leading-[1.1] font-bold font-[Manrope] max-w-xl">
            Build your <span className="text-[#b8c9ff]">recruitment workspace</span> in minutes.
          </h1>

          <p className="mt-6 text-xl text-[#d7e2ff] max-w-xl leading-relaxed">
            Collaborate in a high-performance hiring platform designed for modern recruiting teams.
          </p>

          <div className="grid grid-cols-2 gap-4 mt-10 max-w-xl">
            <div className="rounded-2xl border border-white/20 bg-white/10 p-5">
              <div className="text-4xl font-bold">Role Based</div>
              <div className="text-sm text-[#ccdaff] mt-1">Secure Access</div>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 p-5">
              <div className="text-4xl font-bold">E2E</div>
              <div className="text-sm text-[#ccdaff] mt-1">Hiring Workflows</div>
            </div>
          </div>
        </div>
      </motion.section>

      <section className="flex items-center justify-center p-6 md:p-12 relative">
        <button
          className="absolute top-6 left-6 md:top-8 md:left-8 flex items-center gap-1 text-sm text-[#5d6784] hover:text-[#1f4bc6] transition-colors"
          type="button"
          onClick={() => navigate('/')}
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span> Home
        </button>
        <form className="w-full max-w-md" onSubmit={onSubmit}>
          <h2 className="text-5xl font-bold text-[#121a33] font-[Manrope]">Create Account</h2>
          <p className="mt-3 text-lg text-[#5d6784]">
            Start your journey and access your ATS workspace.
          </p>

          {hasToken() ? (
            <div className="mt-6 p-4 rounded-xl border border-[#dbe4ee] bg-[#f8fbff] text-center">
              <p className="text-sm text-[#0f1b3d] font-semibold mb-2">You already have an active session</p>
              <button className="os-btn-primary w-full h-11 text-base flex justify-center items-center gap-2" type="button" onClick={() => navigate('/dashboard')}>
                Continue to Dashboard <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <input
              className="h-12 rounded-xl border border-[#e2e8ef] bg-[#f3f6f8] px-4 text-sm"
              placeholder="First Name"
              value={form.firstName}
              onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))}
            />
            <input
              className="h-12 rounded-xl border border-[#e2e8ef] bg-[#f3f6f8] px-4 text-sm"
              placeholder="Last Name"
              value={form.lastName}
              onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))}
            />
          </div>

          <div className="mt-4 space-y-4">
            <input
              className="w-full h-12 rounded-xl border border-[#e2e8ef] bg-[#f3f6f8] px-4 text-sm"
              placeholder="Email Address"
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
            <input
              className="w-full h-12 rounded-xl border border-[#e2e8ef] bg-[#f3f6f8] px-4 text-sm"
              placeholder="Phone (optional)"
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
            <div className="grid grid-cols-1 gap-3">
              <input
                className="h-12 rounded-xl border border-[#e2e8ef] bg-[#f3f6f8] px-4 text-sm"
                placeholder="Password"
                type="password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-sm text-[#4f5a77]">
            <input type="checkbox" checked={form.accepted} onChange={(event) => setForm((prev) => ({ ...prev, accepted: event.target.checked }))} />
            I agree to the service protocol
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="mt-3 text-sm text-green-600">{success}</p> : null}

          <button className="os-btn-primary w-full mt-5 h-12 text-base disabled:opacity-70" type="submit" disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>

          <div className="mt-6 text-center text-sm text-[#606b87]">
            Already have access? <a className="text-[#1f4bc6] font-semibold" href="/login">Sign in</a>
          </div>

          <div className="mt-10 flex justify-center gap-6 text-xs text-[#9aa3b8]">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Security</a>
          </div>
        </form>
      </section>
    </div>
  );
};

export default SignupPage;
