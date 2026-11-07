import React, { useEffect, useState } from 'react';
import { Download, X, Smartphone, Share, PlusSquare, MoreVertical } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

interface InstallGlobalState {
  prompt: BeforeInstallPromptEvent | null;
  firedCount: number;
  installed?: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __NORODATA_INSTALL__: InstallGlobalState | undefined;
}

type Platform = 'ios' | 'android' | 'desktop';

function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'desktop';
  const ua = window.navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
}

const DISMISS_KEY = 'NORODATA_pwa_dismissed';
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [platform, setPlatform] = useState<Platform>('android');
  const [showModal, setShowModal] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const currentPlatform = detectPlatform();
    setPlatform(currentPlatform);

    if (isRunningStandalone() || window.__NORODATA_INSTALL__?.installed) {
      setIsInstalled(true);
      return;
    }

    // Check if dismissed within the last 24h
    const dismissedTime = Number(localStorage.getItem(DISMISS_KEY) || '0');
    const isDismissed = Date.now() - dismissedTime < DISMISS_TTL_MS;

    // Check if inline <script> in <head> already caught beforeinstallprompt
    if (window.__NORODATA_INSTALL__?.prompt) {
      setDeferredPrompt(window.__NORODATA_INSTALL__.prompt);
      if (!isDismissed) setShowBanner(true);
    } else if (!isDismissed) {
      // Show banner on mobile/desktop to encourage installation
      setShowBanner(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      if (window.__NORODATA_INSTALL__) {
        window.__NORODATA_INSTALL__.prompt = promptEvent;
      }
      if (!isDismissed && !isRunningStandalone()) {
        setShowBanner(true);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowBanner(false);
      setShowModal(false);
      setDeferredPrompt(null);
      if (window.__NORODATA_INSTALL__) {
        window.__NORODATA_INSTALL__.installed = true;
        window.__NORODATA_INSTALL__.prompt = null;
      }
    };

    const handleOpenInstall = () => {
      setShowBanner(true);
      const activePrompt = deferredPrompt || window.__NORODATA_INSTALL__?.prompt;
      if (activePrompt && currentPlatform !== 'ios') {
        void triggerPrompt(activePrompt);
      } else {
        setShowModal(true);
      }
    };

    const handlePromptAvailable = () => {
      if (window.__NORODATA_INSTALL__?.prompt) {
        setDeferredPrompt(window.__NORODATA_INSTALL__.prompt);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('open-pwa-install', handleOpenInstall);
    window.addEventListener('pwa-prompt-available', handlePromptAvailable);
    window.addEventListener('pwa-installed', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('open-pwa-install', handleOpenInstall);
      window.removeEventListener('pwa-prompt-available', handlePromptAvailable);
      window.removeEventListener('pwa-installed', handleAppInstalled);
    };
  }, [deferredPrompt]);

  const triggerPrompt = async (promptToUse: BeforeInstallPromptEvent) => {
    try {
      await promptToUse.prompt();
      const choice = await promptToUse.userChoice;
      if (choice.outcome === 'accepted') {
        setShowBanner(false);
        setIsInstalled(true);
      } else {
        setShowBanner(false);
        setShowModal(true);
      }
      setDeferredPrompt(null);
      if (window.__NORODATA_INSTALL__) {
        window.__NORODATA_INSTALL__.prompt = null;
      }
    } catch {
      setShowModal(true);
    }
  };

  const handleInstallClick = async () => {
    if (platform === 'ios') {
      setShowModal(true);
      return;
    }

    const activePrompt = deferredPrompt || window.__NORODATA_INSTALL__?.prompt;
    if (activePrompt) {
      await triggerPrompt(activePrompt);
    } else {
      setShowModal(true);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setShowModal(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  if (isInstalled) return null;
  if (!showBanner && !showModal) return null;

  return (
    <>
      {showBanner && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 bg-slate-900 border-2 border-emerald-500/50 rounded-2xl p-4 shadow-2xl shadow-emerald-950/80 text-white flex items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-600 to-green-500 flex items-center justify-center text-white shrink-0 shadow-md">
              <Smartphone size={24} />
            </div>
            <div>
              <h4 className="text-sm font-black tracking-tight">Install NORODATA App</h4>
              <p className="text-xs text-slate-300 font-medium">
                {platform === 'ios'
                  ? 'Add to Home Screen for quick access'
                  : 'Fast data, instant recharge & offline feel'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleInstallClick}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black px-3.5 py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
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
      )}

      {/* Clear Platform-Specific Instructions Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 text-white space-y-5 relative shadow-2xl">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800 cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold">
                📱
              </div>
              <div>
                <h3 className="text-base font-black">
                  {platform === 'ios'
                    ? 'Install on iPhone & iPad'
                    : platform === 'android'
                    ? 'Install on Android Phone'
                    : 'Install on your computer'}
                </h3>
                <p className="text-xs text-slate-400">Follow these 2 simple steps:</p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs text-slate-300">
              {platform === 'android' ? (
                <>
                  <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-800/60 border border-slate-800">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-black flex items-center justify-center shrink-0">1</span>
                    <div>
                      <p className="font-bold text-white mb-0.5">Open Chrome menu</p>
                      <p className="text-slate-400 flex items-center gap-1">
                        Tap <MoreVertical size={14} className="text-emerald-400 inline" /> <b>⋮</b> in the top right corner of Chrome.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-800/60 border border-slate-800">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-black flex items-center justify-center shrink-0">2</span>
                    <div>
                      <p className="font-bold text-white mb-0.5">Tap 'Install app'</p>
                      <p className="text-slate-400">
                        Tap <b className="text-white">Install app</b> (or <b className="text-white">Add to Home screen</b>). NORODATA will install directly onto your home screen!
                      </p>
                    </div>
                  </div>
                </>
              ) : platform === 'ios' ? (
                <>
                  <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-800/60 border border-slate-800">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-black flex items-center justify-center shrink-0">1</span>
                    <div>
                      <p className="font-bold text-white mb-0.5">Tap the Share button</p>
                      <p className="text-slate-400 flex items-center gap-1">
                        Look for the Share icon <Share size={14} className="text-emerald-400 inline" /> at the bottom of Safari.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-800/60 border border-slate-800">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-black flex items-center justify-center shrink-0">2</span>
                    <div>
                      <p className="font-bold text-white mb-0.5">Select 'Add to Home Screen'</p>
                      <p className="text-slate-400 flex items-center gap-1">
                        Scroll down and tap <PlusSquare size={14} className="text-emerald-400 inline" /> <b>Add to Home Screen</b>.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-800/60 border border-slate-800">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-black flex items-center justify-center shrink-0">1</span>
                    <div>
                      <p className="font-bold text-white mb-0.5">Click the Install icon</p>
                      <p className="text-slate-400">
                        Click the Install icon in the browser address bar (or menu ⋮).
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-800/60 border border-slate-800">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-black flex items-center justify-center shrink-0">2</span>
                    <div>
                      <p className="font-bold text-white mb-0.5">Click 'Install'</p>
                      <p className="text-slate-400">
                        Confirm installation to open NORODATA in its own window.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={handleDismiss}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 rounded-xl transition-all text-xs cursor-pointer"
            >
              Got it, thanks!
            </button>
          </div>
        </div>
      )}
    </>
  );
}
