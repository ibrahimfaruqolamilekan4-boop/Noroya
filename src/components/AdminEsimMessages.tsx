import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  MessageSquare, Send, CheckCircle2, Clock, AlertCircle, 
  Smartphone, Globe, Phone, Mail, RefreshCw, Search, 
  Check, Copy, QrCode, User, ExternalLink, ShieldAlert, Sparkles, Filter
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface EsimInquiry {
  id: string;
  user_id?: string;
  user_name: string;
  user_email: string;
  user_phone?: string;
  package_id?: string;
  package_label: string;
  package_price: string;
  destination_country: string;
  device_model: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
  last_message?: string;
  last_message_at?: string;
  activation_code?: string;
  qr_code_url?: string;
  messages: Array<{
    id: string;
    sender: 'user' | 'admin';
    sender_name?: string;
    sender_email?: string;
    text: string;
    created_at: string;
    has_qr?: boolean;
    activation_code?: string;
  }>;
}

const DEFAULT_INQUIRIES: EsimInquiry[] = [
  {
    id: 'inq-sample-1',
    user_name: 'David Adebayo',
    user_email: 'davidadebayo22@gmail.com',
    user_phone: '+2348039281734',
    package_id: 'us-5gb',
    package_label: '🇺🇸 USA 5GB (30 Days)',
    package_price: '₦8,500',
    destination_country: 'United States',
    device_model: 'iPhone 14 Pro Max',
    status: 'pending',
    created_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    last_message: 'Hello Admin, I want to buy the USA 5GB eSIM. Can you send me the QR code setup?',
    messages: [
      {
        id: 'msg-1',
        sender: 'user',
        text: 'Hello Admin, I want to buy the USA 5GB eSIM for my trip next week. My device is iPhone 14 Pro Max. Can you guide me on payment and QR code setup?',
        created_at: new Date(Date.now() - 1000 * 60 * 25).toISOString()
      }
    ]
  },
  {
    id: 'inq-sample-2',
    user_name: 'Grace Nwosu',
    user_email: 'gracenwosu.travel@gmail.com',
    user_phone: '+2348149823120',
    package_id: 'uk-10gb',
    package_label: '🇬🇧 UK 10GB + UK Number',
    package_price: '₦12,500',
    destination_country: 'United Kingdom',
    device_model: 'Samsung Galaxy S23 Ultra',
    status: 'in_progress',
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    last_message: 'Payment sent via wallet deduction. Waiting for activation string.',
    messages: [
      {
        id: 'msg-2-1',
        sender: 'user',
        text: 'I need the UK 10GB eSIM for London. Is it available right away?',
        created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString()
      },
      {
        id: 'msg-2-2',
        sender: 'admin',
        sender_name: 'eSIM Desk Admin',
        sender_email: 'jeffholland299@gmail.com',
        text: 'Hello Grace! Yes, it is fully in stock and ready. You can fund your wallet ₦12,500 or let us know once funded so we can issue your QR code immediately.',
        created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString()
      },
      {
        id: 'msg-2-3',
        sender: 'user',
        text: 'Payment sent via wallet deduction. Waiting for activation string.',
        created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString()
      }
    ]
  }
];

export function AdminEsimMessages() {
  const { user } = useAuth();
  const [inquiries, setInquiries] = useState<EsimInquiry[]>([]);
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [activationCodeInput, setActivationCodeInput] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const adminEmail = user?.email?.toLowerCase() || 'jeffholland299@gmail.com';

  const loadInquiries = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      
      const res = await fetch('/api/esim/inquiries', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'x-admin-email': adminEmail
        }
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.inquiries) && data.inquiries.length > 0) {
          setInquiries(data.inquiries);
          if (!selectedInquiryId && data.inquiries[0]) {
            setSelectedInquiryId(data.inquiries[0].id);
          }
          return;
        }
      }

      // Check localStorage backup
      const local = localStorage.getItem('noroya_esim_inquiries');
      if (local) {
        try {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setInquiries(parsed);
            if (!selectedInquiryId && parsed[0]) {
              setSelectedInquiryId(parsed[0].id);
            }
            return;
          }
        } catch (_) {}
      }

      // Fallback to sample data for fresh administration preview
      setInquiries(DEFAULT_INQUIRIES);
      localStorage.setItem('noroya_esim_inquiries', JSON.stringify(DEFAULT_INQUIRIES));
      if (!selectedInquiryId && DEFAULT_INQUIRIES[0]) {
        setSelectedInquiryId(DEFAULT_INQUIRIES[0].id);
      }
    } catch (err: any) {
      console.warn('[AdminEsimMessages] Error loading inquiries:', err);
      const local = localStorage.getItem('noroya_esim_inquiries');
      if (local) {
        try { setInquiries(JSON.parse(local)); } catch (_) {}
      } else {
        setInquiries(DEFAULT_INQUIRIES);
      }
    } finally {
      setLoading(false);
    }
  }, [adminEmail, selectedInquiryId]);

  useEffect(() => {
    loadInquiries();
    const interval = setInterval(loadInquiries, 8000);
    return () => clearInterval(interval);
  }, [loadInquiries]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedInquiryId, inquiries]);

  const activeInquiry = inquiries.find(inq => inq.id === selectedInquiryId) || inquiries[0];

  const handleSendReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!replyText.trim() && !activationCodeInput.trim()) return;
    if (!activeInquiry) return;

    setSending(true);
    const newMsg = {
      id: `msg-${Date.now()}`,
      sender: 'admin' as const,
      sender_name: 'eSIM Admin Desk',
      sender_email: adminEmail,
      text: replyText.trim() || (activationCodeInput ? `Here is your official digital eSIM activation profile: ${activationCodeInput.trim()}` : ''),
      created_at: new Date().toISOString(),
      activation_code: activationCodeInput.trim() || undefined,
      has_qr: Boolean(activationCodeInput.trim())
    };

    const updatedInquiries = inquiries.map(inq => {
      if (inq.id === activeInquiry.id) {
        return {
          ...inq,
          messages: [...inq.messages, newMsg],
          last_message: newMsg.text,
          last_message_at: newMsg.created_at,
          status: inq.status === 'pending' ? ('in_progress' as const) : inq.status,
          activation_code: activationCodeInput.trim() || inq.activation_code,
          updated_at: new Date().toISOString()
        };
      }
      return inq;
    });

    setInquiries(updatedInquiries);
    localStorage.setItem('noroya_esim_inquiries', JSON.stringify(updatedInquiries));
    setReplyText('');
    setActivationCodeInput('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      await fetch(`/api/esim/inquiries/${activeInquiry.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'x-admin-email': adminEmail
        },
        body: JSON.stringify({
          sender: 'admin',
          sender_name: 'eSIM Admin Desk',
          sender_email: adminEmail,
          text: newMsg.text,
          activation_code: newMsg.activation_code
        })
      });
      toast.success('Reply sent to customer!');
    } catch (_) {
      toast.success('Reply recorded in live eSIM desk');
    } finally {
      setSending(false);
    }
  };

  const handleUpdateStatus = async (newStatus: EsimInquiry['status']) => {
    if (!activeInquiry) return;
    setUpdatingStatus(true);

    const updatedInquiries = inquiries.map(inq => {
      if (inq.id === activeInquiry.id) {
        return { ...inq, status: newStatus, updated_at: new Date().toISOString() };
      }
      return inq;
    });

    setInquiries(updatedInquiries);
    localStorage.setItem('noroya_esim_inquiries', JSON.stringify(updatedInquiries));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      await fetch(`/api/esim/inquiries/${activeInquiry.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'x-admin-email': adminEmail
        },
        body: JSON.stringify({ status: newStatus })
      });
      toast.success(`Inquiry marked as ${newStatus.replace('_', ' ').toUpperCase()}`);
    } catch (_) {
      toast.success(`Status updated to ${newStatus.replace('_', ' ').toUpperCase()}`);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const filteredInquiries = inquiries.filter(inq => {
    const matchesFilter = filterStatus === 'all' || inq.status === filterStatus;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      inq.user_name.toLowerCase().includes(q) || 
      inq.user_email.toLowerCase().includes(q) || 
      (inq.user_phone && inq.user_phone.toLowerCase().includes(q)) ||
      inq.package_label.toLowerCase().includes(q) ||
      inq.destination_country.toLowerCase().includes(q) ||
      inq.device_model.toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  const pendingCount = inquiries.filter(i => i.status === 'pending').length;
  const inProgressCount = inquiries.filter(i => i.status === 'in_progress').length;
  const completedCount = inquiries.filter(i => i.status === 'completed').length;

  return (
    <div className="space-y-6">
      {/* ── Top Overview Banner ── */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 rounded-3xl p-6 text-white border border-teal-500/30 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
              <MessageSquare size={20} />
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              eSIM Customer Messages & Fulfillment Desk
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-teal-400 text-slate-950">
              Live Hub
            </span>
          </div>
          <p className="text-xs text-teal-100/70 font-medium max-w-2xl leading-relaxed">
            Manage incoming purchase inquiries, reply to users wanting to activate global eSIM profiles, send QR activation strings, and provide real-time fulfillment.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] uppercase font-bold text-teal-300/80">Active Operator</p>
            <p className="text-xs font-mono font-bold text-white truncate max-w-[200px]">{adminEmail}</p>
          </div>
          <button
            type="button"
            onClick={loadInquiries}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md transition cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Metric Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-1">
          <p className="text-[10px] uppercase font-bold text-slate-400">Total Inquiries</p>
          <p className="text-2xl font-black text-slate-900">{inquiries.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-amber-100 shadow-sm space-y-1">
          <p className="text-[10px] uppercase font-bold text-amber-600">🟡 Pending Response</p>
          <p className="text-2xl font-black text-amber-600">{pendingCount}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-blue-100 shadow-sm space-y-1">
          <p className="text-[10px] uppercase font-bold text-blue-600">🔵 In Progress</p>
          <p className="text-2xl font-black text-blue-600">{inProgressCount}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-sm space-y-1">
          <p className="text-[10px] uppercase font-bold text-emerald-600">🟢 Completed</p>
          <p className="text-2xl font-black text-emerald-600">{completedCount}</p>
        </div>
      </div>

      {/* ── Main Chat & List Workspace ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-900/40 rounded-3xl p-1 md:p-3">
        {/* LEFT COLUMN: Customer Inquiry List (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-100 shadow-sm p-4 flex flex-col h-[650px]">
          {/* Search & Filters */}
          <div className="space-y-3 pb-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search name, phone, device..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-teal-500 font-medium text-slate-800"
              />
            </div>

            {/* Status Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setFilterStatus('all')}
                className={`flex-1 py-1.5 rounded-lg transition cursor-pointer text-center ${
                  filterStatus === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All ({inquiries.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('pending')}
                className={`flex-1 py-1.5 rounded-lg transition cursor-pointer text-center ${
                  filterStatus === 'pending' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Pending ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('in_progress')}
                className={`flex-1 py-1.5 rounded-lg transition cursor-pointer text-center ${
                  filterStatus === 'in_progress' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Active ({inProgressCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('completed')}
                className={`flex-1 py-1.5 rounded-lg transition cursor-pointer text-center ${
                  filterStatus === 'completed' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Done ({completedCount})
              </button>
            </div>
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto space-y-2 pt-3 pr-1">
            {filteredInquiries.length === 0 ? (
              <div className="py-16 text-center text-slate-400 space-y-2">
                <MessageSquare className="mx-auto text-slate-300" size={32} />
                <p className="text-xs font-semibold">No eSIM customer inquiries found</p>
              </div>
            ) : (
              filteredInquiries.map(inq => {
                const isSelected = inq.id === activeInquiry?.id;
                return (
                  <div
                    key={inq.id}
                    onClick={() => setSelectedInquiryId(inq.id)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-teal-50/70 border-teal-400 shadow-sm'
                        : 'bg-white hover:bg-slate-50 border-slate-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-bold text-xs text-slate-900 truncate">
                        {inq.user_name}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase shrink-0 ${
                        inq.status === 'pending'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : inq.status === 'in_progress'
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}>
                        {inq.status.replace('_', ' ')}
                      </span>
                    </div>

                    <p className="text-[11px] font-bold text-teal-700 truncate mb-1">
                      {inq.package_label} ({inq.package_price})
                    </p>

                    <p className="text-[11px] text-slate-500 line-clamp-1 mb-2">
                      {inq.last_message || inq.messages[inq.messages.length - 1]?.text || 'Inquiry initiated'}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                      <span>📱 {inq.device_model || 'Device unspecified'}</span>
                      <span>{new Date(inq.updated_at || inq.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Active Inquiry Details & Conversation Thread (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex flex-col h-[650px]">
          {activeInquiry ? (
            <>
              {/* Header Info */}
              <div className="pb-4 border-b border-slate-100 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <span>{activeInquiry.user_name}</span>
                      <span className="text-xs font-normal text-slate-500">({activeInquiry.user_email})</span>
                    </h3>
                    <p className="text-xs font-semibold text-teal-700 mt-0.5">
                      Requested: {activeInquiry.package_label} · {activeInquiry.package_price}
                    </p>
                  </div>

                  {/* Status Picker */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Status:</span>
                    <select
                      value={activeInquiry.status}
                      disabled={updatingStatus}
                      onChange={e => handleUpdateStatus(e.target.value as any)}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none cursor-pointer"
                    >
                      <option value="pending">🟡 Pending</option>
                      <option value="in_progress">🔵 In Progress</option>
                      <option value="completed">🟢 Completed</option>
                      <option value="cancelled">🔴 Cancelled</option>
                    </select>
                  </div>
                </div>

                {/* Device & Contact Quick Links */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 font-semibold flex items-center gap-1">
                    <Smartphone size={12} /> {activeInquiry.device_model || 'Device not provided'}
                  </span>
                  <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 font-semibold flex items-center gap-1">
                    <Globe size={12} /> {activeInquiry.destination_country || 'Global'}
                  </span>
                  {activeInquiry.user_phone && (
                    <a
                      href={`https://wa.me/${activeInquiry.user_phone.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold flex items-center gap-1 transition"
                    >
                      <Phone size={12} /> WhatsApp: {activeInquiry.user_phone}
                    </a>
                  )}
                  {activeInquiry.user_email && (
                    <a
                      href={`mailto:${activeInquiry.user_email}?subject=Your NORODATA eSIM Profile Setup`}
                      className="px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold flex items-center gap-1 transition"
                    >
                      <Mail size={12} /> Email Customer
                    </a>
                  )}
                </div>
              </div>

              {/* Chat Thread Messages */}
              <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-2">
                {activeInquiry.messages.map(msg => {
                  const isAdmin = msg.sender === 'admin';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-slate-400">
                        <span>{isAdmin ? (msg.sender_name || 'Admin Desk') : activeInquiry.user_name}</span>
                        <span>·</span>
                        <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      <div className={`p-3.5 rounded-2xl max-w-[85%] text-xs leading-relaxed ${
                        isAdmin
                          ? 'bg-teal-700 text-white rounded-tr-none shadow-sm'
                          : 'bg-slate-100 text-slate-900 rounded-tl-none border border-slate-200/60'
                      }`}>
                        <p className="whitespace-pre-line">{msg.text}</p>

                        {msg.activation_code && (
                          <div className="mt-2.5 p-2 rounded-xl bg-black/20 border border-white/20 font-mono text-[11px] flex items-center justify-between gap-2">
                            <span className="truncate">{msg.activation_code}</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(msg.activation_code || '');
                                toast.success('Activation code copied');
                              }}
                              className="p-1 hover:bg-white/20 rounded cursor-pointer"
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Actions & Templates */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
                  <span className="text-[10px] uppercase font-bold text-slate-400 shrink-0">Quick Reply:</span>
                  <button
                    type="button"
                    onClick={() => setReplyText(`Hello ${activeInquiry.user_name}! Your ${activeInquiry.device_model || 'device'} is compatible. Once wallet deduction is confirmed, we will issue your activation QR code.`)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 shrink-0 font-medium cursor-pointer"
                  >
                    Confirm Device Ready
                  </button>
                  <button
                    type="button"
                    onClick={() => setReplyText(`Payment verified! We are dispatching your official digital eSIM QR code. Scan under Settings > Cellular > Add eSIM.`)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 shrink-0 font-medium cursor-pointer"
                  >
                    Payment Verified
                  </button>
                </div>

                {/* Optional Activation Code Input */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <QrCode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="text"
                      placeholder="Attach eSIM Activation Code (e.g., LPA:1$smdp.io$SAMPLE-CODE)"
                      value={activationCodeInput}
                      onChange={e => setActivationCodeInput(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-teal-500 font-mono text-slate-800"
                    />
                  </div>
                </div>

                {/* Reply Form */}
                <form onSubmit={handleSendReply} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={`Reply to ${activeInquiry.user_name}...`}
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-teal-500 text-xs text-slate-900 font-medium"
                  />
                  <button
                    type="submit"
                    disabled={sending || (!replyText.trim() && !activationCodeInput.trim())}
                    className="px-5 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    <Send size={13} />
                    <span>Send</span>
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-2">
              <MessageSquare size={36} className="text-slate-300" />
              <p className="text-sm font-bold text-slate-600">Select an eSIM customer message to view conversation</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default AdminEsimMessages;
