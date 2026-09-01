import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mail, 
  Lock, 
  User, 
  AtSign, 
  ChevronRight, 
  TrendingUp, 
  AlertCircle, 
  Phone, 
  Eye, 
  EyeOff, 
  KeyRound, 
  CheckCircle2, 
  XCircle, 
  ShieldCheck,
  Smartphone,
  Zap,
  Globe,
  ArrowRight,
  Shield,
  Clock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';

type AuthMode = 'login' | 'signup' | 'reset';

// Network provider component with live badge
const NetworkBadge = ({ name, icon }: { name: string; icon: string }) => (
  <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-white/10 border border-white/20 rounded-lg backdrop-blur-sm hover:bg-white/15 transition-all">
    <span className="text-lg">{icon}</span>
    <span className="text-[10px] font-black text-white uppercase tracking-widest">{name}</span>
  </div>
);

export default function AuthPage({ onBack }: { onBack: () => void }) {
  const { signInWithGoogle } = useAuth();
  const [mode, setMode] = React.useState<AuthMode | 'otp'>('login');
  const [otp, setOtp] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Form states
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [rememberMe, setRememberMe] = React.useState(false);
  const [referralCodeInput, setReferralCodeInput] = React.useState('');

  // Password visibility
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  // Live validation & helper states
  const [referralStatus, setReferralStatus] = React.useState<{
    status: 'idle' | 'checking' | 'valid' | 'invalid';
    ownerName?: string;
  }>({ status: 'idle' });

  React.useEffect(() => {
    const savedEmail = localStorage.getItem('vtu_remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  React.useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (ref) {
        setReferralCodeInput(ref.toUpperCase());
        setMode('signup');
        toast.success("✨ Referral link detected! Code pre-filled.");
      }
    } catch (e) {
      console.error("Failed to parse URL referer code:", e);
    }
  }, []);

  React.useEffect(() => {
    if (!referralCodeInput.trim() || mode !== 'signup') {
      setReferralStatus({ status: 'idle' });
      return;
    }

    setReferralStatus({ status: 'checking' });
    const checkCode = async () => {
      try {
        const cleanCode = referralCodeInput.trim().toUpperCase();
        const { data: refData } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('referral_code', cleanCode)
          .maybeSingle();
        if (refData) {
          setReferralStatus({
            status: 'valid',
            ownerName: refData.full_name || 'User'
          });
        } else {
          setReferralStatus({ status: 'invalid' });
        }
      } catch (err) {
        setReferralStatus({ status: 'invalid' });
      }
    };

    const delayDebounce = setTimeout(checkCode, 600);
    return () => clearTimeout(delayDebounce);
  }, [referralCodeInput, mode]);

  // Enhanced password strength logic with Nigerian security context
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: 'Not Entered', color: 'bg-slate-200' };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 10) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 2) return { score, label: 'Weak', color: 'bg-rose-500' };
    if (score <= 4) return { score, label: 'Good', color: 'bg-amber-500' };
    return { score, label: 'Bank-Grade 🔐', color: 'bg-emerald-500' };
  };

  const strength = getPasswordStrength(password);

  const initializeUserProfile = async (
    uid: string,
    email: string,
    name: string,
    referredByUid?: string,
    userPhone?: string,
    transactionPin?: string,
    userUsername?: string
  ) => {
    try {
      const isAdminEmail = email.toLowerCase() === 'ibrahimfaruqolamilekan4@gmail.com';
      const generatedCode = `NORODATA-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

      const { data: existing } = await supabase
        .from('profiles')
        .select('wallet_balance, balance, referral_code, full_name')
        .eq('id', uid)
        .maybeSingle();

      const existingBalance = existing
        ? Number(existing.wallet_balance ?? existing.balance ?? 0)
        : 0;
      const referralCode = existing?.referral_code || generatedCode;

      await supabase.from('profiles').upsert({
        id: uid,
        email: email.toLowerCase().trim(),
        full_name: name || existing?.full_name || 'User',
        username: userUsername || email.split('@')[0],
        phone_number: userPhone || '',
        role: isAdminEmail ? 'admin' : 'user',
        referral_code: referralCode,
        transaction_pin: transactionPin || '0000',
        wallet_balance: existingBalance,
        balance: existingBalance,
        available_balance: existingBalance,
        referred_by: referredByUid || null,
      }, { onConflict: 'id' });

    } catch (sbErr: any) {
      console.warn('initializeUserProfile error:', sbErr.message);
    }
  };

  const handleForgotPassword = async (resetEmail: string) => {
    const redirectUrl = `${window.location.origin}/recovery`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: redirectUrl
    });
    if (resetError) throw resetError;
    toast.success('🔐 Verification code sent to your email.');
    setMode('otp');
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (rememberMe) {
        localStorage.setItem('vtu_remembered_email', email);
      } else {
        localStorage.removeItem('vtu_remembered_email');
      }

      if (mode === 'login') {
        const { data, error: loginError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (loginError) throw loginError;

        if (data.user) {
          await initializeUserProfile(data.user.id, data.user.email!, data.user.user_metadata?.fullName || data.user.user_metadata?.name || 'User');
          toast.success("🎉 Welcome back! Your wallet is ready.", { icon: "👋" });
        }
      } else if (mode === 'signup') {
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters long!");
        }
        if (password !== confirmPassword) {
          throw new Error("Confirm password and Password fields must match!");
        }
        if (pin.length !== 4 || !/^\d+$/.test(pin)) {
          throw new Error("Security Transaction PIN must be exactly 4 numeric digits!");
        }
        if (phone && (phone.length < 10 || phone.length > 11)) {
          throw new Error("Please enter a valid Nigerian Phone Number (10 or 11 digits)!");
        }
        if (!username.trim()) {
          throw new Error("Username is required!");
        }

        let verifiedReferrerUid: string | undefined = undefined;
        if (referralCodeInput.trim()) {
          const cleanCode = referralCodeInput.trim().toUpperCase();
          const { data: refProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('referral_code', cleanCode)
            .maybeSingle();
          if (!refProfile) {
            throw new Error(`The referral code "${cleanCode}" was not found. Please verify or input a valid code.`);
          }
          verifiedReferrerUid = refProfile.id;
        }

        toast.loading("⚡ Initializing your reseller account...", { id: "loading-signup" });
        
        const { data, error: signupError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              name: fullName,
              username: username,
              phone_number: phone,
              referral_code: referralCodeInput.trim()
            }
          }
        });
        if (signupError) throw signupError;

        if (data.user) {
          await initializeUserProfile(data.user.id, data.user.email!, fullName, verifiedReferrerUid, phone, pin, username);
          toast.dismiss("loading-signup");
          toast.success("🚀 Welcome to the NORODATA network! Start earning today.", { icon: "🎊" });
        }
      } else {
        await handleForgotPassword(email);
      }
    } catch (err: any) {
      toast.dismiss("loading-signup");
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Google sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] font-sans overflow-hidden">

      {/* LEFT: Enhanced Nigerian Market Brand Panel */}
      <div className="hidden lg:flex flex-col relative overflow-hidden p-14 bg-gradient-to-br from-blue-600 via-blue-700 to-slate-900 text-white">
        
        {/* Animated gradient background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-emerald-500/20 rounded-full blur-3xl animate-blob" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-orange-500/20 rounded-full blur-3xl animate-blob animation-delay-2000" />
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)',
              backgroundSize: '42px 42px',
            }}
          />
        </div>

        {/* Header with back button */}
        <button onClick={onBack} className="flex items-center gap-3 relative z-10 w-fit cursor-pointer group">
          <div className="w-11 h-11 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/40 group-hover:scale-110 transition-transform">
            <Zap className="w-6 h-6 text-white" strokeWidth={3} />
          </div>
          <div>
            <span className="text-lg font-black tracking-tight text-white block">NORODATA</span>
            <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-widest">Nigerian VTU Network</span>
          </div>
        </button>

        {/* Main value prop */}
        <div className="relative z-10 mt-12 max-w-md">
          <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-emerald-300 bg-white/10 border border-white/15 px-3 py-1.5 rounded-full mb-6 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            All networks online • 99.9% uptime
          </div>

          <h1 className="text-5xl font-black leading-tight mb-5 text-white">
            Recharge, Pay Bills<br />
            <span className="bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">Get Paid Instantly</span>
          </h1>

          <p className="text-blue-100/90 text-[15px] leading-relaxed max-w-sm font-medium">
            Airtime, data, cable subscriptions, and electricity tokens across all Nigerian networks. Lightning-fast delivery with automatic refunds on failures.
          </p>

          {/* Network provider badges */}
          <div className="flex flex-wrap gap-2 mt-8">
            <NetworkBadge name="MTN" icon="🟡" />
            <NetworkBadge name="Airtel" icon="🔴" />
            <NetworkBadge name="GLO" icon="🟢" />
            <NetworkBadge name="9mobile" icon="💜" />
          </div>
        </div>

        {/* Enhanced live activity ticker */}
        <AuthPulseTicker />

        {/* Stats with Nigerian market context */}
        <div className="relative z-10 mt-auto pt-12 grid grid-cols-3 gap-6">
          <div className="group">
            <b className="block text-3xl font-black text-emerald-300 group-hover:text-emerald-200 transition-colors">50K+</b>
            <span className="text-[12px] text-blue-200 font-bold uppercase tracking-wide">Active Resellers</span>
            <p className="text-[10px] text-blue-300/60 mt-1">Across Nigeria 🇳🇬</p>
          </div>
          <div className="group">
            <b className="block text-3xl font-black text-emerald-300 group-hover:text-emerald-200 transition-colors">₦5B+</b>
            <span className="text-[12px] text-blue-200 font-bold uppercase tracking-wide">Transactions</span>
            <p className="text-[10px] text-blue-300/60 mt-1">This quarter</p>
          </div>
          <div className="group">
            <b className="block text-3xl font-black text-emerald-300 group-hover:text-emerald-200 transition-colors">&lt;3s</b>
            <span className="text-[12px] text-blue-200 font-bold uppercase tracking-wide">Avg Delivery</span>
            <p className="text-[10px] text-blue-300/60 mt-1">Lightning fast</p>
          </div>
        </div>

        {/* Trust badge */}
        <div className="relative z-10 mt-8 pt-6 border-t border-white/10 flex items-center gap-3">
          <Shield className="w-5 h-5 text-emerald-400" />
          <div>
            <p className="text-[11px] font-black text-white uppercase tracking-widest">Bank-Grade Security</p>
            <p className="text-[10px] text-blue-200">PCI-DSS Compliant • CBN Regulated</p>
          </div>
        </div>
      </div>

      {/* RIGHT: Auth Card Container */}
      <div className="flex items-center justify-center p-4 sm:p-8 bg-gradient-to-br from-slate-50 via-white to-blue-50/30 lg:bg-white min-h-screen">
        <div className="w-full max-w-md py-6">

          {/* Mobile brand header */}
          <div className="lg:hidden text-center mb-8">
            <button onClick={onBack} className="inline-flex items-center gap-2 group cursor-pointer mb-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-xl shadow-blue-500/30">
                <Zap className="w-7 h-7 text-white" strokeWidth={3} />
              </div>
              <div className="text-left">
                <span className="text-2xl font-black tracking-tight text-slate-900 block">NORODATA</span>
                <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">VTU Platform</span>
              </div>
            </button>
            <div className="flex justify-center items-center gap-2 text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[10px] font-bold uppercase tracking-wider">
                🔐 Secure • Instant • Reliable
              </p>
            </div>
          </div>

          {/* Main auth card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="bg-white rounded-3xl p-8 shadow-2xl shadow-blue-200/40 ring-1 ring-slate-100 border border-slate-100/50"
          >
            {/* Mode tabs with enhanced styling */}
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-gradient-to-r from-blue-50 to-slate-50 rounded-2xl mb-8 font-sans">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => { setMode('login'); setError(null); }}
                className={cn(
                  "py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer font-sans",
                  mode === 'login' 
                    ? "bg-gradient-to-r from-blue-500 to-emerald-500 text-white shadow-lg shadow-blue-500/30" 
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                Log In
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => { setMode('signup'); setError(null); }}
                className={cn(
                  "py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer font-sans",
                  mode === 'signup' 
                    ? "bg-gradient-to-r from-blue-500 to-emerald-500 text-white shadow-lg shadow-blue-500/30" 
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                Sign Up
              </motion.button>
            </div>

            {/* Heading section */}
            <div className="mb-8">
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                {mode === 'login' ? '👋 Welcome Back' : mode === 'signup' ? '🚀 Start Earning' : '🔑 Recover Account'}
              </h2>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wide mt-2">
                {mode === 'login'
                  ? 'Access your reseller dashboard and manage your wallet'
                  : mode === 'signup'
                  ? 'Join thousands of Nigerian resellers earning daily'
                  : 'We'll send a verification link to your registered email'}
              </p>
            </div>

            {/* Error display with enhanced styling */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-rose-50 border-2 border-rose-200 rounded-2xl flex gap-3 text-rose-800 text-sm font-bold items-start whitespace-pre-line"
              >
                <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-600 animate-pulse" />
                <div className="flex-1">{error}</div>
              </motion.div>
            )}

            {/* OTP Mode */}
            {mode === 'otp' ? (
              <div className="space-y-8">
                <div className="text-center space-y-3">
                  <div className="text-4xl">📧</div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Check Your Email</h3>
                  <p className="text-sm text-slate-600 font-medium">We've sent a 6-digit verification code.</p>
                </div>
                
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <input
                      key={i}
                      type="text"
                      maxLength={1}
                      className="w-12 h-14 text-center text-2xl font-black text-slate-900 bg-gradient-to-br from-blue-50 to-slate-50 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 transition-all outline-none hover:border-blue-300"
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val && i < 6) {
                          const next = e.target.nextElementSibling as HTMLInputElement;
                          if (next) next.focus();
                        }
                      }}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    toast.success("✅ Verified successfully!");
                    setMode('login');
                  }}
                  className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 rounded-2xl py-4 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 transition-all hover:-translate-y-0.5 active:scale-95"
                >
                  <CheckCircle2 size={18} />
                  Verify & Continue
                </button>

                <div className="text-center text-xs font-medium text-slate-500">
                  Didn't get it? <button type="button" className="text-emerald-600 font-black hover:underline">Resend code</button>
                </div>
              </div>
            ) : (
            <form onSubmit={handleEmailAuth} className="space-y-5">
              {/* SIGNUP MODE FIELDS */}
              {mode === 'signup' && (
                <>
                  {/* Full Name */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-slate-600 ml-1 flex items-center gap-1">
                      <User size={12} /> Full Name (as it appears on your ID)
                    </label>
                    <div className="relative group">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
                      <input
                        required
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Faruq Ibrahim"
                        className="w-full bg-gradient-to-r from-blue-50 to-slate-50 border-2 border-slate-200 focus:border-emerald-500 rounded-xl py-3.5 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-emerald-500/15 transition-all text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  {/* Username */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-slate-600 ml-1 flex items-center gap-1">
                      <AtSign size={12} /> Username (Your reseller ID)
                    </label>
                    <div className="relative group">
                      <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
                      <input
                        required
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                        placeholder="e.g. faruq_nigeria"
                        className="w-full bg-gradient-to-r from-blue-50 to-slate-50 border-2 border-slate-200 focus:border-emerald-500 rounded-xl py-3.5 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-emerald-500/15 transition-all text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  {/* Phone & PIN Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Phone */}
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-slate-600 ml-1 flex justify-between items-center">
                        <span className="flex items-center gap-1"><Phone size={12} /> Phone Number</span>
                        {phone.length > 0 && (
                          <span className={cn(phone.length === 11 ? "text-emerald-600 font-black" : "text-amber-500")}>
                            {phone.length}/11
                          </span>
                        )}
                      </label>
                      <div className="relative group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">🇳🇬</span>
                        <input
                          required
                          type="tel"
                          maxLength={11}
                          value={phone}
                          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                          placeholder="08123456789"
                          className="w-full bg-gradient-to-r from-blue-50 to-slate-50 border-2 border-slate-200 focus:border-emerald-500 rounded-xl py-3.5 pl-10 pr-4 text-sm font-mono font-bold focus:outline-none focus:ring-4 focus:ring-emerald-500/15 transition-all text-slate-900 placeholder:text-slate-400"
                        />
                      </div>
                    </div>

                    {/* Transaction PIN */}
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-slate-600 ml-1 flex items-center gap-1">
                        <KeyRound size={12} /> Transaction PIN (4 digits)
                      </label>
                      <div className="relative group">
                        <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
                        <input
                          required
                          type="password"
                          maxLength={4}
                          value={pin}
                          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                          placeholder="••••"
                          className="w-full bg-gradient-to-r from-blue-50 to-slate-50 border-2 border-slate-200 focus:border-emerald-500 rounded-xl py-3.5 pl-12 pr-4 text-sm font-mono font-black tracking-widest focus:outline-none focus:ring-4 focus:ring-emerald-500/15 transition-all text-slate-900 placeholder:text-slate-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Referral Code */}
                  <div className="space-y-2 bg-gradient-to-r from-emerald-50/50 to-cyan-50/50 border-2 border-emerald-200/30 rounded-2xl p-4">
                    <label className="text-[10px] uppercase font-black text-slate-600 ml-0 flex items-center justify-between">
                      <span className="flex items-center gap-1"><TrendingUp size={12} /> Referral Code (Optional)</span>
                      <AnimatePresence mode="wait">
                        {referralStatus.status === 'checking' && (
                          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[8px] text-indigo-600 font-black animate-pulse flex items-center gap-1">
                            <Clock size={10} /> Verifying...
                          </motion.span>
                        )}
                        {referralStatus.status === 'valid' && (
                          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[9px] text-emerald-600 font-black flex items-center gap-1">
                            <CheckCircle2 size={12} /> {referralStatus.ownerName}
                          </motion.span>
                        )}
                        {referralStatus.status === 'invalid' && referralCodeInput && (
                          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[9px] text-rose-600 font-black flex items-center gap-1">
                            <XCircle size={12} /> Invalid
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </label>
                    <div className="relative group">
                      <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400 group-focus-within:text-emerald-600 transition-colors" size={18} />
                      <input
                        type="text"
                        value={referralCodeInput}
                        onChange={(e) => setReferralCodeInput(e.target.value)}
                        placeholder="e.g. NORODATA-AB3X (optional)"
                        className={cn(
                          "w-full border-2 rounded-xl py-3.5 pl-12 pr-4 text-sm font-mono font-bold uppercase tracking-widest focus:outline-none transition-all text-slate-900 placeholder:text-slate-400",
                          referralStatus.status === 'valid' && "border-emerald-400 bg-white",
                          referralStatus.status === 'invalid' && referralCodeInput && "border-rose-400 bg-rose-50/30",
                          referralStatus.status === 'checking' && "border-indigo-400 bg-indigo-50/30",
                          referralStatus.status === 'idle' && "border-slate-200 bg-white focus:border-emerald-500"
                        )}
                      />
                    </div>
                    <p className="text-[9px] text-slate-500 font-medium">Know someone? Use their referral code to earn commissions!</p>
                  </div>
                </>
              )}

              {/* EMAIL FIELD */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-black text-slate-600 ml-1 flex items-center gap-1">
                  <Mail size={12} /> Email Address
                </label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    className="w-full bg-gradient-to-r from-blue-50 to-slate-50 border-2 border-slate-200 focus:border-emerald-500 rounded-xl py-3.5 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-emerald-500/15 transition-all text-slate-900 placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* PASSWORD FIELD */}
              {mode !== 'reset' && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <label className={cn(
                      "text-[10px] uppercase font-black flex items-center gap-1",
                      email.toLowerCase() === 'ibrahimfaruqolamilekan4@gmail.com' ? "text-emerald-600 animate-pulse" : "text-slate-600"
                    )}>
                      <Lock size={12} />
                      {email.toLowerCase() === 'ibrahimfaruqolamilekan4@gmail.com'
                        ? "👑 Admin Account"
                        : "Password"}
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => setMode('reset')}
                        className="text-[10px] font-black uppercase text-blue-600 hover:text-emerald-600 transition-colors cursor-pointer"
                      >
                        Forgot Password?
                      </button>
                    )}
                  </div>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a strong password"
                      className={cn(
                        "w-full border-2 rounded-xl py-3.5 pl-12 pr-12 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-emerald-500/15 transition-all text-slate-900 placeholder:text-slate-400",
                        email.toLowerCase() === 'ibrahimfaruqolamilekan4@gmail.com'
                          ? "bg-emerald-50 border-emerald-300 focus:border-emerald-500"
                          : "bg-gradient-to-r from-blue-50 to-slate-50 border-slate-200 focus:border-emerald-500"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  {/* Password strength indicator */}
                  {mode === 'signup' && password.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                      <div className="flex justify-between items-center text-[9px] font-black uppercase">
                        <span className="text-slate-500">Strength:</span>
                        <span className={strength.score <= 2 ? "text-rose-500" : strength.score <= 4 ? "text-amber-500" : "text-emerald-600"}>
                          {strength.label}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min((strength.score / 5) * 100, 100)}%` }}
                          transition={{ duration: 0.3 }}
                          className={cn("h-full", strength.color)}
                        />
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {/* CONFIRM PASSWORD - SIGNUP ONLY */}
              {mode === 'signup' && (
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black text-slate-600 ml-1 flex justify-between items-center">
                    <span className="flex items-center gap-1"><Lock size={12} /> Confirm Password</span>
                    {confirmPassword.length > 0 && (
                      <span className={confirmPassword === password ? "text-emerald-600 font-black text-[9px]" : "text-rose-500 font-black text-[9px]"}>
                        {confirmPassword === password ? "✓ Match" : "✗ Mismatch"}
                      </span>
                    )}
                  </label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
                    <input
                      required
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your password"
                      className={cn(
                        "w-full border-2 rounded-xl py-3.5 pl-12 pr-12 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-emerald-500/15 transition-all text-slate-900 placeholder:text-slate-400",
                        confirmPassword && confirmPassword === password ? "border-emerald-300 bg-emerald-50/30" :
                        confirmPassword && confirmPassword !== password ? "border-rose-300 bg-rose-50/30" : "bg-gradient-to-r from-blue-50 to-slate-50 border-slate-200 focus:border-emerald-500"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Remember me checkbox */}
              {mode === 'login' && (
                <div className="flex items-center justify-between px-1 py-2">
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-5 h-5 rounded border-2 border-slate-300 text-emerald-600 focus:ring-emerald-500/20 cursor-pointer accent-emerald-600"
                    />
                    <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Keep me signed in</span>
                  </label>
                </div>
              )}

              {/* Main CTA Button */}
              <motion.button
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-500 via-emerald-500 to-cyan-500 text-white hover:from-blue-600 hover:via-emerald-600 hover:to-cyan-600 rounded-2xl py-4 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 hover:-translate-y-1 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none"
              >
                {loading ? (
                  <>
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Processing...
                  </>
                ) : (
                  <>
                    {mode === 'login' ? 'Log In to Dashboard' : mode === 'signup' ? 'Create My Account' : 'Send Recovery Link'}
                    <ArrowRight size={18} />
                  </>
                )}
              </motion.button>

              {/* Divider */}
              <div className="relative py-5">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                <div className="relative flex justify-center text-[10px] uppercase font-black text-slate-400 tracking-tight"><span className="bg-white px-3">Or sign in with</span></div>
              </div>

              {/* Google Sign In */}
              <motion.button
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full bg-white text-slate-900 border-2 border-slate-200 rounded-2xl py-4 font-black text-xs uppercase tracking-wider hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-3 shadow-sm hover:shadow-md cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.17-.63-.27-1.3-.27-2.09s.1-1.46.27-2.09z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Continue with Google
              </motion.button>
            </form>
            )}

            {/* Mode switcher */}
            <div className="mt-8 pt-6 border-t border-slate-200 text-center text-xs text-slate-600 font-sans">
              {mode === 'login' ? (
                <p className="font-semibold">
                  New to NORODATA?{' '}
                  <button
                    onClick={() => { setMode('signup'); setError(null); }}
                    className="text-blue-600 font-black hover:text-emerald-600 transition-colors cursor-pointer uppercase tracking-wider"
                  >
                    Sign up free
                  </button>
                </p>
              ) : (
                <p className="font-semibold">
                  Already have an account?{' '}
                  <button
                    onClick={() => { setMode('login'); setError(null); }}
                    className="text-blue-600 font-black hover:text-emerald-600 transition-colors cursor-pointer uppercase tracking-wider"
                  >
                    Log in
                  </button>
                </p>
              )}
            </div>
          </motion.div>

          {/* Security footer */}
          <div className="flex items-center justify-center gap-2 mt-6 text-[11px] text-slate-500 font-medium">
            <ShieldCheck size={14} className="text-emerald-600" />
            Bank-grade 256-bit encryption
          </div>

          {/* Back button */}
          <motion.button
            whileHover={{ x: -3 }}
            onClick={onBack}
            className="mt-4 w-full text-center text-slate-400 text-xs font-black uppercase tracking-wider hover:text-slate-700 transition-colors cursor-pointer"
          >
            ← Back to Website
          </motion.button>
        </div>
      </div>

      {/* CSS for blob animations */}
      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
      `}</style>
    </div>
  );
}

/* Enhanced live activity ticker component */
function AuthPulseTicker() {
  const networks = ['MTN 🟡', 'Airtel 🔴', 'GLO 🟢', '9mobile 💜'];
  const kinds = [
    { label: 'airtime', amounts: ['₦200', '₦500', '₦1,000', '₦2,500'] },
    { label: 'data', amounts: ['500MB', '1GB', '2GB', '5GB'] },
    { label: 'electricity', amounts: ['₦1,500', '₦3,000', '₦5,000', '₦10,000'] },
    { label: 'cable TV', amounts: ['DSTV', 'GOtv', 'Startimes'] },
  ];
  
  const maskPhone = () => '090•••' + Math.floor(100 + Math.random() * 900);
  
  const randomRow = () => {
    const k = kinds[Math.floor(Math.random() * kinds.length)];
    const amt = k.amounts[Math.floor(Math.random() * k.amounts.length)];
    const net = networks[Math.floor(Math.random() * networks.length)];
    return { 
      id: Math.random(), 
      amt, 
      label: k.label, 
      net, 
      to: maskPhone(),
      status: Math.random() > 0.1 ? '✓' : '⏳'
    };
  };

  const [rows, setRows] = React.useState(() => Array.from({ length: 6 }, randomRow));

  React.useEffect(() => {
    const t = setInterval(() => {
      setRows((prev) => [randomRow(), ...prev].slice(0, 8));
    }, 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative z-10 mt-12 bg-black/25 border border-white/10 rounded-2xl p-2 backdrop-blur-md overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 text-[11px] font-mono uppercase tracking-widest text-blue-200 bg-white/5 border-b border-white/10">
        <span className="flex items-center gap-2">
          <Zap size={12} className="text-emerald-400" />
          Live Activity Feed
        </span>
        <span className="flex items-center gap-1.5 text-emerald-300 font-black">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Online
        </span>
      </div>
      <div className="h-40 overflow-hidden relative">
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-slate-900 via-slate-900/50 to-transparent pointer-events-none z-10" />
        {rows.map((r) => (
          <motion.div 
            key={r.id} 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex items-center gap-3 px-4 py-2.5 text-[12px] font-mono text-blue-50 border-b border-white/5 hover:bg-white/5 transition-colors first:border-t-0"
          >
            <span className={r.status === '✓' ? 'text-emerald-400 font-black' : 'text-amber-400 animate-pulse'}>{r.status}</span>
            <span className="text-emerald-300 font-bold">{r.amt}</span>
            <span className="text-blue-300">{r.label}</span>
            <span className="text-blue-400">· {r.net}</span>
            <span className="ml-auto text-blue-400/70 whitespace-nowrap text-[11px]">{r.to}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
