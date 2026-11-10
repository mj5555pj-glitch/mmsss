import React, { useState, useEffect } from 'react';
import { subscribeToInAppToasts, InAppToast, requestNotificationPermission } from '../lib/notificationService';
import { Bell, CheckCircle2, AlertCircle, X, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function InAppToastsContainer() {
  const [toasts, setToasts] = useState<InAppToast[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToInAppToasts((newToast) => {
      setToasts(prev => [newToast, ...prev].slice(0, 4));

      // Auto dismiss after 6 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== newToast.id));
      }, 6000);
    });

    return unsubscribe;
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4 space-y-2 pointer-events-none" dir="rtl">
      <AnimatePresence>
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'completed' || toast.type === 'accepted';
          const isDanger = toast.type === 'rejected';

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              className={`pointer-events-auto p-3.5 rounded-2xl shadow-xl border backdrop-blur-md flex items-start gap-3 relative overflow-hidden ${
                isSuccess
                  ? 'bg-emerald-900/90 text-emerald-50 border-emerald-500/50'
                  : isDanger
                  ? 'bg-red-900/90 text-red-50 border-red-500/50'
                  : 'bg-slate-900/90 text-white border-slate-700/80'
              }`}
            >
              <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                isSuccess ? 'bg-emerald-500/20 text-emerald-300' :
                isDanger ? 'bg-red-500/20 text-red-300' :
                'bg-blue-500/20 text-blue-300'
              }`}>
                {isSuccess ? <CheckCircle2 className="w-5 h-5" /> :
                 isDanger ? <ShieldAlert className="w-5 h-5" /> :
                 <Bell className="w-5 h-5 animate-bounce" />}
              </div>

              <div className="flex-1 pr-1">
                <h4 className="font-black text-xs">{toast.title}</h4>
                <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed font-medium">{toast.body}</p>
              </div>

              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="text-white/60 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
