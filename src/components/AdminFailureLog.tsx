import React, { useEffect, useState } from 'react';
import { AlertOctagon, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface FailureRecord {
  id: string;
  user_id: string;
  network: string;
  provider_plan_id: string;
  plan_name: string;
  amount: number;
  error_message: string;
  provider: string;
  created_at: string;
}

export default function AdminFailureLog() {
  const [failures, setFailures] = useState<FailureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFailures = async () => {
    setLoading(true);
    setError(null);
    try {
      // 24 hours ago timestamp
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error: queryErr } = await supabase
        .from('vtu_failure_log')
        .select('*')
        .gte('created_at', yesterday)
        .order('created_at', { ascending: false });

      if (queryErr) throw queryErr;
      setFailures(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch failure logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFailures();
  }, []);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl backdrop-blur-xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <AlertOctagon className="text-rose-500" size={22} />
            <h2 className="text-xl font-bold text-white tracking-wide">
              VTU Plan Failure Log (Last 24 Hours)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Audit diagnostic feed listing every plan whose provider_plan_id was rejected or failed.
          </p>
        </div>
        <button
          onClick={fetchFailures}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs">
          <Loader2 size={24} className="animate-spin mb-2 text-indigo-400" />
          Loading failure logs...
        </div>
      ) : failures.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-emerald-400 text-xs text-center border border-dashed border-slate-800 rounded-2xl">
          <CheckCircle2 size={32} className="mb-2 text-emerald-400/80" />
          <p className="font-semibold text-slate-300 text-sm">No Failures in the Last 24 Hours</p>
          <p className="text-slate-500 mt-1">All provider plan purchases are executing cleanly.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3">Time</th>
                <th className="py-3 px-3">Network</th>
                <th className="py-3 px-3">Plan Name</th>
                <th className="py-3 px-3">Provider Plan ID</th>
                <th className="py-3 px-3">Amount</th>
                <th className="py-3 px-3">Provider</th>
                <th className="py-3 px-3">Error Returned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {failures.map((f) => (
                <tr key={f.id} className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                    {new Date(f.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-200 border border-slate-700">
                      {f.network}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-white font-medium">{f.plan_name || 'N/A'}</td>
                  <td className="py-3 px-3 font-mono text-indigo-300 font-semibold">
                    {f.provider_plan_id}
                  </td>
                  <td className="py-3 px-3 text-slate-300 font-medium">₦{f.amount}</td>
                  <td className="py-3 px-3 text-slate-400 capitalize">{f.provider || 'mozosubz'}</td>
                  <td className="py-3 px-3 text-rose-300 max-w-xs truncate" title={f.error_message}>
                    {f.error_message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
