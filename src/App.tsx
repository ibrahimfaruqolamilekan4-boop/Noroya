/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import LandingPage from './components/LandingPage';
import AuthPage from './components/AuthPage';
import Dashboard from './components/Dashboard';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AIChatSupport from './components/AIChatSupport';

// Admin WhatsApp contacts — edit labels/numbers here any time.
// Format: country code + number, no leading 0 or +
const ADMIN_CONTACTS = [
  { label: 'Admin 1', number: '2348143889102' },
  { label: 'Admin 2', number: '2347034519634' },
  { label: 'Admin 3', number: '2349059530817' },
];

function WhatsAppSupportButton() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-[64px] right-0 z-50 w-64 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] overflow-hidden">
            <div className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-slate-500 border-b-2 border-black bg-slate-50">
              Chat with the admin
            </div>
            {ADMIN_CONTACTS.map((c) => (
              <a
                key={c.number}
                href={`https://wa.me/${c.number}?text=Hello%20Nooraya%20Support,%20I%20need%20help%20with%20my%20secure%20VTU%20portal%20account.`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
              >
                <span className="w-8 h-8 rounded-full bg-[#25D366]/15 text-[#1a9c4a] flex items-center justify-center text-sm">💬</span>
                <span>
                  <b className="block text-sm font-bold text-slate-900">{c.label}</b>
                  <small className="text-xs text-slate-500">+{c.number}</small>
                </span>
              </a>
            ))}
          </div>
        </>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        id="whatsapp_floating_btn"
        className="bg-[#25D366] text-black border-2 border-black font-black text-xs uppercase tracking-wider px-6 py-4 rounded-xl shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center gap-2 cursor-pointer"
        title="Contact Support"
      >
        <span>💬 CHAT WITH SUPPORT ON WHATSAPP</span>
      </button>
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const [showAuth, setShowAuth] = React.useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-medium animate-pulse">Noroya Data is loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans antialiased text-slate-900">
      <Toaster position="top-center" />
      
      {!user && !showAuth && (
        <LandingPage onAuth={() => setShowAuth(true)} />
      )}
      
      {!user && showAuth && (
        <AuthPage 
          onBack={() => setShowAuth(false)} 
        />
      )}
      
      {user && (
        <Dashboard user={user} onLogout={() => {}} />
      )}

      {/* Floating WhatsApp Bubble for Instant Customer Support — now with 3 admins */}
      <WhatsAppSupportButton />

      <AIChatSupport />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
