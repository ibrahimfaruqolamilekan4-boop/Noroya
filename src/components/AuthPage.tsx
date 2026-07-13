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
  XCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useSupabaseError } from '../hooks/useSupabaseError';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';

type AuthMode = 'login' | 'signup' | 'reset';

export default function AuthPage({ onBack }: { onBack: () => void }) {
  const { signInWithGoogle } = useAuth();
  const { handleSupabaseError } = useSupabaseError();
  const [mode, setMode] = React.useState<AuthMode>('login');
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
    // Load remembered email
    const savedEmail = localStorage.getItem('vtu_remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  React.useEffect(() => {
    // Extract referral code if present in the URL query string
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (ref) {
        setReferralCodeInput(ref.toUpperCase());
        setMode('signup');
        toast.success("Referral link detected! Code pre-filled.");
      }
    } catch (e) {
      console.error("Failed to parse URL referer code:", e);
    }
  }, []);

  // Real-time referral checking with debounce
  React.useEffect(() => {
    if (!referralCodeInput.trim() || mode !== 'signup') {
      setReferralStatus({ status: 'idle' });
      return;
    }

    setReferralStatus({ status: 'checking' });
    const checkCode = async () => {
      try {
        const cleanCode = referralCodeInput.trim().toUpperCase();
        const { data, error } = await supabase.rpc('get_referral_owner', { code: cleanCode });
        if (!error && data && data.length > 0) {
          setReferralStatus({
            status: 'valid',
            ownerName: data[0].owner_name || 'User'
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

  // Password strength logic
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: 'Not Entered', color: 'bg-slate-200' };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 10) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 2) return { score, label: 'Weak', color: 'bg-rose-500' };
    if (score <= 4) return { score, label: 'Moderate', color: 'bg-amber-500' };
    return { score, label: 'Ultra Secure 🛡️', color: 'bg-emerald-500' };
  };

  const strength = getPasswordStrength(password);

  // NOTE: Profile creation is now handled entirely server-side by the `handle_new_user`
  // trigger on auth.users (see supabase_migration.sql) the moment a Supabase Auth account is
  // created -- atomically, with no client-side race condition. There is no manual
  // initializeUserProfile step anymore; AuthContext just reads the profile row that already exists.
  // The old client-side 'Simulated Auth Bypass' (fake login with zero credential check, including
  // an admin impersonation path) has been removed entirely -- there is no substitute for it here
  // on purpose. All authentication now goes through real Supabase Auth.

  const handleForgotPassword = async (resetEmail: string) => {
    const redirectUrl = `${window.location.origin}/recovery`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: redirectUrl
    });
    if (resetError) throw resetError;
    toast.success('Password reset link successfully sent! Check your inbox.');
    setMode('login');
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
          toast.success("Signed in successfully! ⚡", { icon: "👋" });
        }
      } else if (mode === 'signup') {
        // Validation Checks
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

        if (referralCodeInput.trim()) {
          const cleanCode = referralCodeInput.trim().toUpperCase();
          const { data: refData, error: refError } = await supabase.rpc('get_referral_owner', { code: cleanCode });
          if (refError || !refData || refData.length === 0) {
            throw new Error(`The referral code "${cleanCode}" was not found. Please verify or input a valid code.`);
          }
        }

        toast.loading("Provisioning secure wallet infrastructure...", { id: "loading-signup" });

        // Profile creation happens automatically server-side (see handle_new_user trigger in
        // supabase_migration.sql) the instant this Auth account is created -- it reads name,
        // username, phone_number, transaction_pin, and referral_code straight out of this
        // metadata payload. No separate client-side write needed.
        const { data, error: signupError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              name: fullName,
              username: username,
              phone_number: phone,
              transaction_pin: pin,
              referral_code: referralCodeInput.trim()
            }
          }
        });
        if (signupError) throw signupError;

        if (data.user) {
          toast.dismiss("loading-signup");
          toast.success("Account loaded and registration complete!", { icon: "🎉" });
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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full py-8">
        {/* Core Header Logo / Navigation */}
        <div className="text-center mb-6">
          <button onClick={onBack} className="inline-flex items-center gap-2 group cursor-pointer">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-xl shadow-blue-200 border-2 border-black">
              <TrendingUp className="text-white" size={26} />
            </div>
            <span className="text-2xl font-black tracking-tight self-center font-sans">
              NOROYA<span className="text-blue-600">DATA</span>
            </span>
          </button>
          <div className="flex justify-center items-center gap-2 mt-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-[10px] font-black uppercase text-slate-500 font-mono tracking-wider">
              256-Bit SSL Secured Terminal Gateway
            </p>
          </div>
        </div>

        {/* Master Auth Frame */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white rounded-3xl p-6 md:p-8 shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] border-2 border-black"
        >
          {/* Sign/Login Mode Tab Selector */}
          <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100/80 rounded-2xl border-2 border-black mb-6 font-sans">
            <button
              onClick={() => { setMode('login'); setError(null); }}
              className={cn(
                "py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer",
                mode === 'login' ? "bg-black text-white shadow" : "text-slate-600 hover:text-slate-900"
              )}
            >
              Log In
            </button>
            <button
              onClick={() => { setMode('signup'); setError(null); }}
              className={cn(
                "py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer",
                mode === 'signup' ? "bg-black text-white shadow" : "text-slate-600 hover:text-slate-900"
              )}
            >
              Sign Up
            </button>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
              {mode === 'login' ? 'Secure Log In' : mode === 'signup' ? 'Create Portfolio' : 'Reset Gateway Key'}
            </h2>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wide mt-1">
              {mode === 'login' 
                ? 'Authorized Access Verification Panel' 
                : mode === 'signup' 
                ? 'Join 50K+ Active Digital Resellers Today' 
                : 'Enter your verified account email to recover access'}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl flex gap-3 text-rose-800 text-xs font-bold items-start whitespace-pre-line shadow-[2px_2px_0px_0px_rgba(225,29,72,0.15)]">
              <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-600 animate-bounce" />
              <div className="flex-1 leading-relaxed">
                <div>{error}</div>
              </div>
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-4">
            {/* SIGNUP MODE EXTRA FIELDS */}
            {mode === 'signup' && (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black text-slate-500 ml-1">Full Identity Name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      required
                      type="text" 
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Faruq Ibrahim" 
                      className="w-full bg-slate-50 border-2 border-slate-200 focus:border-black rounded-xl py-3 pl-11 pr-4 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-black/15 transition-all font-sans text-black"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black text-slate-500 ml-1">Username</label>
                  <div className="relative">
                    <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      required
                      type="text" 
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      placeholder="e.g. faruq_ibrahim" 
                      className="w-full bg-slate-50 border-2 border-slate-200 focus:border-black rounded-xl py-3 pl-11 pr-4 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-black/15 transition-all font-sans text-black"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black text-slate-500 ml-1 flex justify-between">
                      <span>Phone Number</span>
                      {phone.length > 0 && (
                        <span className={cn(phone.length === 11 ? "text-emerald-600" : "text-amber-500")}>
                          {phone.length}/11 Digits
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        required
                        type="tel" 
                        maxLength={11}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                        placeholder="08123456789" 
                        className="w-full bg-slate-50 border-2 border-slate-200 focus:border-black rounded-xl py-3 pl-11 pr-4 text-xs font-black focus:outline-none focus:ring-1 focus:ring-black/15 transition-all font-mono text-black"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black text-slate-500 ml-1 flex items-center justify-between">
                      <span>Transaction PIN 🔑</span>
                      <span className="text-slate-400 text-[8px] font-black uppercase">Required for sending bills</span>
                    </label>
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        required
                        type="password" 
                        maxLength={4}
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="4-digit PIN" 
                        className="w-full bg-slate-50 border-2 border-slate-200 focus:border-black rounded-xl py-3 pl-11 pr-4 text-xs font-black tracking-widest focus:outline-none focus:ring-1 focus:ring-black/15 transition-all font-mono text-black"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black text-slate-500 ml-1 flex items-center justify-between">
                    <span>Referral Code (Optional)</span>
                    <AnimatePresence mode="wait">
                      {referralStatus.status === 'checking' && (
                        <span className="text-[8px] text-blue-600 font-bold animate-pulse">VERIFYING CODE...</span>
                      )}
                      {referralStatus.status === 'valid' && (
                        <span className="text-[9px] text-emerald-600 font-black flex items-center gap-1">
                          <CheckCircle2 size={10} /> REFERRER: {referralStatus.ownerName}
                        </span>
                      )}
                      {referralStatus.status === 'invalid' && (
                        <span className="text-[9px] text-rose-600 font-black flex items-center gap-1">
                          <XCircle size={10} /> CODE NOT REGISTERED
                        </span>
                      )}
                    </AnimatePresence>
                  </label>
                  <div className="relative">
                    <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text" 
                      value={referralCodeInput}
                      onChange={(e) => setReferralCodeInput(e.target.value)}
                      placeholder="e.g. NOROYA-AF8X" 
                      className={cn(
                        "w-full bg-slate-50 border-2 rounded-xl py-3 pl-11 pr-4 text-xs font-black uppercase tracking-wider focus:outline-none transition-all font-mono text-black",
                        referralStatus.status === 'valid' && "border-emerald-500 bg-emerald-50/20",
                        referralStatus.status === 'invalid' && "border-rose-400 bg-rose-50/20",
                        referralStatus.status === 'checking' && "border-blue-400",
                        referralStatus.status === 'idle' && "border-slate-200 focus:border-black"
                      )}
                    />
                  </div>
                </div>
              </>
            )}

            {/* EMAIL CONTAINER */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-black text-slate-500 ml-1">Secure Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  required
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="enter email" 
                  className="w-full bg-slate-50 border-2 border-slate-200 focus:border-black rounded-xl py-3 pl-11 pr-4 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-black/15 transition-all text-black"
                />
              </div>
            </div>

            {/* PASSWORD CONTAINER & STRENGTH METER */}
            {mode !== 'reset' && (
              <div className="space-y-1">
                <div className="flex justify-between items-center px-1">
                  <label className={cn(
                    "text-[10px] uppercase font-black",
                    email.toLowerCase() === 'ibrahimfaruqolamilekan4@gmail.com' ? "text-emerald-600 animate-pulse" : "text-slate-500"
                  )}>
                    {email.toLowerCase() === 'ibrahimfaruqolamilekan4@gmail.com' 
                      ? "👑 Platform Admin Account Detected" 
                      : "Account Secret Password"}
                  </label>
                  {mode === 'login' && (
                    <button 
                      type="button" 
                      onClick={() => setMode('reset')} 
                      className="text-[10px] font-black uppercase text-blue-600 hover:underline cursor-pointer"
                    >
                      Forgot?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    required
                    type={showPassword ? "text" : "password"} 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" 
                    className={cn(
                      "w-full border-2 rounded-xl py-3 pl-11 pr-11 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-black/15 transition-all text-black",
                      email.toLowerCase() === 'ibrahimfaruqolamilekan4@gmail.com'
                        ? "bg-emerald-50/50 border-emerald-300 focus:border-emerald-500"
                        : "bg-slate-50 border-slate-200 focus:border-black"
                    )}
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Password Strength Progress indicator during Registration */}
                {mode === 'signup' && password.length > 0 && (
                  <div className="space-y-1 pt-1 ml-1">
                    <div className="flex justify-between items-center text-[9px] font-black uppercase">
                      <span className="text-slate-400">Password Strength:</span>
                      <span className={strength.score <= 2 ? "text-rose-500" : strength.score <= 4 ? "text-amber-500" : "text-emerald-600"}>
                        {strength.label}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      <div 
                        className={cn("h-full transition-all duration-300", strength.color)} 
                        style={{ width: `${Math.min((strength.score / 5) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-[8px] font-bold text-slate-400 leading-tight">
                      Must be at least 6 characters. Mix uppercase letters, numbers, and symbols for best results.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* CONFIRM PASSWORD - SIGNUP MODE ONLY */}
            {mode === 'signup' && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-slate-500 ml-1 flex justify-between">
                  <span>Confirm Account Password</span>
                  {confirmPassword.length > 0 && (
                    <span className={confirmPassword === password ? "text-emerald-600 font-bold" : "text-rose-500 font-bold"}>
                      {confirmPassword === password ? "✓ Matches" : "✗ Mismatch"}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    required
                    type={showConfirmPassword ? "text" : "password"} 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••" 
                    className={cn(
                      "w-full border-2 rounded-xl py-3 pl-11 pr-11 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-black/15 transition-all text-black",
                      confirmPassword && confirmPassword === password ? "border-emerald-300 bg-emerald-50/5 text-slate-950" :
                      confirmPassword && confirmPassword !== password ? "border-rose-300 bg-rose-50/5 text-slate-950" : "bg-slate-50 border-slate-200 focus:border-black"
                    )}
                  />
                  <button 
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'login' && (
              <div className="flex items-center justify-between px-1 py-1">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-2 border-black text-black focus:ring-black/10"
                  />
                  <span className="text-xs font-bold text-slate-500 group-hover:text-slate-700 transition-colors font-sans">Remember secure credentials</span>
                </label>
              </div>
            )}

            {/* ACTION DIRECTIVE BUTTON */}
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 border-2 border-black text-white hover:bg-blue-500 rounded-2xl py-3.5 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer disabled:opacity-50 select-none text-center"
            >
              {loading ? 'Executing Operations...' : mode === 'login' ? 'Validate Login Session' : mode === 'signup' ? 'Complete Secure Signup' : 'Dispatch Recovery Link'}
              <ChevronRight size={18} />
            </button>

            {/* SEPARATOR */}
            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
              <div className="relative flex justify-center text-[10px] uppercase font-black text-slate-400"><span className="bg-white px-4 tracking-tight">Decentralized Auth Bridge</span></div>
            </div>

            {/* GOOGLE FEDERATION BAR */}
            <button 
              type="button" 
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full bg-white text-slate-900 border-2 border-black rounded-2xl py-3.5 font-black text-xs uppercase tracking-wider hover:bg-slate-50 transition-all flex items-center justify-center gap-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {/* SVG Google Launcher Icon */}
              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.17-.63-.27-1.3-.27-2.09s.1-1.46.27-2.09z" strokeLinecap="round" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              Sign In via Google Secure
            </button>
          </form>

          {/* ALTERNATIVE SWITCH GATE */}
          <div className="mt-8 text-center text-xs text-slate-600 font-sans">
            {mode === 'login' ? (
              <p className="font-medium">
                Don't have an active reseller workspace?{' '}
                <button 
                  onClick={() => { setMode('signup'); setError(null); }} 
                  className="text-blue-600 font-black hover:underline cursor-pointer uppercase tracking-wider"
                >
                  Register Now
                </button>
              </p>
            ) : (
              <p className="font-medium">
                Already registered in our client infrastructure?{' '}
                <button 
                  onClick={() => { setMode('login'); setError(null); }} 
                  className="text-blue-600 font-black hover:underline cursor-pointer uppercase tracking-wider"
                >
                  Gateway Log In
                </button>
              </p>
            )}
          </div>
        </motion.div>
        
        {/* ESCAPE EXIT TO NORMAL WEBSITE */}
        <button 
          onClick={onBack} 
          className="mt-6 w-full text-center text-slate-400 text-xs font-black uppercase tracking-wider hover:text-slate-700 transition-colors cursor-pointer"
        >
          ← Cancel and Return to Central Website
        </button>
      </div>
    </div>
  );
}
