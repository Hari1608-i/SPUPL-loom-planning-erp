import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Lock, User, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';

const QUOTES = [
  {
    text: "Every thread counts — in weaving and in planning.",
    author: "Textile Wisdom"
  },
  {
    text: "A loom in motion is a factory alive. Keep the rhythm going.",
    author: "Weaving Philosophy"
  },
  {
    text: "Quality fabric begins with a perfect warp. Quality output begins with smart planning.",
    author: "SPUPL Principle"
  },
  {
    text: "The strength of the fabric lies in the precision of each interlaced thread.",
    author: "Textile Craft"
  },
  {
    text: "Efficiency on the loom is efficiency in the business.",
    author: "Manufacturing Insight"
  },
];

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [quoteFade, setQuoteFade] = useState(true);
  const { login } = useAuth();
  const navigate = useNavigate();

  /* Rotate quotes every 4 seconds with fade */
  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteFade(false);
      setTimeout(() => {
        setQuoteIndex(i => (i + 1) % QUOTES.length);
        setQuoteFade(true);
      }, 500);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
      } else {
        login(data.token, data.user);
        if (data.user.role === 'ADMINISTRATOR' || data.user.role === 'ADMIN') navigate('/');
        else if (data.user.role === 'PLANNING_MANAGER') navigate('/plan');
        else if (data.user.role === 'PRODUCTION_MANAGER') navigate('/');
        else if (data.user.role === 'WARPING') navigate('/beam-stock');
        else if (data.user.role === 'SIZING') navigate('/sizing');
        else navigate('/');
      }
    } catch (err) {
      setError('Unable to connect to server. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex w-full font-sans relative overflow-hidden">

      {/* â”€â”€ Left Panel: Loom Background + Branding â”€â”€ */}
      <div className="hidden lg:flex w-[45%] flex-col justify-between relative overflow-hidden">

        {/* Loom background photo */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url("/loom_bg.png")' }}
        />

        {/* Dark gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/90 via-indigo-900/80 to-slate-900/85" />

        {/* Subtle animated thread-pattern overlay */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `repeating-linear-gradient(
              0deg, transparent, transparent 4px, rgba(255,255,255,0.6) 4px, rgba(255,255,255,0.6) 5px
            ), repeating-linear-gradient(
              90deg, transparent, transparent 8px, rgba(255,255,255,0.3) 8px, rgba(255,255,255,0.3) 9px
            )`,
            backgroundSize: '9px 5px',
            animation: 'threadSlide 20s linear infinite'
          }}
        />

        {/* Top: Logo + Brand */}
        <div className="relative z-10 p-12 pt-14">
          <div className="mb-10">
            <div className="bg-white p-3 rounded-2xl shadow-2xl inline-block max-w-full">
              <img src="/logo.png" alt="Santhi Processing Unit Logo" className="h-12 w-auto object-contain" />
            </div>
          </div>

          <h2 className="text-5xl font-black text-white leading-tight">
            SPUPL <span className="text-indigo-400">LOOM</span><br />
            <span className="text-indigo-300">SYSTEM</span>
          </h2>

          <div className="mt-5 flex items-start gap-3">
            <div className="w-1 h-14 bg-indigo-400 rounded-full flex-shrink-0 mt-1" />
            <p className="text-indigo-100 text-base font-medium leading-relaxed">
              Production Planning &amp; Loom Management
            </p>
          </div>

          {/* Stats row */}
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              { label: 'Looms', value: 'Live' },
              { label: 'Planning', value: 'Smart' },
              { label: 'Reports', value: 'Real-time' },
            ].map(s => (
              <div key={s.label} className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10">
                <div className="text-xs font-black uppercase text-indigo-300 tracking-widest">{s.label}</div>
                <div className="text-sm font-bold text-white mt-1">{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: Rotating Quotes */}
        <div className="relative z-10 p-12 pb-14">
          {/* Decorative loom icon */}
          <div className="mb-6 flex gap-1">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-8 w-0.5 rounded-full"
                style={{
                  backgroundColor: `hsl(${220 + i * 15}, 80%, ${60 + i * 5}%)`,
                  opacity: 0.7 + i * 0.05
                }}
              />
            ))}
            <div className="ml-2 text-indigo-300 text-xs font-bold uppercase tracking-widest self-end pb-1">
              Weaving Wisdom
            </div>
          </div>

          <div
            style={{
              transition: 'opacity 0.5s ease, transform 0.5s ease',
              opacity: quoteFade ? 1 : 0,
              transform: quoteFade ? 'translateY(0)' : 'translateY(8px)'
            }}
          >
            <p className="text-white text-xl font-light italic leading-relaxed">
              "{QUOTES[quoteIndex].text}"
            </p>
            <p className="text-indigo-400 text-sm font-bold mt-3 tracking-wider">
              — {QUOTES[quoteIndex].author}
            </p>
          </div>

          {/* Quote dots */}
          <div className="flex gap-2 mt-5">
            {QUOTES.map((_, i) => (
              <button
                key={i}
                onClick={() => { setQuoteIndex(i); setQuoteFade(true); }}
                className={`rounded-full transition-all duration-300 ${i === quoteIndex
                    ? 'w-6 h-2 bg-indigo-400'
                    : 'w-2 h-2 bg-white/30 hover:bg-white/50'
                  }`}
              />
            ))}
          </div>

          <p className="text-indigo-500 text-[11px] mt-6 font-medium">
            Developed by Hariprakash M (DEP of Planning)
          </p>
        </div>
      </div>

      {/* —— Right Panel: Login Form —— */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 lg:p-16 relative bg-gradient-to-br from-slate-50 via-white to-indigo-50">

        {/* Subtle background texture */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 80%, rgba(99,102,241,0.08) 0%, transparent 50%),
                              radial-gradient(circle at 80% 20%, rgba(99,102,241,0.06) 0%, transparent 50%)`
          }}
        />

        {/* Mobile logo (shown only on small screens) */}
        <div className="lg:hidden flex items-center justify-center mb-8">
          <div className="bg-white p-2 rounded-2xl shadow-md">
            <img src="/logo.png" alt="Santhi Processing Unit Logo" className="h-10 w-auto object-contain" />
          </div>
        </div>

        {/* Card */}
        <div className="w-full max-w-md bg-white rounded-3xl shadow-[0_20px_60px_rgba(99,102,241,0.12)] border border-slate-100/80 p-10 relative z-10">

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-50 rounded-2xl mb-4">
              <Lock className="w-6 h-6 text-indigo-600" />
            </div>
            <h3 className="text-3xl font-black text-slate-800 tracking-tight">Welcome Back</h3>
            <p className="text-slate-500 mt-2 text-sm font-medium">Sign in to your SPUPL dashboard</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-bold text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-700 placeholder:text-slate-400 text-sm"
                  placeholder="Enter your username"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-700 placeholder:text-slate-400 text-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-indigo-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 accent-indigo-600" />
                <span className="text-sm font-medium text-slate-600 group-hover:text-slate-800 transition-colors">Remember Me</span>
              </label>
              <button type="button" className="text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
                Forgot Password?
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-black text-sm tracking-wide shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all duration-200 mt-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Authenticating...
                </>
              ) : (
                'Login to System'
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">
              System Version 1.0
            </span>
          </div>
        </div>
      </div>

      {/* Animations */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes threadSlide {
          from { background-position: 0 0; }
          to   { background-position: 9px 5px; }
        }
      `}} />
    </div>
  );
}
