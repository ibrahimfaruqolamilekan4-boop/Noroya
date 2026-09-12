import React from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';

const authedFetch = async (url: string, options: RequestInit = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated. Please log in again.');
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      ...(options.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json;
};

const statusBadge = (status: string) => {
  const s = (status || '').toLowerCase();
  const color =
    s === 'success' || s === 'completed' || s === 'ok' ? 'bg-emerald-100 text-emerald-700' :
    s === 'pending' ? 'bg-amber-100 text-amber-700' :
    s === 'failed' || s === 'error' ? 'bg-red-100 text-red-700' :
    s === 'refunded' ? 'bg-blue-100 text-blue-700' :
    'bg-slate-100 text-slate-600';
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${color}`}>{status || 'unknown'}</span>;
};

// ─── Dashboard Overview ──────────────────────────────────────────────────
export function DashboardOverviewTab() {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const json = await authedFetch('/api/admin/dashboard-summary');
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-8 text-center text-slate-400 font-sans">Loading dashboard…</div>;
  if (error) return <div className="p-8 text-center text-red-500 font-sans">{error}</div>;
  if (!data) return null;

  const cards = [
    { label: 'Total Users', value: data.users.total.toLocaleString(), sub: `+${data.users.today} today · +${data.users.week} this week` },
    { label: 'Wallet Liability', value: formatCurrency(data.walletLiability), sub: 'Total across all users' },
    { label: 'Revenue (30d)', value: formatCurrency(data.revenueProxy30d), sub: data.revenueProxyNote },
    { label: 'Transactions Today', value: data.transactions.today.toLocaleString(), sub: `${data.transactions.week} this week · ${data.transactions.month} this month` },
    { label: 'Success Rate (30d)', value: `${data.successRatePercent30d}%`, sub: 'Across all transaction types' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest font-black text-slate-400 font-sans">{c.label}</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1 font-sans">{c.value}</p>
            <p className="text-xs text-slate-400 mt-1 font-sans">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h4 className="text-sm font-black text-slate-800 mb-3 font-sans">Top Types (Last 30 Days)</h4>
          <div className="space-y-2">
            {(data.topPlans || []).map((p: any) => (
              <div key={p.type} className="flex justify-between text-sm font-sans">
                <span className="text-slate-600">{p.type}</span>
                <span className="font-bold text-slate-900">{p.count}</span>
              </div>
            ))}
            {(!data.topPlans || data.topPlans.length === 0) && <p className="text-xs text-slate-400 font-sans">No data yet.</p>}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h4 className="text-sm font-black text-slate-800 mb-3 font-sans">Recent Activity</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(data.recentActivity || []).map((tx: any) => (
              <div key={tx.id} className="flex justify-between items-center text-xs font-sans border-b border-slate-100 pb-2">
                <div>
                  <p className="font-bold text-slate-700">{tx.user_email || 'Unknown'}</p>
                  <p className="text-slate-400">{tx.type} · {new Date(tx.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900">{formatCurrency(Number(tx.amount || 0))}</p>
                  {statusBadge(tx.status)}
                </div>
              </div>
            ))}
            {(!data.recentActivity || data.recentActivity.length === 0) && <p className="text-xs text-slate-400 font-sans">No transactions yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── All-Users Transactions ──────────────────────────────────────────────
export function TransactionsTab() {
  const [rows, setRows] = React.useState<any[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [type, setType] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const limit = 25;

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      if (search) params.set('search', search);
      const json = await authedFetch(`/api/admin/transactions?${params.toString()}`);
      setRows(json.transactions || []);
      setTotal(json.total || 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [status, type, search, page]);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search email, phone, reference…"
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-sans flex-1 min-w-[200px]"
        />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-sans">
          <option value="">All Statuses</option>
          <option value="success">Success</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
        <input
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(0); }}
          placeholder="Type (data, airtime, funding…)"
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-sans"
        />
        <button onClick={load} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold font-sans">Refresh</button>
      </div>

      {error && <p className="text-red-500 text-sm font-sans">{error}</p>}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm font-sans">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">User</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Amount</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Reference</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="text-center py-6 text-slate-400">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="text-center py-6 text-slate-400">No transactions found.</td></tr>
            )}
            {!loading && rows.map((tx: any) => (
              <React.Fragment key={tx.id}>
                <tr
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setExpanded(expanded === String(tx.id) ? null : String(tx.id))}
                >
                  <td className="px-4 py-3 text-slate-500">{new Date(tx.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-slate-800">{tx.user_email || tx.user_id || '—'}</td>
                  <td className="px-4 py-3">{tx.type || tx.transaction_type || '—'}</td>
                  <td className="px-4 py-3 font-bold">{formatCurrency(Number(tx.amount || 0))}</td>
                  <td className="px-4 py-3">{statusBadge(tx.status)}</td>
                  <td className="px-4 py-3 text-slate-400">{tx.reference || tx.api_reference || '—'}</td>
                </tr>
                {expanded === String(tx.id) && (
                  <tr className="bg-slate-50">
                    <td colSpan={6} className="px-4 py-3">
                      <pre className="text-xs whitespace-pre-wrap break-all text-slate-600">{JSON.stringify(tx, null, 2)}</pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center text-sm font-sans">
        <p className="text-slate-500">{total} total transactions</p>
        <div className="flex gap-2">
          <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Prev</button>
          <button disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}

// ─── User Management (list, detail, balance adjust) ──────────────────────
export function UserManagementTab() {
  const [rows, setRows] = React.useState<any[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [selectedUser, setSelectedUser] = React.useState<any>(null);
  const [detail, setDetail] = React.useState<any>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [adjustAmount, setAdjustAmount] = React.useState('');
  const [adjustDirection, setAdjustDirection] = React.useState<'credit' | 'debit'>('credit');
  const [adjustReason, setAdjustReason] = React.useState('');
  const [adjusting, setAdjusting] = React.useState(false);
  const [isBanning, setIsBanning] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const limit = 20;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
      if (search) params.set('search', search);
      const json = await authedFetch(`/api/admin/users?${params.toString()}`);
      setRows(json.users || []);
      setTotal(json.total || 0);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  React.useEffect(() => { load(); }, [load]);

  const openUser = async (u: any) => {
    setSelectedUser(u);
    setDetail(null);
    setDetailLoading(true);
    setMessage('');
    try {
      const json = await authedFetch(`/api/admin/users/${u.id}`);
      setDetail(json);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const submitBan = async () => {
    if (!selectedUser) return;
    if (!window.confirm(`Are you sure you want to permanently BAN ${selectedUser.email}? This will revoke their access completely.`)) return;
    
    setIsBanning(true);
    setMessage('');
    try {
      const json = await authedFetch(`/api/admin/users/${selectedUser.id}/ban`, {
        method: 'POST'
      });
      setMessage('User has been banned successfully.');
      await load();
      setSelectedUser(null);
    } catch(e: any) {
      setMessage(e.message);
    } finally {
      setIsBanning(false);
    }
  };

  const submitAdjustment = async () => {
    if (!selectedUser || !adjustAmount || Number(adjustAmount) <= 0 || !adjustReason.trim()) {
      setMessage('Enter a valid amount and a reason.');
      return;
    }
    setAdjusting(true);
    setMessage('');
    try {
      const json = await authedFetch(`/api/admin/users/${selectedUser.id}/adjust-balance`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(adjustAmount), direction: adjustDirection, reason: adjustReason.trim() }),
      });
      if (json.warning) {
        // Balance changed but a ledger/audit write failed — never hide this.
        setMessage(`⚠ ${json.warning}`);
      } else {
        setMessage(`Success! New balance: ${formatCurrency(Number(json.newBalance || 0))}`);
      }
      setAdjustAmount('');
      setAdjustReason('');
      await openUser(selectedUser);
      await load();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-3 space-y-3">
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search email, name, phone…"
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-sans flex-1"
          />
          <button onClick={load} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold font-sans">Refresh</button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm font-sans">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Balance</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4} className="text-center py-6 text-slate-400">Loading…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-slate-400">No users found.</td></tr>}
              {!loading && rows.map((u: any) => (
                <tr
                  key={u.id}
                  onClick={() => openUser(u)}
                  className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${selectedUser?.id === u.id ? 'bg-indigo-50' : ''}`}
                >
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-800">{u.full_name || u.name || '—'}</p>
                    <p className="text-slate-400 text-xs">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 font-bold">{formatCurrency(Number(u.wallet_balance || 0))}</td>
                  <td className="px-4 py-3">{u.role || 'customer'}</td>
                  <td className="px-4 py-3 text-slate-400">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center text-sm font-sans">
          <p className="text-slate-500">{total} total users</p>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Prev</button>
            <button disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>

      <div className="lg:col-span-2">
        {!selectedUser && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-400 text-sm font-sans">
            Select a user to view details and adjust their balance.
          </div>
        )}
        {selectedUser && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div>
              <p className="font-black text-slate-900 font-sans">{detail?.user?.full_name || selectedUser.full_name || selectedUser.email}</p>
              <p className="text-xs text-slate-400 font-sans">{selectedUser.email}</p>
            </div>

            {detailLoading && <p className="text-xs text-slate-400 font-sans">Loading detail…</p>}

            {detail && (
              <>
                <div className="grid grid-cols-2 gap-2 text-xs font-sans">
                  <div className="bg-slate-50 rounded-lg p-2">
                    <p className="text-slate-400">Wallet Balance</p>
                    <p className="font-bold text-slate-900">{formatCurrency(Number(detail.user.wallet_balance || 0))}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <p className="text-slate-400">Phone</p>
                    <p className="font-bold text-slate-900">{detail.user.phone_number || '—'}</p>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <p className="text-xs font-black uppercase text-slate-400 font-sans">Adjust Balance</p>
                  <div className="flex gap-2">
                    <button onClick={() => setAdjustDirection('credit')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${adjustDirection === 'credit' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>Credit</button>
                    <button onClick={() => setAdjustDirection('debit')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${adjustDirection === 'debit' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500'}`}>Debit</button>
                  </div>
                  <input
                    type="number"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    placeholder="Amount (₦)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-sans"
                  />
                  <input
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="Reason (required)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-sans"
                  />
                  <button
                    onClick={submitAdjustment}
                    disabled={adjusting || isBanning}
                    className="w-full py-2 rounded-lg bg-slate-900 text-white text-sm font-bold font-sans disabled:opacity-50"
                  >
                    {adjusting ? 'Processing…' : `${adjustDirection === 'credit' ? 'Credit' : 'Debit'} Wallet`}
                  </button>
                  
                  <button
                    onClick={submitBan}
                    disabled={isBanning || adjusting}
                    className="w-full py-2 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 border border-red-200 text-sm font-bold font-sans disabled:opacity-50 mt-4 transition-colors"
                  >
                    {isBanning ? 'Banning...' : '🚫 Ban User'}
                  </button>

                  {message && <p className="text-xs text-center font-sans text-indigo-600 mt-2">{message}</p>}
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs font-black uppercase text-slate-400 mb-2 font-sans">Recent Transactions</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {(detail.transactions || []).slice(0, 15).map((tx: any) => (
                      <div key={tx.id} className="flex justify-between text-xs font-sans">
                        <span className="text-slate-500">{tx.type} · {new Date(tx.created_at).toLocaleDateString()}</span>
                        <span className="font-bold">{formatCurrency(Number(tx.amount || 0))}</span>
                      </div>
                    ))}
                    {(!detail.transactions || detail.transactions.length === 0) && <p className="text-xs text-slate-400 font-sans">No transactions yet.</p>}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Provider Status ──────────────────────────────────────────────────────
export function ProviderStatusTab() {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const json = await authedFetch('/api/admin/mozosubz-status');
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const statusColor = (s: string) =>
    s === 'ok' ? 'bg-emerald-100 text-emerald-700' :
    s === 'key_revoked' ? 'bg-amber-100 text-amber-700' :
    s === 'timeout' ? 'bg-orange-100 text-orange-700' :
    'bg-red-100 text-red-700';

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          {data && (
            <p className={`font-black text-sm font-sans ${data.healthyCount === data.totalCount ? 'text-emerald-600' : 'text-amber-600'}`}>
              {data.summary}
            </p>
          )}
          {data && <p className="text-xs text-slate-400 font-sans">Last checked: {new Date(data.checkedAt).toLocaleString()}</p>}
        </div>
        <button onClick={load} disabled={loading} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold font-sans disabled:opacity-50">
          {loading ? 'Checking…' : 'Recheck Now'}
        </button>
      </div>

      {error && <p className="text-red-500 text-sm font-sans">{error}</p>}

      {data && (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm font-sans">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Service</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Latency</th>
                  <th className="text-left px-4 py-3">Message</th>
                </tr>
              </thead>
              <tbody>
                {data.services.map((s: any) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-bold text-slate-800">{s.label}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${statusColor(s.status)}`}>{s.status}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{s.latencyMs}ms</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{s.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex justify-between items-center text-sm font-sans">
            <span className="text-slate-500">Supabase Database</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${data.supabase.status === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              {data.supabase.status} · {data.supabase.latencyMs}ms
            </span>
          </div>
        </>
      )}
    </div>
  );
}
