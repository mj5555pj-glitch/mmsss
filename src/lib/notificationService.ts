// Service to manage web system notifications and audio chime sounds for FutureX tasks (with Safari iOS support & in-app Toast fallback)

export interface InAppToast {
  id: string;
  title: string;
  body: string;
  type: 'new_task' | 'completed' | 'accepted' | 'rejected';
}

type ToastListener = (toast: InAppToast) => void;
const toastListeners: Set<ToastListener> = new Set();

export function subscribeToInAppToasts(listener: ToastListener) {
  toastListeners.add(listener);
  return () => {
    toastListeners.delete(listener);
  };
}

let unlockedAudioCtx: AudioContext | null = null;

// User gesture unlock for iOS Safari AudioContext
export function unlockAudioForSafari() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!unlockedAudioCtx) {
      unlockedAudioCtx = new AudioContextClass();
    }
    if (unlockedAudioCtx.state === 'suspended') {
      unlockedAudioCtx.resume();
    }
  } catch (e) {
    console.warn('Safari audio unlock warning:', e);
  }
}

export function playNotificationSound(type: 'new_task' | 'completed' | 'accepted' | 'rejected') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = unlockedAudioCtx || new AudioContextClass();

    if (type === 'new_task') {
      // Pleasant double chime: C5 -> G5
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(783.99, now + 0.15); // G5
      gain2.gain.setValueAtTime(0.22, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.55);
    } else if (type === 'completed') {
      // Success fanfare: C5 -> E5 -> G5
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + idx * 0.12;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.2, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.45);
      });
    } else if (type === 'accepted') {
      // Ascending active tone
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.25);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'rejected') {
      // Alert tone: G4 -> E4
      const now = ctx.currentTime;
      [392.00, 329.63].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + idx * 0.15;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.18, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.35);
      });
    }
  } catch (e) {
    console.warn('Audio chime play warning:', e);
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  // Attempt user gesture unlock for audio
  unlockAudioForSafari();

  if (Notification.permission === 'granted') {
    return true;
  }
  if (Notification.permission !== 'denied') {
    try {
      let permission: NotificationPermission;
      const request = Notification.requestPermission();
      if (request && typeof request.then === 'function') {
        permission = await request;
      } else {
        permission = await new Promise((resolve) => {
          (Notification as any).requestPermission((res: NotificationPermission) => resolve(res));
        });
      }
      return permission === 'granted';
    } catch (e) {
      console.warn('Failed to request notification permission:', e);
    }
  }
  return false;
}

export function getNotificationPermissionStatus(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function triggerWebNotification(
  title: string, 
  body: string, 
  soundType?: 'new_task' | 'completed' | 'accepted' | 'rejected'
) {
  if (soundType) {
    playNotificationSound(soundType);
  }

  // 1. Dispatch In-App Toast (for Safari iOS & all browsers)
  const toastId = 'toast-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
  toastListeners.forEach(fn => fn({
    id: toastId,
    title,
    body,
    type: soundType || 'new_task'
  }));

  // 2. Dispatch Native Web Notification if supported and permission is granted
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const notification = new Notification(title, {
        body,
        dir: 'rtl',
        lang: 'ar',
        tag: 'futurex_task_' + Date.now(),
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (err) {
      console.warn('Could not spawn system notification:', err);
    }
  }
}

