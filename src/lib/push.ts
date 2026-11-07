import { supabase } from './supabase';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeAdminToPush(userId: string): Promise<{ success: boolean; message: string }> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported on this browser or device.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted. Please enable notifications in your browser settings.');
  }

  const registration = await navigator.serviceWorker.ready;

  // Retrieve public VAPID key from server or environment
  let vapidPublicKey = '';
  try {
    const res = await fetch('/api/notifications/vapid-public-key');
    if (res.ok) {
      const data = await res.json();
      vapidPublicKey = data?.publicKey || '';
    }
  } catch (_) {}

  // Fallback to meta tag or default VAPID if configured
  if (!vapidPublicKey) {
    const metaTag = document.querySelector('meta[name="vapid-key"]');
    if (metaTag) {
      vapidPublicKey = metaTag.getAttribute('content') || '';
    }
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const subOptions: PushSubscriptionOptionsInit = {
      userVisibleOnly: true,
    };
    if (vapidPublicKey) {
      subOptions.applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
    }
    subscription = await registration.pushManager.subscribe(subOptions);
  }

  const subJson = subscription.toJSON();
  const endpoint = subscription.endpoint;
  const p256dh = subJson.keys?.p256dh || '';
  const authKey = subJson.keys?.auth || '';

  if (!endpoint || !p256dh || !authKey) {
    throw new Error('Failed to retrieve complete subscription keys from browser push manager.');
  }

  // Save to Supabase push_subscriptions table
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: userId,
      endpoint,
      p256dh,
      auth: authKey,
      created_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });

  if (error) {
    throw new Error(`Failed to save push subscription to database: ${error.message}`);
  }

  return { success: true, message: 'Admin notifications enabled successfully!' };
}
