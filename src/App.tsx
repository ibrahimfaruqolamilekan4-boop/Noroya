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
