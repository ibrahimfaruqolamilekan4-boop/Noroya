import React, { useState, useEffect } from 'react';
import { WifiOff, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      return navigator.onLine;
    }
    return true;
  });
  const [showRestored, setShowRestored] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timer: NodeJS.Timeout | null = null;

    const handleOnline = () => {
      setIsOnline(true);
      setShowRestored(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setShowRestored(false);
      }, 3500);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowRestored(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          transition={{ duration: 0.25 }}
          className="sticky top-0 z-[9999] w-full bg-amber-600 text-white px-4 py-2.5 shadow-md flex items-center justify-center gap-2 text-xs md:text-sm font-semibold select-none"
        >
          <WifiOff size={16} className="animate-pulse shrink-0" />
          <span>No internet connection. Transactions will resume once connection is restored.</span>
        </motion.div>
      )}

      {isOnline && showRestored && (
        <motion.div
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          transition={{ duration: 0.25 }}
          className="sticky top-0 z-[9999] w-full bg-emerald-600 text-white px-4 py-2 shadow-md flex items-center justify-center gap-2 text-xs md:text-sm font-semibold select-none"
        >
          <CheckCircle2 size={16} className="shrink-0" />
          <span>Connection restored! You are back online.</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
