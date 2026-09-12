import React, { useEffect, useRef, useState } from 'react';
import { Download, X, Smartphone, Share, PlusSquare, MoreVertical } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
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

const DISMISS_KEY = 'NORODATA_pwa_dismissed';
const IOS_DISMISS_KEY = 'NORODATA_ios_dismissed';
const INSTALLED_KEY = 'NORODATA_pwa_installed';
// Re-show the banner after a week instead of suppressing it forever.
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isRunningStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isDismissedRecently(key: string): boolean {
  const raw = localStorage.getItem(key);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  // Legacy boolean "true" values suppressed the banner forever — expire them
  // once so users who dismissed it during earlier testing see it again.
  if (!Number.isFinite(dismissedAt)) {
    localStorage.removeItem(key);
    return false;
  }
  if (Date.now() - dismissedAt > DISMISS_TTL_MS) {
    localStorage.removeItem(key);
    return false;
  }
  return true;
}

type Platform = 'ios' | 'android' | 'desktop';

function detectPlatform(): Platform {
  const userAgent = window.navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(userAgent)) return 'ios';
  // Modern iPadOS Safari reports a desktop "Macintosh" UA; touch points give it away.
  if (/macintosh/.test(userAgent) && navigator.maxTouchPoints > 1) return 'ios';
  if (/android/.test(userAgent)) return 'android';
  return 'desktop';
}

export function PWAInstallBanner() {
  // Latest deferred event. Kept in a ref because Chrome only allows prompt()
  // on the NEWEST beforeinstallprompt event, and it re-fires that event when
  // the user clicks the browser's own install entry (⋮ menu / mini-infobar).
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);

  useEffect(() => {
    const detected = detectPlatform();
    setPlatform(detected);

    const installState: InstallGlobalState =
      window.__NORODATA_INSTALL__ ?? (window.__NORODATA_INSTALL__ = { prompt: null, firedCount: 0 });

    // Already installed (now or in a previous session): never nag again.
    if (installState.installed) localStorage.setItem(INSTALLED_KEY, 'true');
    if (isRunningStandalone() || localStorage.getItem(INSTALLED_KEY) === 'true') {
      return;
    }

    const dismissKey = detected === 'ios' ? IOS_DISMISS_KEY : DISMISS_KEY;
    const revealBanner = () => {
      if (!isDismissedRecently(dismissKey)) setShowBanner(true);
    };

    // Adopt the prompt the inline <head> script captured before React mounted
    // (Chrome usually fires beforeinstallprompt once during initial page load).
    if (installState.prompt) {
      deferredPromptRef.current = installState.prompt;
      revealBanner();
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const evt = e as BeforeInstallPromptEvent;
      const isRefire = deferredPromptRef.current !== null;
      deferredPromptRef.current = evt;
      if (isRefire) {
        // The user just clicked the browser's own "Install app" entry
        // (Chrome menu / infobar). We cancel this event, so the browser will
        // NOT show its own dialog — we must open it immediately, otherwise
        // the click silently does nothing.
        evt.prompt().catch(() => {});
        revealBanner();
        return;
      }
      revealBanner();
    };

    const handleAppInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, 'true');
      deferredPromptRef.current = null;
      setShowBanner(false);
      setShowInstructionsModal(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // iOS never fires beforeinstallprompt — always offer the manual
    // "Add to Home Screen" steps banner there.
    if (detected === 'ios') {
      revealBanner();
    } else if (detected === 'android' && !deferredPromptRef.current) {
      // Some Android browsers never fire the event even though the site is
      // installable from their own menu. Fall back to showing the banner
      // (its Install button then opens the right manual instructions).
      window.setTimeout(() => {
        if (!deferredPromptRef.current && !isRunningStandalone()) revealBanner();
      }, 3000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerPrompt = async (): Promise<void> => {
    const deferredPrompt = deferredPromptRef.current;
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowBanner(false);
      } else {
        // Chrome only allows one prompt() per page load; fall back to the
        // manual steps instead of failing silently.
        setShowBanner(false);
        setShowInstructionsModal(true);
      }
      deferredPromptRef.current = null;
    } catch {
      setShowInstructionsModal(true);
    }
  };

  // window.open-pwa-install (dispatched by app menus, if any) installs
  // directly when possible, otherwise shows the banner/instructions.
  useEffect(() => {
    const handleOpenInstall = () => {
      if (deferredPromptRef.current && platform !== 'ios') {
        void triggerPrompt();
      } else {
        setShowBanner(true);
        setShowInstructionsModal(true);
      }
    };
    window.addEventListener('open-pwa-install', handleOpenInstall);
    return () => window.removeEventListener('open-pwa-install', handleOpenInstall);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  const handleInstallClick = async () => {
    if (platform === 'ios') {
      setShowInstructionsModal(true);
      return;
    }
    if (deferredPromptRef.current) {
      await triggerPrompt();
      return;
    }
    setShowInstructionsModal(true);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setShowInstructionsModal(false);
    localStorage.setItem(platform === 'ios' ? IOS_DISMISS_KEY : DISMISS_KEY, String(Date.now()));
  };

  if (!showBanner && !showInstructionsModal) return null;

  return (
    <>
      {showBanner && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 bg-slate-900 border-2 border-indigo-500/50 rounded-2xl p-4 shadow-2xl shadow-indigo-950/80 text-white flex items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-md">
              <Smartphone size={24} />
            </div>
            <div>
              <h4 className="text-sm font-black tracking-tight">Install NORODATA App</h4>
              <p className="text-xs text-slate-400 font-medium">
                {platform === 'ios'
                  ? 'Add to Home Screen for instant VTU access'
                  : 'Install for lightning-fast VTU services & offline feel'}
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
      )}

      {/* Manual install instructions (iOS, or when the prompt is unavailable) */}
      {showInstructionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 text-white space-y-5 relative shadow-2xl">
            <button
              onClick={() => setShowInstructionsModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800 cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold">
                📱
              </div>
              <div>
                <h3 className="text-base font-black">
                  {platform === 'ios'
                    ? 'Install on iPhone & iPad'
                    : platform === 'android'
                      ? 'Install on Android'
                      : 'Install on your computer'}
                </h3>
                <p className="text-xs text-slate-400">Follow these 2 simple steps:</p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs text-slate-300">
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-800/60 border border-slate-800">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-black flex items-center justify-center shrink-0">1</span>
                <div>
                  {platform === 'ios' ? (
                    <>
                      <p className="font-bold text-white mb-0.5">Tap the Share button</p>
                      <p className="text-slate-400 flex items-center gap-1">Look for the Share icon <Share size={14} className="text-indigo-400 inline" /> at the bottom of Safari.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold text-white mb-0.5">Open the browser menu</p>
                      <p className="text-slate-400 flex items-center gap-1">
                        {platform === 'android' ? (
                          <>Tap <MoreVertical size={14} className="text-indigo-400 inline" /> <b>⋮</b> at the top-right of Chrome.</>
                        ) : (
                          <>Click <MoreVertical size={14} className="text-indigo-400 inline" /> <b>⋮</b> at the top-right of the browser.</>
                        )}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-800/60 border border-slate-800">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-black flex items-center justify-center shrink-0">2</span>
                <div>
                  {platform === 'ios' ? (
                    <>
                      <p className="font-bold text-white mb-0.5">Select 'Add to Home Screen'</p>
                      <p className="text-slate-400 flex items-center gap-1">Scroll down and tap <PlusSquare size={14} className="text-indigo-400 inline" /> <b>Add to Home Screen</b>.</p>
                    </>
                  ) : platform === 'android' ? (
                    <>
                      <p className="font-bold text-white mb-0.5">Tap 'Install app'</p>
                      <p className="text-slate-400">If you don't see it, tap <b>Add to Home screen</b> instead.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold text-white mb-0.5">Select 'Install NORODATA'</p>
                      <p className="text-slate-400">Look under <b>Apps</b> in the menu, or click the install icon <Download size={14} className="text-indigo-400 inline" /> in the address bar.</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={handleDismiss}
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
