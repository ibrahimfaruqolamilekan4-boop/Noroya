import React from 'react';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';

/**
 * Handles the password-recovery link Supabase sends (redirectTo: `${origin}/recovery`).
 * Supabase delivers the one-time recovery session via the URL hash (#access_token=...&type=recovery),
 * which supabase-js automatically picks up and turns into a real (temporary) auth session -- so by
 * the time this component mounts, supabase.auth.updateUser() can just be called directly.
 */
export default function ResetPasswordPage() {
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters long!');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match!');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
      toast.success('Password updated successfully!', { icon: '🎉' });
    } catch (err: any) {
      setError(err.message || 'Failed to update password. The reset link may have expired -- please request a new one.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white border-2 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-8"
      >
        {done ? (
          <div className="text-center space-y-4">
            <CheckCircle2 size={48} className="mx-auto text-emerald-600" />
            <h1 className="text-xl font-black">Password Updated!</h1>
            <p className="text-sm text-slate-500">You can now log in with your new password.</p>
            <button
              onClick={() => { window.location.href = '/'; }}
              className="w-full bg-black text-white font-extrabold uppercase text-xs tracking-wider py-3 rounded-xl border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-black mb-1">Set a New Password</h1>
            <p className="text-sm text-slate-500 mb-6">Choose a new password for your Noroya account.</p>

            {error && (
              <div className="mb-4 p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl flex gap-3 text-rose-800 text-xs font-bold items-start">
                <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-600" />
                <div>{error}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-slate-500 ml-1">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border-2 border-slate-200 focus:border-black rounded-xl py-3 pl-11 pr-11 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-black/15 transition-all text-black"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-slate-500 ml-1">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border-2 border-slate-200 focus:border-black rounded-xl py-3 pl-11 pr-4 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-black/15 transition-all text-black"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-black text-white font-extrabold uppercase text-xs tracking-wider py-3 rounded-xl border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
