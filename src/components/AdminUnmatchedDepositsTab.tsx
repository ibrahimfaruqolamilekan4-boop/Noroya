import React from 'react';
import { 
  AlertCircle, 
  CheckCircle2, 
  Search, 
  RefreshCw, 
  Wallet, 
  ArrowRight, 
  UserCheck, 
  ShieldAlert,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Clock,
  Building2,
  FileText
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, cn } from '../lib/utils';

interface UnmatchedPayment {
  id: string;
  reference: string;
  event_id: string | null;
  amount: number;
  account_number: string | null;
  sender_name: string | null;
  sender_bank: string | null;
  sender_account_number: string | null;
  narration: string | null;
  raw_payload: any;
  status: 'pending' | 'credited' | 'rejected' | 'ignored_status';
  candidate_user_id: string | null;
  candidate_reason: string | null;
  resolved_user_id: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  notes: string | null;
  created_at: string;
}

export function AdminUnmatchedDepositsTab() {
  const { user } = useAuth();
  const [payments, setPayments] = React.useState<UnmatchedPayment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [filterStatus, setFilterStatus] = React.useState<'all' | 'pending' | 'credited'>('pending');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [expandedRow, setExpandedRow] = React.useState<string | null>(null);

  // Credit Modal State
  const [creditModalPayment, setCreditModalPayment] = React.useState<UnmatchedPayment | null>(null);
  const [userQuery, setUserQuery] = React.useState('');
  const [userResults, setUserResults] = React.useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<any | null>(null);
  const [adminNotes, setAdminNotes] = React.useState('');
  const [submittingCredit, setSubmittingCredit] = React.useState(false);

  const getAuthHeaders = React.useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return {
        'Content-Type': 'application/json',
        'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        'x-admin-email': user?.email || '',
      };
    } catch (_) {
      return {
        'Content-Type': 'application/json',
        'x-admin-email': user?.email || '',
      };
    }
  }, [user]);

  const fetchPayments = React.useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/bachs/unmatched-payments', { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPayments(data.payments || []);
    } catch (err: any) {
      console.error('[AdminUnmatchedDepositsTab Fetch Error]:', err);
      toast.error(`Failed to load unmatched payments: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  React.useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Sync payments from Bachs.io API (last 30 days reconciliation)
  const handleSyncBachs = async () => {
    setSyncing(true);
    const toastId = toast.loading('Reconciling Bachs.io bank deposits (last 30 days)…');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/bachs/sync-deposits', {
        method: 'POST',
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Sync failed with status ${res.status}`);
      }
      toast.success(
        data.message || `Reconciliation complete: ${data.newlyAdded || 0} unmatched deposits added to review queue.`,
        { id: toastId, duration: 6000 }
      );
      fetchPayments();
    } catch (err: any) {
      console.error('[Sync Bachs Error]:', err);
      toast.error(err.message || 'Failed to sync with Bachs.io', { id: toastId });
    } finally {
      setSyncing(false);
    }
  };

  // Search user profiles for manual attribution
  React.useEffect(() => {
    if (!creditModalPayment) return;
    const cleanQ = userQuery.trim();
    if (cleanQ.length < 2) {
      setUserResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, full_name, name, phone_number, wallet_balance, balance')
          .or(`email.ilike.%${cleanQ}%,full_name.ilike.%${cleanQ}%,phone_number.ilike.%${cleanQ}%`)
          .limit(8);

        if (!error && data) {
          setUserResults(data);
        }
      } catch (err) {
        console.error('[User Search Error]:', err);
      } finally {
        setSearchingUsers(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [userQuery, creditModalPayment]);

  const openCreditModal = async (payment: UnmatchedPayment) => {
    setCreditModalPayment(payment);
    setSelectedUser(null);
    setAdminNotes(`Manually credited by ${user?.email} on ${new Date().toLocaleDateString()}`);

    // Pre-populate candidate if available
    if (payment.candidate_user_id) {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, email, full_name, name, phone_number, wallet_balance, balance')
          .eq('id', payment.candidate_user_id)
          .maybeSingle();
        if (data) {
          setSelectedUser(data);
          setUserQuery(data.email || data.full_name || '');
          return;
        }
      } catch (_) {}
    }

    // Pre-populate search query with narration email or sender name
    if (payment.narration) {
      const emailMatch = payment.narration.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        setUserQuery(emailMatch[0]);
        return;
      }
    }
    if (payment.sender_name) {
      setUserQuery(payment.sender_name);
    } else {
      setUserQuery('');
    }
  };

  const handleExecuteCredit = async () => {
    if (!creditModalPayment || !selectedUser) {
      toast.error('Please select a target user profile to credit.');
      return;
    }

    setSubmittingCredit(true);
    const toastId = toast.loading(`Crediting ₦${creditModalPayment.amount.toLocaleString()} to ${selectedUser.email}…`);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/bachs/resolve-unmatched', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          unmatchedId: creditModalPayment.id,
          targetUserId: selectedUser.id,
          notes: adminNotes.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `Failed with status ${res.status}`);
      }

      toast.success(
        `Successfully credited ₦${creditModalPayment.amount.toLocaleString()} to ${selectedUser.email}!`,
        { id: toastId, duration: 6000 }
      );
      setCreditModalPayment(null);
      setSelectedUser(null);
      fetchPayments();
    } catch (err: any) {
      console.error('[Credit Execution Error]:', err);
      toast.error(err.message || 'Failed to credit payment', { id: toastId });
    } finally {
      setSubmittingCredit(false);
    }
  };

  const filteredPayments = React.useMemo(() => {
    return payments.filter((p) => {
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        p.reference.toLowerCase().includes(term) ||
        (p.sender_name && p.sender_name.toLowerCase().includes(term)) ||
        (p.sender_bank && p.sender_bank.toLowerCase().includes(term)) ||
        (p.narration && p.narration.toLowerCase().includes(term)) ||
        (p.account_number && p.account_number.includes(term)) ||
        String(p.amount).includes(term)
      );
    });
  }, [payments, filterStatus, searchTerm]);

  const pendingCount = payments.filter((p) => p.status === 'pending').length;

  return (
    <div className="space-y-6 text-left">
      {/* ── Banner Header ── */}
      <div className="bg-surface-muted rounded-3xl border-2 border-emerald-500/40 p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-bold text-emerald-300">
                Super Admin Virtual Account Reconciliation Desk
              </span>
            </div>
            <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Bachs.io Unmatched Deposits
            </h3>
            <p className="text-xs md:text-sm text-emerald-100/80 max-w-2xl leading-relaxed">
              Every bank transfer sent to your Bachs.io virtual accounts is preserved here with complete raw audit trails.
              If a customer enters an unparseable email or bank remark, review and credit their wallet with 1-click. Zero silent drops.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="bg-emerald-900/60 border border-emerald-500/30 rounded-2xl px-4 py-3 text-center">
              <span className="text-[10px] font-bold text-emerald-300 block">Pending Review</span>
              <span className="text-2xl font-bold text-amber-400 font-mono">{pendingCount}</span>
            </div>
            <button
              type="button"
              onClick={handleSyncBachs}
              disabled={syncing}
              className="px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={14} className={cn(syncing && 'animate-spin')} />
              <span>{syncing ? 'Reconciling…' : 'Sync Bachs (30d)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Filters & Search Controls ── */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {(['pending', 'credited', 'all'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={cn(
                'px-4 py-2 text-xs font-bold  rounded-xl transition cursor-pointer',
                filterStatus === st
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              )}
            >
              {st === 'pending' ? `Pending (${pendingCount})` : st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-80">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by ref, sender, bank, narration…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* ── Deposits Table ── */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <Loader2 size={32} className="animate-spin text-emerald-600 mx-auto" />
            <p className="text-xs font-bold text-slate-500">Loading unmatched payments ledger…</p>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <CheckCircle2 size={40} className="text-emerald-500 mx-auto" />
            <h4 className="font-bold text-slate-800 text-base">No {filterStatus} unmatched payments</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              All incoming Bachs.io virtual account payments have either been automatically matched or successfully resolved.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[10px] tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Time / Reference</th>
                  <th className="px-5 py-3.5">Amount</th>
                  <th className="px-5 py-3.5">Sender Info</th>
                  <th className="px-5 py-3.5">Transfer Narration</th>
                  <th className="px-5 py-3.5">Status / Resolution</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredPayments.map((p) => {
                  const isExpanded = expandedRow === p.id;
                  const isCredited = p.status === 'credited';

                  return (
                    <React.Fragment key={p.id}>
                      <tr className={cn('hover:bg-slate-50/80 transition', isCredited && 'bg-slate-50/40')}>
                        <td className="px-5 py-4 space-y-1">
                          <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                            <Clock size={12} />
                            <span>{new Date(p.created_at).toLocaleString()}</span>
                          </div>
                          <p className="font-mono font-bold text-slate-900 text-xs">{p.reference}</p>
                          {p.account_number && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                              VA: {p.account_number}
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span className="text-base font-bold text-emerald-700 font-mono">
                            {formatCurrency(p.amount)}
                          </span>
                        </td>

                        <td className="px-5 py-4 space-y-0.5">
                          <p className="font-bold text-slate-900">{p.sender_name || 'Anonymous Transfer'}</p>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Building2 size={12} className="text-slate-400" />
                            <span>{p.sender_bank || 'Bank Transfer'}</span>
                            {p.sender_account_number && (
                              <span className="font-mono text-slate-400">({p.sender_account_number})</span>
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-4 max-w-xs">
                          <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-2 font-mono text-[11px] text-amber-950 break-words">
                            {p.narration || <span className="text-amber-500 italic">No narration provided</span>}
                          </div>
                          {p.candidate_reason && (
                            <p className="text-[10px] text-indigo-600 mt-1 font-semibold flex items-center gap-1">
 <span> {p.candidate_reason}</span>
                            </p>
                          )}
                        </td>

                        <td className="px-5 py-4 space-y-1">
                          <span
                            className={cn(
                              'px-2.5 py-1 rounded-full text-[10px] font-bold  inline-flex items-center gap-1',
                              p.status === 'pending'
                                ? 'bg-amber-100 text-amber-900'
                                : p.status === 'credited'
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-slate-100 text-slate-600'
                            )}
                          >
 {p.status === 'pending' ? '⏳ Pending' : p.status === 'credited' ? ' Credited' : p.status}
                          </span>
                          {p.resolved_at && (
                            <p className="text-[10px] text-slate-400">
                              Resolved: {new Date(p.resolved_at).toLocaleDateString()}
                            </p>
                          )}
                        </td>

                        <td className="px-5 py-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => setExpandedRow(isExpanded ? null : p.id)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                            title="Inspect raw payload"
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>

                          {p.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => openCreditModal(p)}
                              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-sm inline-flex items-center gap-1 cursor-pointer"
                            >
                              <UserCheck size={13} />
                              <span>Credit User</span>
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Collapsible Raw Payload Inspector */}
                      {isExpanded && (
                        <tr className="bg-slate-900 text-slate-200">
                          <td colSpan={6} className="p-4 text-xs font-mono">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-700 text-slate-400">
                              <span className="font-bold ">Raw Bachs.io Webhook Payload</span>
                              <span className="text-[10px]">Reference: {p.reference}</span>
                            </div>
                            <pre className="mt-2 text-[11px] overflow-x-auto p-3 bg-black/50 rounded-xl">
                              {JSON.stringify(p.raw_payload, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 1-Click Credit User Modal ── */}
      {creditModalPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl space-y-5 border border-slate-200 text-left">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  Manual Virtual Account Resolution
                </span>
                <h4 className="text-xl font-bold text-slate-900 mt-1">
                  Credit ₦{creditModalPayment.amount.toLocaleString()} to User
                </h4>
                <p className="text-xs text-slate-500">
                  Ref: <span className="font-mono font-bold text-slate-700">{creditModalPayment.reference}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreditModalPayment(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
              >
 
              </button>
            </div>

            {/* Deposit summary box */}
            <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 text-xs space-y-1.5 text-emerald-950">
              <div className="flex justify-between">
                <span className="text-slate-500">Sender Name:</span>
                <span className="font-semibold">{creditModalPayment.sender_name || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Sender Bank:</span>
                <span className="font-semibold">{creditModalPayment.sender_bank || 'Bank Transfer'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Bank Narration:</span>
                <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200 font-semibold">
                  {creditModalPayment.narration || '(Empty)'}
                </span>
              </div>
            </div>

            {/* Search target user */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Find User Profile to Credit (by Email, Full Name, or Phone):
              </label>
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="e.g. faruq@gmail.com or 08012345678"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                />
                {searchingUsers && (
                  <Loader2 size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />
                )}
              </div>

              {/* User search results list */}
              {userResults.length > 0 && !selectedUser && (
                <div className="border border-slate-200 rounded-2xl p-1 bg-white shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {userResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setSelectedUser(u);
                        setUserResults([]);
                      }}
                      className="w-full text-left p-2.5 hover:bg-emerald-50 rounded-xl transition cursor-pointer flex items-center justify-between"
                    >
                      <div>
                        <p className="font-bold text-slate-900">{u.full_name || u.name || 'Unnamed User'}</p>
                        <p className="text-[11px] text-slate-500">{u.email} · {u.phone_number || 'No phone'}</p>
                      </div>
                      <span className="text-[11px] font-mono font-bold text-emerald-700">
                        {formatCurrency(u.wallet_balance ?? u.balance ?? 0)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected User Confirmation Box */}
              {selectedUser && (
                <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-2 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-emerald-400 tracking-wider">
                      Selected Target User
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedUser(null)}
                      className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
                    >
                      Change User
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm">{selectedUser.full_name || selectedUser.name || 'User'}</p>
                      <p className="text-xs text-slate-400">{selectedUser.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400">Current Balance</p>
                      <p className="font-mono font-bold text-sm text-slate-200">
                        {formatCurrency(selectedUser.wallet_balance ?? selectedUser.balance ?? 0)}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-slate-800 pt-2 flex items-center justify-between text-xs">
                    <span className="text-emerald-300 font-semibold">New Balance After Credit:</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {formatCurrency(Number(selectedUser.wallet_balance ?? selectedUser.balance ?? 0) + Number(creditModalPayment.amount))}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Admin audit notes */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Admin Audit Notes:</label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Reason for manual attribution (e.g. verified with bank receipt via WhatsApp)"
                rows={2}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-medium text-slate-800 focus:outline-none focus:border-emerald-600"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCreditModalPayment(null)}
                disabled={submittingCredit}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteCredit}
                disabled={!selectedUser || submittingCredit}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submittingCredit ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                <span>Confirm & Credit Wallet</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
