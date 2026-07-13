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

      {/* Floating WhatsApp Bubble for Instant Customer Support */}
      <a 
        href="https://wa.me/2348143889102?text=Hello%20Nooraya%20Support,%20I%20need%20help%20with%20my%20secure%20VTU%20portal%20account." 
        target="_blank" 
        rel="noopener noreferrer"
        id="whatsapp_floating_btn"
        className="fixed bottom-6 right-6 z-50 bg-[#25D366] text-black border-2 border-black font-black text-xs uppercase tracking-wider px-6 py-4 rounded-xl shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center gap-2 cursor-pointer"
        title="Contact Support"
      >
        <span>💬 CHAT WITH SUPPORT ON WHATSAPP</span>
      </a>

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


