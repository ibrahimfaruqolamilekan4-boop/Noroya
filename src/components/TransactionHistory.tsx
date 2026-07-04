import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  RefreshCw, 
  Download, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CheckCircle2, 
  AlertCircle, 
  Clock,
  History,
  HelpCircle,
  TrendingUp,
  FileText
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import type { UserProfile, Transaction } from '../types';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';

interface TransactionHistoryProps {
  user: UserProfile;
  onSelectTx?: (tx: Transaction) => void;
}

export default function TransactionHistory({ user, onSelectTx }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'funding' | 'purchase' | 'success' | 'pending' | 'failed'>('all');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const fetchTransactions = async (showToast = false) => {
    if (showToast) {
      setIsSyncing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // Query past transactions from the 'transactions' Supabase table
      const { data, error: fetchErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('userId', user.uid)
        .order('createdAt', { ascending: false });

      if (fetchErr) {
        throw fetchErr;
      }

      setTransactions(data || []);
      
      if (showToast) {
        toast.success("Transaction ledger refreshed from live database! ⚡", { icon: "🔥" });
      }
    } catch (err: any) {
      console.error("[TransactionHistory Supabase Fetch Error]:", err);
      setError(err.message || "Failed to query transaction records.");
      toast.error("Could not load transaction logs from Supabase.");
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchTransactions();

    // Subscribe to live Postgres changes on the transactions table for this user
    const channel = supabase
      .channel(`live-transactions-${user.uid}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `userId=eq.${user.uid}`
        },
        () => {
          // Re-fetch transactions silently to keep user dashboard up to date
          fetchTransactions(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user.uid]);

  const handleSync = () => {
    fetchTransactions(true);
  };

  const handleDownloadCSV = () => {
    if (transactions.length === 0) {
      toast.error("No transactions to export!");
      return;
    }
    const headers = ["ID", "Description", "Type", "Amount", "Status", "Reference", "API_Reference", "Created_At"];
    const rows = transactions.map(tx => [
      tx.id,
      tx.description || '',
      tx.type || 'vtu',
      tx.type === 'funding' ? `+${tx.amount}` : `-${tx.amount}`,
      tx.status || 'success',
      tx.reference || 'N/A',
      (tx as any).api_reference || 'N/A',
      new Date(tx.createdAt).toLocaleString()
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `noroya_payment_ledger_${user.uid.slice(0, 6)}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV transaction table downloaded successfully!", { icon: "📋" });
  };

  // Filter and search logic
  const filtered = transactions.filter(tx => {
    const term = searchText.toLowerCase();
    const desc = (tx.description || '').toLowerCase();
    const ref = (tx.reference || '').toLowerCase();
    const type = (tx.type || '').toLowerCase();
    const matchesSearch = desc.includes(term) || ref.includes(term) || type.includes(term);

    if (!matchesSearch) return false;

    if (statusFilter === 'all') return true;
    if (statusFilter === 'funding') return tx.type === 'funding';
    if (statusFilter === 'purchase') return tx.type !== 'funding';
    
    const lowerStatus = String(tx.status).toLowerCase();
    if (statusFilter === 'success') return lowerStatus === 'success' || lowerStatus === 'completed' || lowerStatus === 'successful';
    if (statusFilter === 'pending') return lowerStatus === 'pending';
    if (statusFilter === 'failed') return lowerStatus === 'failed' || lowerStatus === 'reversed';
    
    return true;
  });

  return (
    <div className="space-y-6 font-sans">
      {/* Neo-Brutalist Main Header Card */}
      <div className="bg-amber-400 text-black border-2 border-black p-6 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-6 h-6 animate-pulse" />
            <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tight">Supabase Purchase Logs</h3>
          </div>
          <p className="text-xs font-bold text-black/80 mt-1 uppercase tracking-wider font-mono">
            Direct Cloud Connection • Real-time Sync Active
          </p>
        </div>
        <div className="flex gap-3 w-full md:w-auto shrink-0 font-sans">
          <button 
            onClick={handleSync}
            disabled={isSyncing || loading}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white border-2 border-black hover:bg-slate-50 text-black px-4 py-3 text-xs font-black uppercase tracking-wider rounded-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={13} className={cn(isSyncing && "animate-spin")} />
            {isSyncing ? "Syncing..." : "Sync Logs"}
          </button>
          <button 
            onClick={handleDownloadCSV}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-600 border-2 border-black hover:bg-blue-500 text-white px-4 py-3 text-xs font-black uppercase tracking-wider rounded-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer active:scale-95"
          >
            <Download size={13} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter and Search Bar Card */}
      <div className="bg-white border-2 border-black rounded-2xl p-4 md:p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-4 text-black">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text"
              placeholder="Find transactions by description, reference, or type (data, airtime, cable...)..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-black rounded-xl text-xs font-bold focus:outline-none placeholder:text-slate-400 font-sans shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-black"
            />
          </div>
          
          {/* Status Filter Scroll List */}
          <div className="flex items-center gap-2 bg-slate-50 border-2 border-black px-3 py-1.5 rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] overflow-x-auto whitespace-nowrap scrollbar-none">
            <Filter size={14} className="text-slate-500 shrink-0 ml-1" />
            <div className="flex gap-1">
              {[
                { id: 'all', label: 'All Logs' },
                { id: 'funding', label: 'Fundings' },
                { id: 'purchase', label: 'Purchases' },
                { id: 'success', label: 'Success' },
                { id: 'pending', label: 'Pending' },
                { id: 'failed', label: 'Failed' }
              ].map((filt) => (
                <button
                  key={filt.id}
                  onClick={() => setStatusFilter(filt.id as any)}
                  className={cn(
                    "text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-all cursor-pointer",
                    statusFilter === filt.id 
                      ? "bg-black text-white hover:bg-black/95" 
                      : "text-slate-700 hover:bg-slate-200"
                  )}
                >
                  {filt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Transactions Render Area */}
      {loading ? (
        <div className="bg-white border-2 border-black rounded-2xl p-16 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center justify-center gap-4 text-black">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-bold uppercase tracking-wider animate-pulse">Loading Live Supabase Transactions...</p>
        </div>
      ) : error ? (
        <div className="bg-white border-2 border-black rounded-2xl p-12 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-black">
          <div className="w-12 h-12 rounded-full bg-red-100 border-2 border-black flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} className="text-red-600" />
          </div>
          <h4 className="font-black text-red-600 uppercase tracking-tight">Failed to fetch transactions</h4>
          <p className="text-xs text-slate-500 font-bold uppercase mt-1">{error}</p>
          <button 
            onClick={() => fetchTransactions()}
            className="mt-4 bg-black text-white px-4 py-2 text-xs font-black uppercase rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px] transition-all"
          >
            Retry Fetch
          </button>
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-4">
          {filtered.map(tx => {
            const isFunding = tx.type === 'funding';
            const isSuccess = String(tx.status).toLowerCase() === 'success' || String(tx.status).toLowerCase() === 'successful' || String(tx.status).toLowerCase() === 'completed';
            const isPending = String(tx.status).toLowerCase() === 'pending';
            
            // Format nice display type name
            let typeLabel = tx.type || 'VTU';
            if (typeLabel === 'data') typeLabel = 'Data Bundle';
            if (typeLabel === 'airtime') typeLabel = 'Airtime VTU';
            if (typeLabel === 'cable') typeLabel = 'Cable TV';
            if (typeLabel === 'electricity') typeLabel = 'Electricity';
            if (typeLabel === 'exam_pin') typeLabel = 'Exam Token';
            if (typeLabel === 'betting') typeLabel = 'Betting Funding';

            return (
              <div 
                key={tx.id}
                onClick={() => onSelectTx?.(tx)}
                className="bg-white border-2 border-black rounded-2xl p-4 md:p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-black"
              >
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className={cn(
                    "w-12 h-12 rounded-xl border-2 border-black flex items-center justify-center shrink-0 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]",
                    isFunding ? "bg-emerald-100 text-emerald-950" : "bg-rose-100 text-rose-950"
                  )}>
                    {isFunding ? <ArrowDownLeft size={22} className="stroke-[2.5]" /> : <ArrowUpRight size={22} className="stroke-[2.5]" />}
                  </div>
                  <div className="space-y-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <p className="font-extrabold text-sm text-slate-900 truncate uppercase tracking-tight">{tx.description || `${typeLabel} Transaction`}</p>
                      <span className="hidden md:inline-block px-2 py-0.5 bg-slate-100 border border-slate-300 rounded font-bold text-[8px] uppercase tracking-wider text-slate-600">
                        {typeLabel}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] font-bold text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {new Date(tx.createdAt).toLocaleDateString()} at {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {tx.reference && (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                          <span className="uppercase text-slate-400 select-all truncate max-w-[150px]">Ref: {tx.reference}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 gap-1.5">
                  <span className={cn(
                    "font-mono text-base md:text-lg font-black tracking-tight",
                    isFunding ? "text-emerald-600" : "text-slate-800"
                  )}>
                    {isFunding ? "+" : "-"}{formatCurrency(tx.amount)}
                  </span>
                  
                  <span className={cn(
                    "text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md border-2 border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]",
                    isSuccess ? "bg-emerald-300 text-emerald-950" : 
                    isPending ? "bg-amber-300 text-amber-950" : 
                    "bg-rose-300 text-rose-950"
                  )}>
                    {tx.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border-2 border-black rounded-2xl p-16 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-black">
          <div className="w-16 h-16 rounded-full bg-slate-50 border-2 border-black flex items-center justify-center mx-auto mb-4 animate-bounce">
            <span className="text-2xl">🔍</span>
          </div>
          <h4 className="font-black text-slate-700 uppercase tracking-tight">No Transactions Found</h4>
          <p className="text-xs text-slate-500 font-bold uppercase mt-1">Try resetting filters or click Sync Logs to refresh</p>
        </div>
      )}
    </div>
  );
}
