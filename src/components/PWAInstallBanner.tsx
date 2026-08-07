import React, { useEffect, useState } from 'react';
import { Download, X, Smartphone, Share, PlusSquare } from 'lucide-react';

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  useEffect(() => {
    // Check if iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    const isInStandaloneMode = ('standalone' in window.navigator) && (window.navigator as any).standalone;

    if (isIosDevice && !isInStandaloneMode) {
      setIsIOS(true);
      // Show iOS instruction banner after 3 seconds if not dismissed
      const dismissed = localStorage.getItem('noroya_ios_dismissed');
      if (!dismissed) {
        setShowBanner(true);
      }
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const dismissed = localStorage.getItem('noroya_pwa_dismissed');
      if (!dismissed) {
        setShowBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    if (isIOS) {
      localStorage.setItem('noroya_ios_dismissed', 'true');
    } else {
      localStorage.setItem('noroya_pwa_dismissed', 'true');
    }
  };

  if (!showBanner) return null;

  return (
    <>
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 bg-slate-900 border-2 border-indigo-500/50 rounded-2xl p-4 shadow-2xl shadow-indigo-950/80 text-white flex items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-5 duration-300">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-md">
            <Smartphone size={24} />
          </div>
          <div>
            <h4 className="text-sm font-black tracking-tight">Install Noroya App</h4>
            <p className="text-xs text-slate-400 font-medium">
              {isIOS ? 'Add to Home Screen for instant VTU access' : 'Install for lightning-fast VTU services & offline feel'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleInstallClick}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black px-3.5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Download size={14} />
            <span>Install</span>
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Dismiss"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* iOS Instructions Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 text-white space-y-5 relative shadow-2xl">
            <button
              onClick={() => setShowIOSModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800 cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold">
                📱
              </div>
              <div>
                <h3 className="text-base font-black">Install on iPhone & iPad</h3>
                <p className="text-xs text-slate-400">Follow these 2 simple steps:</p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs text-slate-300">
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-800/60 border border-slate-800">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-black flex items-center justify-center shrink-0">1</span>
                <div>
                  <p className="font-bold text-white mb-0.5">Tap the Share button</p>
                  <p className="text-slate-400 flex items-center gap-1">Look for the Share icon <Share size={14} className="text-indigo-400 inline" /> at the bottom of Safari.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-800/60 border border-slate-800">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-black flex items-center justify-center shrink-0">2</span>
                <div>
                  <p className="font-bold text-white mb-0.5">Select 'Add to Home Screen'</p>
                  <p className="text-slate-400 flex items-center gap-1">Scroll down and tap <PlusSquare size={14} className="text-indigo-400 inline" /> <b>Add to Home Screen</b>.</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => { setShowIOSModal(false); setShowBanner(false); }}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-3 rounded-xl transition-all text-xs cursor-pointer"
            >
              Got it, thanks!
            </button>
          </div>
        </div>
      )}
    </>
  );
}
