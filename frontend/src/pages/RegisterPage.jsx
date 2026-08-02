import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const FIELDS = [
  { key: 'username',        label: 'Username',         type: 'text',     placeholder: 'e.g. rohit_45',    auto: 'username'    },
  { key: 'email',           label: 'Email address',    type: 'email',    placeholder: 'you@example.com',  auto: 'email'       },
  { key: 'password',        label: 'Password',         type: 'password', placeholder: 'Min. 6 characters',auto: 'new-password', toggle: true },
  { key: 'confirmPassword', label: 'Confirm password', type: 'password', placeholder: 'Re-enter password',auto: 'new-password', toggle: true },
];

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate     = useNavigate();

  const [form, setForm]        = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [shown, setShown]      = useState({ password: false, confirmPassword: false });
  const [errors, setErrors]    = useState({});
  const [serverErr, setSrvErr] = useState('');
  const [loading, setLoading]  = useState(false);

  const validate = () => {
    const e = {};
    if (!form.username.trim())                e.username        = 'Username is required';
    else if (form.username.trim().length < 3) e.username        = 'Min. 3 characters';
    if (!form.email)                          e.email           = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email';
    if (!form.password)                       e.password        = 'Password is required';
    else if (form.password.length < 6)        e.password        = 'Min. 6 characters';
    if (!form.confirmPassword)                e.confirmPassword = 'Please confirm';
    else if (form.password !== form.confirmPassword) e.confirmPassword = "Passwords don't match";
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fieldErrors = validate();
    if (Object.keys(fieldErrors).length) { setErrors(fieldErrors); return; }
    setErrors({}); setSrvErr(''); setLoading(true);
    try {
      await register(form.username, form.email, form.password);
      navigate('/');
    } catch (err) {
      setSrvErr(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const set = (field) => (e) => {
    setForm(f => ({ ...f, [field]: e.target.value }));
    if (errors[field]) setErrors(err => ({ ...err, [field]: '' }));
    setSrvErr('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">

      <div className="absolute inset-0 pointer-events-none"
           style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(0,255,102,0.055) 0%, transparent 70%)' }} />

      <div className="relative z-10 w-full max-w-[360px]">

        {/* Logomark + heading */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-10 h-10 rounded-xl bg-neon flex items-center justify-center mb-5"
               style={{ boxShadow: '0 0 0 1px rgba(0,255,102,0.22), 0 0 28px rgba(0,255,102,0.16)' }}>
            <svg className="w-5 h-5 text-black" viewBox="0 0 20 20" fill="none">
              <path d="M13 3L3 13l2 2 2.5-2.5 4 4 2-2-4-4 2.5-2.5L13 3z" fill="currentColor"/>
              <circle cx="16.5" cy="16.5" r="2" fill="currentColor"/>
            </svg>
          </div>
          <h1 className="text-[22px] font-bold text-white tracking-tight">Create account</h1>
          <p className="text-sm text-white/40 mt-1.5">Join IPL Auction 2025</p>
        </div>

        {/* Form card */}
        <div className="card p-6 space-y-4"
             style={{ boxShadow: 'inset 0 1px 0 rgb(var(--fg) / 0.04), 0 0 60px rgb(var(--shadow) / 0.5)' }}>

          {serverErr && (
            <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[13px]"
                 style={{ background: 'rgb(var(--bid-red) / 0.07)', border: '1px solid rgb(var(--bid-red) / 0.18)', color: 'rgb(var(--bid-red))' }}>
              <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
              </svg>
              {serverErr}
            </div>
          )}

          {FIELDS.map(({ key, label, type, placeholder, auto, toggle }) => (
            <div key={key} className="space-y-1.5">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-white/35">
                {label}
              </label>
              <div className="relative">
                <input
                  type={toggle && shown[key] ? 'text' : type}
                  value={form[key]}
                  onChange={set(key)}
                  placeholder={placeholder}
                  autoComplete={auto}
                  style={toggle ? { paddingRight: '52px' } : {}}
                  className={`field${errors[key] ? ' error' : ''}`}
                />
                {toggle && (
                  <button type="button" onClick={() => setShown(s => ({ ...s, [key]: !s[key] }))}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-medium
                               text-white/30 hover:text-white/60 transition-colors uppercase tracking-wide select-none">
                    {shown[key] ? 'Hide' : 'Show'}
                  </button>
                )}
              </div>
              {errors[key] && <p className="text-[11px] mt-1" style={{ color: '#FF3355' }}>{errors[key]}</p>}
            </div>
          ))}

          <div className="pt-1">
            <button onClick={handleSubmit} disabled={loading} className="btn-cta">
              {loading && (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              )}
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </div>
        </div>

        <p className="text-center mt-5 text-[13px] text-white/30">
          Already have an account?{' '}
          <Link to="/login" className="text-neon hover:text-neon/75 font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
