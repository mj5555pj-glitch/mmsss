import React, { useState, useEffect } from 'react';
import { RefreshCw, Sparkles, AlertTriangle } from 'lucide-react';
import { APP_VERSION } from '../config/version';

export default function VersionUpdateBanner() {
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [newVersionString, setNewVersionString] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Auto clean legacy cache when running a fresh version
  useEffect(() => {
    try {
      const storedVersion = localStorage.getItem('futurex_installed_version');
      if (storedVersion !== APP_VERSION) {
        if ('caches' in window) {
          caches.keys().then((keys) => {
            keys.forEach((key) => {
              if (key !== `futurex-${APP_VERSION}`) {
                caches.delete(key);
              }
            });
          }).catch(() => {});
        }
        localStorage.setItem('futurex_installed_version', APP_VERSION);
      }
    } catch (e) {
      console.warn('Cache auto-clean error:', e);
    }
  }, []);

  // Helper to compare version strings e.g. "v4.5" vs "v4.3"
  const isRemoteVersionNewer = (remote: string, current: string): boolean => {
    try {
      const parse = (s: string) => s.replace(/[^0-9.]/g, '').split('.').map(Number);
      const r = parse(remote);
      const c = parse(current);
      for (let i = 0; i < Math.max(r.length, c.length); i++) {
        const rv = r[i] || 0;
        const cv = c[i] || 0;
        if (rv > cv) return true;
        if (rv < cv) return false;
      }
      return false;
    } catch {
      return false;
    }
  };

  // Background check for remote version updates
  const checkForUpdates = async () => {
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.version && isRemoteVersionNewer(data.version, APP_VERSION)) {
          setHasNewVersion(true);
          setNewVersionString(data.version);
        } else {
          setHasNewVersion(false);
        }
      }
    } catch (e) {
      // Ignore network errors during silent check
    }
  };

  useEffect(() => {
    // Initial check after 3 seconds
    const initialTimer = setTimeout(() => {
      checkForUpdates();
    }, 3000);

    // Periodic check every 2 minutes
    const interval = setInterval(() => {
      checkForUpdates();
    }, 2 * 60 * 1000);

    // Check on window focus
    const handleFocus = () => {
      checkForUpdates();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const handleApplyUpdate = async () => {
    setIsUpdating(true);
    try {
      // 1. Unregister all service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }

      // 2. Clear all cache storage buckets
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }

      // 3. Store new version string
      if (newVersionString) {
        localStorage.setItem('futurex_installed_version', newVersionString);
      } else {
        localStorage.setItem('futurex_installed_version', APP_VERSION);
      }
    } catch (err) {
      console.warn('Error during cache cleanup:', err);
    } finally {
      // 4. Force hard reload bypassing cache
      const reloadUrl = `${window.location.origin}${window.location.pathname}?v=${Date.now()}`;
      window.location.href = reloadUrl;
    }
  };

  if (!hasNewVersion) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[92%] max-w-lg bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-blue-500/40 backdrop-blur-md transition-all animate-bounce-short">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center shrink-0 text-blue-400">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-black text-white">يتوفر تحديث جديد للبرنامج</h4>
              <span className="bg-blue-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                {newVersionString || 'إصدار جديد'}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 font-medium mt-0.5">
              تمت إضافة تحسينات وإصلاحات جديدة، اضغط للتحديث الآن.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleApplyUpdate}
          disabled={isUpdating}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-black px-4 py-2.5 rounded-xl shadow-lg transition-all flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
          <span>{isUpdating ? 'جاري التحديث...' : 'تحديث الآن'}</span>
        </button>
      </div>
    </div>
  );
}
