import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Mail,
  Lock,
  User,
  Phone,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowLeft,
  X,
  KeyRound,
  RotateCcw
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';

interface AuthPageProps {
  onBack?: () => void;
  initialMode?: 'login' | 'signup';
}

export default function AuthPage({ onBack, initialMode = 'login' }: AuthPageProps) {
  const { user, signInWithGoogle } = useAuth();
  
  // View Modes: 'login' | 'signup'
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  
  // Forgot Password Modal State
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // UX & Security States
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Rate Limiting (5 failed logins -> 60-second cooldown)
  const [failedLoginAttempts, setFailedLoginAttempts] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // Referral verification state
  const [referralStatus, setReferralStatus] = useState<{
    state: 'idle' | 'checking' | 'valid' | 'invalid';
    ownerName?: string;
  }>({ state: 'idle' });

  // Handle URL redirect query parameter if present
  const getRedirectPath = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('redirect') || null;
    } catch {
      return null;
    }
  };

  // Redirect logged-in users away from /auth to the dashboard
  useEffect(() => {
    if (user) {
      const redirectUrl = getRedirectPath();
      if (redirectUrl && redirectUrl.startsWith('/')) {
        window.location.href = redirectUrl;
      } else if (onBack) {
        onBack();
      }
    }
  }, [user, onBack]);

  // Load remembered email on mount
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('norodata_remembered_email');
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    } catch {}
  }, []);

  // Check URL for prefilled referral code (e.g. ?ref=NORODATA-ABCDE)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (ref) {
        setReferralCode(ref.toUpperCase().trim());
        setMode('signup');
        toast.success('Referral code applied from invite link!');
      }
    } catch {}
  }, []);

  // Cooldown Countdown Timer
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  // Debounced Referral Code Verification
  useEffect(() => {
    const trimmed = referralCode.trim().toUpperCase();
    if (!trimmed || mode !== 'signup') {
      setReferralStatus({ state: 'idle' });
      return;
    }

    // Validate format before checking database
    const formatRegex = /^NORODATA-[A-Za-z0-9]{3,10}$/i;
    if (!formatRegex.test(trimmed)) {
      setReferralStatus({ state: 'invalid' });
      return;
    }

    setReferralStatus({ state: 'checking' });
    const timer = setTimeout(async () => {
      try {
        const { data: refProfile } = await supabase
          .from('profiles')
          .select('full_name, name')
          .eq('referral_code', trimmed)
          .maybeSingle();

        if (refProfile) {
          setReferralStatus({
            state: 'valid',
            ownerName: refProfile.full_name || refProfile.name || 'NORODATA Member',
          });
        } else {
          setReferralStatus({ state: 'invalid' });
        }
      } catch {
        setReferralStatus({ state: 'idle' });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [referralCode, mode]);

  // Password Strength Calculation (Min 8 chars, numbers, uppercase, symbols)
  const calculatePasswordStrength = (pwd: string) => {
    if (!pwd) return { score: 0, label: 'None', color: 'bg-slate-200', width: 'w-0' };
    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (pwd.length >= 12) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    if (score <= 2) return { score: 1, label: 'Weak (min 8 chars required)', color: 'bg-rose-500', width: 'w-1/4' };
    if (score === 3) return { score: 2, label: 'Fair', color: 'bg-amber-500', width: 'w-2/4' };
    if (score === 4) return { score: 3, label: 'Strong', color: 'bg-emerald-500', width: 'w-3/4' };
    return { score: 4, label: 'Bank-Grade 🔐', color: 'bg-[#3B7A3B]', width: 'w-full' };
  };

  const passwordStrength = calculatePasswordStrength(password);

  // Validate Nigerian Phone Format
  const validateNigerianPhone = (num: string): boolean => {
    const clean = num.replace(/\s+/g, '');
    // 080..., 081..., 090..., 091..., 070... (11 digits) or +234... / 234...
    return /^(?:\+234|234|0)[789][01]\d{8}$/.test(clean);
  };

  // Profile Initialization Helper
  const initializeProfileRecord = async (
    uid: string,
    userEmail: string,
    name: string,
    userPhone: string,
    referrerUid?: string | null
  ) => {
    try {
      const generatedCode = `NORODATA-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      const { data: existing } = await supabase
        .from('profiles')
        .select('wallet_balance, balance, referral_code, full_name')
        .eq('id', uid)
        .maybeSingle();

      const existingBalance = existing
        ? Number(existing.wallet_balance ?? existing.balance ?? 0)
        : 0;
      const refCodeToSave = existing?.referral_code || generatedCode;

      await supabase.from('profiles').upsert(
        {
          id: uid,
          email: userEmail.toLowerCase().trim(),
          full_name: name || existing?.full_name || 'User',
          username: userEmail.split('@')[0],
          phone_number: userPhone || '',
          referral_code: refCodeToSave,
          wallet_balance: existingBalance,
          balance: existingBalance,
          available_balance: existingBalance,
          referred_by: referrerUid || null,
        },
        { onConflict: 'id' }
      );
    } catch (err: any) {
      // Do not block login/signup flow if profiles upsert throws a warning
    }
  };

  // Handle Login / Sign Up Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    // Rate-limit check
    if (cooldownRemaining > 0) {
      setAuthError(`Too many failed login attempts. Please wait ${cooldownRemaining}s before trying again.`);
      return;
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        // --- LOGIN FLOW ---
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

        if (error) {
          const nextAttempts = failedLoginAttempts + 1;
          setFailedLoginAttempts(nextAttempts);

          if (nextAttempts >= 5) {
            setCooldownRemaining(60);
            setAuthError('Too many failed login attempts. For your security, account login is paused for 60 seconds.');
          } else {
            // Human-friendly, non-technical error message as required
            setAuthError('Email or password is incorrect. Please check your credentials and try again.');
          }
          setLoading(false);
          return;
        }

        // Reset failed login attempts on success
        setFailedLoginAttempts(0);

        // Remember me logic
        if (rememberMe) {
          localStorage.setItem('norodata_remembered_email', email.trim());
        } else {
          localStorage.removeItem('norodata_remembered_email');
        }

        if (data.user) {
          await initializeProfileRecord(
            data.user.id,
            data.user.email || '',
            data.user.user_metadata?.full_name || data.user.user_metadata?.name || 'User',
            ''
          );
        }

        toast.success('Welcome back to NORODATA!');
        const redirectPath = getRedirectPath();
        if (redirectPath && redirectPath.startsWith('/')) {
          window.location.href = redirectPath;
        } else if (onBack) {
          onBack();
        }

      } else {
        // --- SIGN UP FLOW ---
        if (!fullName.trim()) {
          throw new Error('Please enter your full name.');
        }

        if (!validateNigerianPhone(phone)) {
          throw new Error('Please enter a valid 11-digit Nigerian phone number (e.g. 08012345678 or +2348012345678).');
        }

        if (password.length < 8) {
          throw new Error('Password must be at least 8 characters long.');
        }

        if (password !== confirmPassword) {
          throw new Error('Password and Confirm Password do not match.');
        }

        if (!agreeTerms) {
          throw new Error('You must agree to the Terms of Service and Privacy Policy to continue.');
        }

        // Validate Referral Code if entered
        let verifiedReferrerUid: string | null = null;
        if (referralCode.trim()) {
          const cleanRef = referralCode.trim().toUpperCase();
          const formatRegex = /^NORODATA-[A-Za-z0-9]{3,10}$/i;
          if (!formatRegex.test(cleanRef)) {
            throw new Error('Invalid referral code format. It should look like NORODATA-XXXXX.');
          }

          const { data: refUser } = await supabase
            .from('profiles')
            .select('id')
            .eq('referral_code', cleanRef)
            .maybeSingle();

          if (!refUser) {
            throw new Error(`The referral code "${cleanRef}" does not exist. Please check or leave blank.`);
          }
          verifiedReferrerUid = refUser.id;
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            data: {
              full_name: fullName.trim(),
              phone_number: phone.trim(),
              referral_code: referralCode.trim().toUpperCase(),
            },
          },
        });

        if (error) {
          throw new Error(error.message || 'Failed to create your account. Please try again.');
        }

        if (data.user) {
          await initializeProfileRecord(
            data.user.id,
            data.user.email || '',
            fullName.trim(),
            phone.trim(),
            verifiedReferrerUid
          );
        }

        toast.success('Account created successfully! Welcome to NORODATA.');
        const redirectPath = getRedirectPath();
        if (redirectPath && redirectPath.startsWith('/')) {
          window.location.href = redirectPath;
        } else if (onBack) {
          onBack();
        }
      }
    } catch (err: any) {
      setAuthError(err.message || 'An unexpected authentication error occurred.');
    } finally {
      setLoading(false);
    }
  };

  // Google OAuth Login
  const handleGoogleAuth = async () => {
    setAuthError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setAuthError('Google sign in failed. Please try with email and password.');
      setLoading(false);
    }
  };

  // Forgot Password Request (Uniform response to prevent user enumeration)
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;

    setForgotLoading(true);
    setForgotMessage(null);

    try {
      await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${window.location.origin}/auth?reset=true`,
      });
    } catch {
      // Intentionally swallowed error to preserve uniform response
    } finally {
      setForgotLoading(false);
      // Uniform security message: Never reveal whether email exists in database
      setForgotMessage(
        'If an account is associated with this email address, a password reset link has been sent. Please check your inbox and spam folder.'
      );
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center font-sans antialiased selection:bg-[#3B7A3B] selection:text-white" style={{ backgroundColor: '#EDEDE9' }}>
      
      {/* Top Mobile Brand Bar */}
      <div className="lg:hidden p-4 flex items-center justify-between border-b border-[#E2E2DC] bg-white">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-[#3B7A3B]"
          aria-label="Back to home"
        >
          <ArrowLeft size={16} />
          <span>Back to Home</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#132613] flex items-center justify-center">
            <span className="text-xs font-black text-[#B5D430]">N</span>
          </div>
          <span className="font-black text-slate-900 text-sm">NORODATA</span>
        </div>
      </div>

      <div className="max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <div className="bg-white rounded-3xl border border-[#E2E2DC] shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[640px]">
          
          {/* ========================================================================= */}
          {/* DESKTOP LEFT PANEL: Brand & 3 Benefits */}
          {/* ========================================================================= */}
          <div 
            className="hidden lg:flex lg:col-span-5 p-10 text-white flex-col justify-between relative overflow-hidden"
            style={{ backgroundColor: '#132613' }}
          >
            {/* Background ambient lighting */}
            <div className="absolute top-0 right-0 w-60 h-60 bg-[#3B7A3B]/30 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-60 h-60 bg-[#B5D430]/15 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 space-y-6">
              
              {/* Back to Home Link */}
              {onBack && (
                <button
                  onClick={onBack}
                  className="flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white transition-colors group mb-4"
                >
                  <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                  <span>Return to Home</span>
                </button>
              )}

              {/* Brand Logo */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#3B7A3B] flex items-center justify-center shadow-md">
                  <span className="text-2xl font-black text-[#B5D430]">N</span>
                </div>
                <div>
                  <h3 className="text-2xl font-black tracking-tight text-white">NORODATA</h3>
                  <p className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">
                    Instant Recharge & Utility Bills
                  </p>
                </div>
              </div>

              {/* Headline & Value Proposition */}
              <div className="pt-4 space-y-2">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                  One Unified Wallet for All Nigerian Utilities.
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Join smart vendors and individual subscribers enjoying discounted data, automated airtime, and zero failed transactions.
                </p>
              </div>

              {/* 3 Core Benefits */}
              <div className="pt-6 space-y-4">
                
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-[#B5D430] flex-shrink-0 mt-0.5">
                    <Zap size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white">Wholesale Rates & Discounts</h4>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      Save significantly on data bundles and get cash discounts on every airtime recharge.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-[#B5D430] flex-shrink-0 mt-0.5">
                    <RotateCcw size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white">Automated Wallet Refund</h4>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      Failsafe server engine automatically credits 100% of your funds if a network fails.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-[#B5D430] flex-shrink-0 mt-0.5">
                    <ShieldCheck size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white">Instant Monnify Auto-Funding</h4>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      Personal dedicated bank account for instant 24/7 wallet top-ups with zero delays.
                    </p>
                  </div>
                </div>

              </div>

            </div>

            {/* Bottom Networks Pill Bar */}
            <div className="relative z-10 pt-6 border-t border-white/10 flex items-center justify-between text-[11px] font-bold text-slate-400">
              <span>MTN • GLO • Airtel • 9mobile</span>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> 99.9% Uptime
              </span>
            </div>

          </div>

          {/* ========================================================================= */}
          {/* RIGHT PANEL: Auth Tabs & Form */}
          {/* ========================================================================= */}
          <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center">
            
            <div className="max-w-md w-full mx-auto space-y-6">
              
              {/* Tab Toggle between Sign In and Sign Up */}
              <div className="bg-[#EDEDE9] p-1 rounded-2xl flex border border-[#E2E2DC]">
                <button
                  type="button"
                  onClick={() => { setMode('login'); setAuthError(null); }}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all",
                    mode === 'login'
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                  aria-selected={mode === 'login'}
                  role="tab"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('signup'); setAuthError(null); }}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all",
                    mode === 'signup'
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                  aria-selected={mode === 'signup'}
                  role="tab"
                >
                  Create Account
                </button>
              </div>

              {/* Heading */}
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                  {mode === 'login' ? 'Sign In to Your Account' : 'Open Your Free Account'}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {mode === 'login'
                    ? 'Enter your email and password to access your NORODATA wallet.'
                    : 'Get started in under one minute with wholesale recharge rates.'}
                </p>
              </div>

              {/* Accessible Error Message Announcement */}
              {authError && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-start gap-2.5"
                >
                  <AlertCircle size={16} className="text-rose-600 flex-shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              {/* Rate-Limit Cooldown Alert */}
              {cooldownRemaining > 0 && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-semibold flex items-center gap-2.5"
                >
                  <Clock size={16} className="text-amber-600 flex-shrink-0 animate-spin" />
                  <span>Too many failed logins. Please wait {cooldownRemaining}s before retrying.</span>
                </div>
              )}

              {/* Auth Form */}
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                
                {/* Sign-up specific fields */}
                {mode === 'signup' && (
                  <>
                    {/* Full Name */}
                    <div>
                      <label 
                        htmlFor="signup-name" 
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        Full Name <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          id="signup-name"
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g. Ibrahim Faruq"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E2DC] text-xs sm:text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#3B7A3B] focus:border-transparent transition-all"
                        />
                      </div>
                    </div>

                    {/* Nigerian Phone Number */}
                    <div>
                      <label 
                        htmlFor="signup-phone" 
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        Nigerian Phone Number <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          id="signup-phone"
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="08012345678 or +234..."
                          className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E2DC] text-xs sm:text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#3B7A3B] focus:border-transparent transition-all"
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        11 digits starting with 0, or international +234 format.
                      </p>
                    </div>
                  </>
                )}

                {/* Email Address */}
                <div>
                  <label 
                    htmlFor={mode === 'login' ? 'login-email' : 'signup-email'}
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id={mode === 'login' ? 'login-email' : 'signup-email'}
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E2DC] text-xs sm:text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#3B7A3B] focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label 
                      htmlFor={mode === 'login' ? 'login-password' : 'signup-password'}
                      className="block text-xs font-bold text-slate-700"
                    >
                      Password <span className="text-rose-500">*</span>
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => { setForgotModalOpen(true); setForgotMessage(null); }}
                        className="text-[11px] font-bold text-[#3B7A3B] hover:underline focus:outline-none focus:ring-1 focus:ring-[#3B7A3B] rounded"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id={mode === 'login' ? 'login-password' : 'signup-password'}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-[#E2E2DC] text-xs sm:text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#3B7A3B] focus:border-transparent transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {/* Password Strength Meter (Sign-up only) */}
                  {mode === 'signup' && password && (
                    <div className="mt-2 space-y-1">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full transition-all duration-300", passwordStrength.color, passwordStrength.width)}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-500 font-semibold">
                        <span>Strength: {passwordStrength.label}</span>
                        <span>Min. 8 characters</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password (Sign-up only) */}
                {mode === 'signup' && (
                  <div>
                    <label 
                      htmlFor="signup-confirm-password" 
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      Confirm Password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="signup-confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-[#E2E2DC] text-xs sm:text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#3B7A3B] focus:border-transparent transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Optional Referral Code (Sign-up only) */}
                {mode === 'signup' && (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label 
                        htmlFor="signup-referral" 
                        className="block text-xs font-bold text-slate-700"
                      >
                        Referral Code <span className="text-slate-400 font-normal">(Optional)</span>
                      </label>
                      {referralStatus.state === 'valid' && (
                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 size={12} /> Referrer: {referralStatus.ownerName}
                        </span>
                      )}
                      {referralStatus.state === 'invalid' && (
                        <span className="text-[10px] font-bold text-rose-500 flex items-center gap-1">
                          <AlertCircle size={12} /> Code not found
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        id="signup-referral"
                        type="text"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                        placeholder="e.g. NORODATA-ABCDE"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E2DC] text-xs sm:text-sm font-medium uppercase text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#3B7A3B] focus:border-transparent transition-all"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Format: NORODATA-XXXXX. Leave blank if you don’t have one.
                    </p>
                  </div>
                )}

                {/* Controls Row for Login (Remember Me) */}
                {mode === 'login' && (
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        id="remember-me"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded text-[#3B7A3B] focus:ring-[#3B7A3B] border-slate-300"
                      />
                      <span className="text-xs font-medium text-slate-700">Remember me</span>
                    </label>
                  </div>
                )}

                {/* Terms Agreement Checkbox for Sign-up */}
                {mode === 'signup' && (
                  <div className="pt-1">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        id="signup-terms"
                        type="checkbox"
                        required
                        checked={agreeTerms}
                        onChange={(e) => setAgreeTerms(e.target.checked)}
                        className="w-4 h-4 rounded text-[#3B7A3B] focus:ring-[#3B7A3B] border-slate-300 mt-0.5"
                      />
                      <span className="text-xs text-slate-600 leading-snug">
                        I agree to the <a href="#" className="font-bold text-[#3B7A3B] hover:underline">Terms of Service</a> and <a href="#" className="font-bold text-[#3B7A3B] hover:underline">Privacy Policy</a>.
                      </span>
                    </label>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading || cooldownRemaining > 0}
                  className="w-full py-3.5 rounded-xl text-xs sm:text-sm font-black text-white shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                  style={{ backgroundColor: '#3B7A3B' }}
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{mode === 'login' ? 'Signing In…' : 'Creating Account…'}</span>
                    </>
                  ) : (
                    <span>{mode === 'login' ? 'Sign In to Wallet' : 'Create Free Account'}</span>
                  )}
                </button>

              </form>

              {/* Divider */}
              <div className="relative flex items-center justify-center my-4">
                <div className="border-t border-[#E2E2DC] w-full" />
                <span className="bg-white px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider relative">
                  Or
                </span>
              </div>

              {/* Continue with Google */}
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl border border-[#E2E2DC] bg-white hover:bg-slate-50 transition-colors text-xs sm:text-sm font-bold text-slate-800 flex items-center justify-center gap-3 shadow-sm disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.94H1.26v3.15C3.26 21.36 7.37 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.26c-.25-.72-.38-1.49-.38-2.26s.13-1.54.38-2.26V6.59H1.26C.46 8.19 0 10.03 0 12s.46 3.81 1.26 5.41l4.02-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.26 2.64 1.26 6.59l4.02 3.15c.95-2.84 3.6-4.99 6.72-4.99z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

            </div>

          </div>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* FORGOT PASSWORD MODAL */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {forgotModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setForgotModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-md relative z-10 border border-[#E2E2DC] shadow-2xl space-y-5"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#3B7A3B] flex items-center justify-center">
                    <KeyRound size={20} />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 pt-2">Reset Password</h3>
                  <p className="text-xs text-slate-500">
                    Enter the email registered with your NORODATA account.
                  </p>
                </div>
                <button
                  onClick={() => setForgotModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  aria-label="Close modal"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Uniform Security Response Message */}
              {forgotMessage ? (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 leading-relaxed font-medium">
                    {forgotMessage}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setForgotModalOpen(false); setForgotMessage(null); }}
                    className="w-full py-3 rounded-xl text-xs font-black text-white"
                    style={{ backgroundColor: '#3B7A3B' }}
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label 
                      htmlFor="forgot-email" 
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      Registered Email Address
                    </label>
                    <input
                      id="forgot-email"
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E2DC] text-xs sm:text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#3B7A3B] focus:border-transparent transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-full py-3 rounded-xl text-xs font-black text-white shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#3B7A3B' }}
                  >
                    {forgotLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Sending Link…</span>
                      </>
                    ) : (
                      <span>Send Reset Link</span>
                    )}
                  </button>
                </form>
              )}

            </motion.div>

          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
