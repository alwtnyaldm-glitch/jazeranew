// Push Notifications Service للـ Frontend
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// ─── تسجيل Service Worker ─────────────────────────────────────────────────
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) {
    console.log("Service Workers not supported");
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    console.log("Service Worker registered:", registration.scope);
    return registration;
  } catch (err) {
    console.error("Service Worker registration failed:", err);
    return null;
  }
}

// ─── الحصول على VAPID Public Key من السيرفر ──────────────────────────────
async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/push/vapid-public-key`);
    if (!res.ok) return null;
    const data = await res.json() as { publicKey?: string };
    return data.publicKey || null;
  } catch {
    return null;
  }
}

// ─── تحويل VAPID Key إلى Uint8Array ──────────────────────────────────────
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ─── الاشتراك في Push Notifications ─────────────────────────────────────
export async function subscribeToPush(): Promise<PushSubscription | null> {
  try {
    // 1. تسجيل Service Worker
    const registration = await registerServiceWorker();
    if (!registration) return null;

    // 2. الحصول على Permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("Notification permission denied");
      return null;
    }

    // 3. الحصول على VAPID Public Key
    const vapidPublicKey = await getVapidPublicKey();
    if (!vapidPublicKey) {
      console.log("VAPID Public Key not available");
      return null;
    }

    // 4. الاشتراك في Push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    // 5. إرسال الاشتراك للسيرفر
    const subData = subscription.toJSON() as PushSubscriptionData;
    await fetch(`${BASE}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subData }),
    });

    console.log("Push subscription successful!");
    return subscription;
  } catch (err) {
    console.error("Push subscription failed:", err);
    return null;
  }
}

// ─── إلغاء الاشتراك ───────────────────────────────────────────────────────
export async function unsubscribeFromPush(subscription: PushSubscription): Promise<boolean> {
  try {
    await subscription.unsubscribe();
    
    const subData = subscription.toJSON() as PushSubscriptionData;
    await fetch(`${BASE}/api/push/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subData.endpoint }),
    });

    console.log("Push unsubscribed");
    return true;
  } catch (err) {
    console.error("Unsubscribe failed:", err);
    return false;
  }
}

// ─── فحص حالة الاشتراك الحالية ──────────────────────────────────────────
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription;
  } catch {
    return null;
  }
}

// ─── فحص هل Push مدعوم ─────────────────────────────────────────────────
export function isPushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}
