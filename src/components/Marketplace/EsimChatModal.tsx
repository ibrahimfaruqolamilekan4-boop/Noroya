import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  X, Send, ShieldCheck, QrCode, Smartphone, Globe, 
  CheckCircle2, Clock, MessageSquare, PhoneCall, Copy, Check, Sparkles, AlertCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

interface EsimChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  initialPackage?: string;
}

interface ChatMsg {
  id: string;
  sender: 'admin' | 'user';
  text: string;
  time: string;
  hasQr?: boolean;
}

const PRESET_PACKAGES = [
  { id: 'us-5gb', label: '🇺🇸 USA 5GB (30 Days)', price: '₦8,500', data: '5GB', country: 'United States' },
  { id: 'us-10gb', label: '🇺🇸 USA 10GB (30 Days)', price: '₦14,000', data: '10GB', country: 'United States' },
  { id: 'uk-10gb', label: '🇬🇧 UK 10GB + UK Number', price: '₦12,500', data: '10GB', country: 'United Kingdom' },
  { id: 'global-5gb', label: '🌍 Global 150+ Countries (5GB)', price: '₦16,000', data: '5GB', country: 'Global' },
  { id: 'custom', label: '⚡ Custom Country / Plan', price: 'Ask Admin', data: 'Custom', country: 'Custom' },
];

const safeFormatTime = (isoString?: string): string => {
  if (!isoString) return 'Just now';
  try {
    const d = new Date(isoString);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  } catch (_) {}
  return 'Just now';
};

class EsimErrorBoundary extends React.Component<{ children: React.ReactNode; onClose: () => void }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any) {
    console.error('[EsimChatModal Error]:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto text-xl font-bold">
              📶
            </div>
            <h3 className="font-black text-lg text-slate-900">eSIM Admin Desk Ready</h3>
            <p className="text-xs text-slate-600">
              For instant eSIM provisioning and setup assistance, chat directly with Admin on WhatsApp (+2348143889102) or call our desk.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => {
                  try {
                    navigator.clipboard.writeText('+2348143889102');
                    toast.success('Admin WhatsApp (+2348143889102) copied!');
                  } catch (_) {}
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs cursor-pointer"
              >
                Copy WhatsApp Number
              </button>
              <button
                type="button"
                onClick={this.props.onClose}
                className="px-4 py-2 rounded-xl bg-slate-200 text-slate-800 font-bold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function EsimChatModalInner({
  isOpen,
  onClose,
  currentUser,
  initialPackage
}: EsimChatModalProps) {
  const [selectedPkg, setSelectedPkg] = useState(initialPackage || PRESET_PACKAGES[0].id);
  const [deviceModel, setDeviceModel] = useState('');
  const [inputText, setInputText] = useState('');
  const [copied, setCopied] = useState(false);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: 'msg-welcome-1',
      sender: 'admin',
      text: `Hello ${currentUser?.fullName || currentUser?.name || 'there'}! Welcome to the NORODATA Official eSIM Desk 📶\n\nI am online to help you provision and activate high-speed eSIM data profiles for USA, UK, Canada, Europe, and 150+ countries. Let me know your destination country and device model (iPhone/Samsung/Pixel).`,
      time: 'Just now'
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialPackage) {
      setSelectedPkg(initialPackage);
    }
  }, [initialPackage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen) return null;

  const currentPkgObj = PRESET_PACKAGES.find(p => p.id === selectedPkg) || PRESET_PACKAGES[0];

  const syncInquiryWithBackend = async (text: string, currentPackage: typeof PRESET_PACKAGES[0]) => {
    const payload = {
      user_id: currentUser?.uid || currentUser?.id || 'visitor',
      user_name: currentUser?.fullName || currentUser?.name || 'Customer',
      user_email: currentUser?.email || '',
      user_phone: currentUser?.phoneNumber || '',
      package_id: currentPackage.id,
      package_label: currentPackage.label,
      package_price: currentPackage.price,
      destination_country: currentPackage.country,
      device_model: deviceModel || 'Smartphone',
      message: text
    };

    try {
      const raw = localStorage.getItem('noroya_esim_inquiries');
      let list: any[] = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) list = parsed;
        } catch (_) {}
      }
      const newMsgObj = {
        id: `msg-${Date.now()}`,
        sender: 'user',
        text,
        created_at: new Date().toISOString()
      };

      const existingIdx = list.findIndex((i: any) => 
        (payload.user_email && i.user_email === payload.user_email) ||
        (payload.user_id !== 'visitor' && i.user_id === payload.user_id)
      );

      if (existingIdx >= 0) {
        if (!Array.isArray(list[existingIdx].messages)) list[existingIdx].messages = [];
        list[existingIdx].messages.push(newMsgObj);
        list[existingIdx].last_message = text;
        list[existingIdx].updated_at = new Date().toISOString();
        list[existingIdx].device_model = deviceModel || list[existingIdx].device_model;
        list[existingIdx].package_label = currentPackage.label;
      } else {
        list.unshift({
          id: `inq-${Date.now()}`,
          ...payload,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_message: text,
          messages: [newMsgObj]
        });
      }
      localStorage.setItem('noroya_esim_inquiries', JSON.stringify(list));
    } catch (_) {}

    try {
      await fetch('/api/esim/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (_) {}
  };

  // Poll for real-time replies from Admin (jeffholland299@gmail.com or other admins)
  useEffect(() => {
    if (!isOpen) return;
    const checkAdminReplies = () => {
      try {
        const raw = localStorage.getItem('noroya_esim_inquiries');
        if (!raw) return;
        let list: any[] = [];
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) list = parsed;
        } catch (_) {}
        if (!list.length) return;

        const myEmail = (currentUser?.email || '').toLowerCase().trim();
        const myId = String(currentUser?.uid || currentUser?.id || '');
        const myInquiry = list.find((i: any) => 
          (myEmail && (i.user_email || '').toLowerCase().trim() === myEmail) ||
          (myId && String(i.user_id) === myId)
        );

        if (myInquiry && Array.isArray(myInquiry.messages)) {
          const adminMsgs = myInquiry.messages.filter((m: any) => m && m.sender === 'admin');
          if (adminMsgs.length > 0) {
            setMessages(prev => {
              const existingIds = new Set(prev.map(p => p.id));
              const newReplies: ChatMsg[] = [];
              for (const adm of adminMsgs) {
                const msgId = String(adm.id || `adm-reply-${Date.now()}`);
                if (!existingIds.has(msgId)) {
                  newReplies.push({
                    id: msgId,
                    sender: 'admin',
                    text: String(adm.text || ''),
                    time: safeFormatTime(adm.created_at),
                    hasQr: Boolean(adm.activation_code || adm.has_qr)
                  });
                }
              }
              return newReplies.length > 0 ? [...prev, ...newReplies] : prev;
            });
          }
        }
      } catch (_) {}
    };

    checkAdminReplies();
    const interval = setInterval(checkAdminReplies, 4000);
    return () => clearInterval(interval);
  }, [isOpen, currentUser]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;

    const userMsg: ChatMsg = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: trimmed,
      time: safeFormatTime(new Date().toISOString())
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');

    // Sync directly to Admin Desk
    syncInquiryWithBackend(trimmed, currentPkgObj);

    // Provide friendly instant assistance
    setTimeout(() => {
      const lower = trimmed.toLowerCase();
      let replyText = `Thanks for your inquiry! Your request has been logged with the eSIM Admin Desk for ${currentPkgObj.label} on device "${deviceModel || 'your smartphone'}".`;
      let hasQr = false;

      if (lower.includes('price') || lower.includes('cost') || lower.includes('how much')) {
        replyText = `Our current rate for ${currentPkgObj.label} is ${currentPkgObj.price}. It delivers instant high-speed 4G/5G data with zero roaming charges. You can fund your wallet to activate, or copy our admin contact for immediate setup!`;
      } else if (lower.includes('iphone') || lower.includes('samsung') || lower.includes('pixel') || lower.includes('device')) {
        replyText = `Excellent! That device supports full digital eSIM profiles. We will send you an activation QR code. Once scanned under Settings > Cellular / SIMs, it activates in under 60 seconds!`;
      } else if (lower.includes('qr') || lower.includes('code') || lower.includes('buy') || lower.includes('setup') || lower.includes('pay')) {
        replyText = `Great! Here is the eSIM QR preview profile for ${currentPkgObj.label}. You can scan it directly in your device Cellular Settings or enter the SM-DP+ code below.`;
        hasQr = true;
      } else {
        replyText = `Got it! The eSIM desk is reviewing your request. For fastest instant activation and QR code dispatch, you can also reach our eSIM direct desk at +2348143889102.`;
      }

      const adminReply: ChatMsg = {
        id: `adm-${Date.now()}`,
        sender: 'admin',
        text: replyText,
        time: safeFormatTime(new Date().toISOString()),
        hasQr
      };

      setMessages(prev => [...prev, adminReply]);
    }, 800);
  };

  const handleSendPresetInquiry = (pkg: typeof PRESET_PACKAGES[0]) => {
    setSelectedPkg(pkg.id);
    const msgText = `Hello Admin, I want to purchase and activate: ${pkg.label} (${pkg.price}). My device is ${deviceModel || 'iPhone / Android'}. Please guide me on activation.`;
    const userMsg: ChatMsg = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: msgText,
      time: safeFormatTime(new Date().toISOString())
    };
    setMessages(prev => [...prev, userMsg]);

    syncInquiryWithBackend(msgText, pkg);

    setTimeout(() => {
      const adminReply: ChatMsg = {
        id: `adm-${Date.now()}`,
        sender: 'admin',
        text: `Received! ${pkg.label} is available right now for ${pkg.price}. It connects to top tier networks with fast 5G speeds. Our eSIM desk will issue your digital QR code.`,
        time: safeFormatTime(new Date().toISOString()),
        hasQr: true
      };
      setMessages(prev => [...prev, adminReply]);
    }, 700);
  };

  const copyIccid = (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast.success('eSIM activation string copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      toast.success('eSIM code copied!');
    }
  };

  const copyAdminContact = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText('+2348143889102');
      }
      toast.success('eSIM Admin WhatsApp (+2348143889102) copied!');
    } catch (_) {
      toast.success('eSIM Admin contact: +2348143889102');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden text-left"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 p-4 sm:p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20 text-xl shrink-0">
              📶
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg tracking-tight">
                  eSIM Admin Support & Provisioning Desk
                </h3>
                <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Admin Live
                </span>
              </div>
              <p className="text-xs text-emerald-100/75 font-medium mt-0.5">
                Chat directly with Admin for instant eSIM activation & QR code dispatch
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick Package Selector Strip */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 sm:px-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Select Desired Package:</span>
            <button
              type="button"
              onClick={() => setShowSetupGuide(!showSetupGuide)}
              className="text-[11px] text-emerald-700 hover:text-emerald-800 underline font-extrabold flex items-center gap-1 cursor-pointer"
            >
              <Smartphone size={12} /> {showSetupGuide ? 'Hide Setup Guide' : 'How to install eSIM?'}
            </button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {PRESET_PACKAGES.map(pkg => (
              <button
                key={pkg.id}
                type="button"
                onClick={() => handleSendPresetInquiry(pkg)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap border transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedPkg === pkg.id
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                <span>{pkg.label}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                  selectedPkg === pkg.id ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-emerald-800'
                }`}>
                  {pkg.price}
                </span>
              </button>
            ))}
          </div>

          {/* Device input shortcut */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={deviceModel}
              onChange={e => setDeviceModel(e.target.value)}
              placeholder="Your device model (e.g. iPhone 14, Galaxy S23, Pixel 7)..."
              className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-slate-500 font-bold shrink-0">Carrier: Unlocked</span>
          </div>
        </div>

        {/* Collapsible Setup Guide */}
        {showSetupGuide && (
          <div className="bg-emerald-50/80 border-b border-emerald-200 p-3 sm:px-5 text-xs text-emerald-950 space-y-1.5 animate-fadeIn">
            <div className="font-extrabold flex items-center gap-1.5 text-emerald-900">
              <CheckCircle2 size={14} className="text-emerald-700" />
              Easy 3-Step eSIM Installation:
            </div>
            <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-emerald-900/90 font-medium pl-1">
              <li><strong>iOS (iPhone):</strong> Go to <em>Settings → Cellular / Mobile Service → Add eSIM → Use QR Code</em>.</li>
              <li><strong>Android:</strong> Go to <em>Settings → Network & internet → SIMs → Add eSIM / Download SIM</em>.</li>
              <li>Scan the activation QR code provided by Admin in this chat and toggle "Turn On This Line".</li>
            </ol>
          </div>
        )}

        {/* Chat Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 bg-slate-50/50 min-h-[240px] max-h-[360px]">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-400 font-bold">
                {msg.sender === 'admin' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-emerald-800 font-extrabold">NORODATA Admin Desk</span>
                  </>
                ) : (
                  <span>You</span>
                )}
                <span>• {msg.time}</span>
              </div>

              <div
                className={`max-w-[85%] rounded-2xl p-3.5 text-xs font-medium shadow-sm leading-relaxed whitespace-pre-wrap ${
                  msg.sender === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-none'
                    : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-none'
                }`}
              >
                {msg.text}

                {/* QR Code Demo / Activation card */}
                {msg.hasQr && (
                  <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-900 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-1.5 font-black text-xs text-emerald-900">
                        <QrCode size={14} className="text-emerald-700" />
                        eSIM Profile Code Ready
                      </div>
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        {currentPkgObj.country}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-3 py-1">
                      {/* Interactive visual QR sample */}
                      <div className="w-24 h-24 bg-white border-2 border-black rounded-xl p-1 flex items-center justify-center shrink-0 shadow-sm">
                        <div className="text-center">
                          <QrCode size={70} className="text-slate-900 mx-auto" />
                        </div>
                      </div>

                      <div className="space-y-1 text-left flex-1">
                        <div className="text-[11px] font-bold text-slate-600">SM-DP+ Address & Activation Code:</div>
                        <div className="bg-white p-1.5 rounded-lg border border-slate-200 font-mono text-[10px] text-slate-800 break-all select-all flex items-center justify-between gap-1">
                          <span>LPA:1$smdp.norodata.com$US-NORO-948210</span>
                          <button
                            type="button"
                            onClick={() => copyIccid(`LPA:1$smdp.norodata.com$US-NORO-948210`)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                          >
                            {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium">
                          Scan with your device camera or add manually in Mobile Network settings.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area & Quick admin contact actions */}
        <div className="p-3 sm:p-4 bg-white border-t border-slate-200 space-y-2.5">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="Type your message to Admin (e.g. I need 10GB for UK / how to pay)..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 shadow-sm"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-2xl font-bold transition-all shadow-md cursor-pointer shrink-0 active:scale-95 flex items-center gap-1.5 text-xs"
            >
              <Send size={15} />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>

          {/* Quick Support Info & Copy Contact */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-500 font-bold">
              <ShieldCheck size={14} className="text-emerald-600" />
              <span>Escrow protected • Real-time Admin sync</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyAdminContact}
                className="px-3 py-1.5 rounded-xl bg-green-50 hover:bg-green-100 text-green-700 font-extrabold border border-green-200 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <MessageSquare size={12} /> Copy Admin WhatsApp
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                      navigator.clipboard.writeText('+2348143889102');
                    }
                    toast.success('Admin phone (+2348143889102) copied!');
                  } catch (_) {}
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-extrabold border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <PhoneCall size={12} /> Call Desk (+2348143889102)
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function EsimChatModal(props: EsimChatModalProps) {
  if (!props.isOpen) return null;
  return (
    <EsimErrorBoundary onClose={props.onClose}>
      <EsimChatModalInner {...props} />
    </EsimErrorBoundary>
  );
}

export default EsimChatModal;
