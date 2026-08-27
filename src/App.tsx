/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';
import LandingPage from './components/LandingPage';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AIChatSupport from './components/AIChatSupport';
import { PWAInstallBanner } from './components/PWAInstallBanner';

const AuthPage = lazy(() => import('./components/AuthPage'));
const Dashboard = lazy(() => import('./components/Dashboard'));

function AppContent() {
  const { user, loading } = useAuth();
  const [showAuth, setShowAuth] = React.useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-medium animate-pulse">NORODATA is loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans antialiased text-slate-900">
      <Toaster position="top-center" />
      
      <Suspense fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 font-medium animate-pulse">Loading module...</p>
          </div>
        </div>
      }>
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
      </Suspense>

      <AIChatSupport />
      <PWAInstallBanner />
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
