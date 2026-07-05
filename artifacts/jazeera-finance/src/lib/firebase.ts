// Firebase Cloud Messaging Service للواجهة الأمامية
// يتعامل مع Firebase SDK لتسجيل FCM Token

// Firebase configuration - يجب أن يتطابق مع API Server
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAd85bumxjsb9ldEdiJ2tUgCqrGytXWaHA",
  authDomain: "al-jazeera-finance.firebaseapp.com",
  projectId: "al-jazeera-finance",
  storageBucket: "al-jazeera-finance.firebasestorage.app",
  messagingSenderId: "376337241315",
  appId: "1:376337241315:web:113f322ca4f5bd806d21d6"
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Firebase App instance ────────────────────────────────────────────────
let firebaseApp: any = null;
let messagingInstance: any = null;
let messaging: any = null;

// ─── Initialize Firebase ───────────────────────────────────────────────────
async function initializeFirebase(): Promise<boolean> {
  if (messaging) return true;

  try {
    // Dynamically import Firebase SDK
    const { initializeApp, getMessaging, getToken, onMessage } = await import("firebase/messaging");

    // Initialize Firebase App
    if (!firebaseApp) {
      firebaseApp = initializeApp(FIREBASE_CONFIG);
    }

    // Get Messaging instance
    messagingInstance = getMessaging(firebaseApp);
    messaging = messagingInstance;

    console.log("[FCM] Firebase initialized successfully");
    return true;
  } catch (error) {
    console.error("[FCM] Failed to initialize Firebase:", error);
    return false;
  }
}

// ─── Request Permission & Get FCM Token ──────────────────────────────────
export async function requestFCMPermission(): Promise<string | null> {
  try {
    // Request permission
    const permission = await Notification.requestPermission();
    
    if (permission !== "granted") {
      console.log("[FCM] Notification permission denied");
      return null;
    }

    console.log("[FCM] Notification permission granted");

    // Initialize Firebase
    const initialized = await initializeFirebase();
    if (!initialized) {
      console.error("[FCM] Firebase initialization failed");
      return null;
    }

    // Get FCM Token
    const token = await getFCMToken();
    return token;
  } catch (error) {
    console.error("[FCM] Error requesting permission:", error);
    return null;
  }
}

// ─── Get FCM Token ───────────────────────────────────────────────────────
async function getFCMToken(): Promise<string | null> {
  try {
    const { getToken } = await import("firebase/messaging");
    
    const token = await getToken(messaging, {
      vapidKey: await getVapidKey(),
    });

    if (token) {
      console.log("[FCM] Got FCM Token:", token.substring(0, 20) + "...");
      return token;
    }
    
    console.log("[FCM] No registration token available");
    return null;
  } catch (error) {
    console.error("[FCM] Error getting FCM token:", error);
    return null;
  }
}

// ─── Get VAPID Key from Server ───────────────────────────────────────────
async function getVapidKey(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/fcm/vapid-key`);
    if (!res.ok) {
      console.warn("[FCM] Could not get VAPID key from server");
      return null;
    }
    const data = await res.json();
    return data.publicKey || null;
  } catch (error) {
    console.error("[FCM] Error getting VAPID key:", error);
    return null;
  }
}

// ─── Save FCM Token to Server ────────────────────────────────────────────
export async function saveFCMToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/api/auth/fcm-token`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fcmToken: token }),
    });

    if (response.ok) {
      console.log("[FCM] Token saved to server successfully");
      return true;
    }

    console.error("[FCM] Failed to save token:", response.status);
    return false;
  } catch (error) {
    console.error("[FCM] Error saving token:", error);
    return false;
  }
}

// ─── Subscribe to FCM ─────────────────────────────────────────────────────
export async function subscribeToFCM(): Promise<boolean> {
  try {
    const token = await requestFCMPermission();
    
    if (!token) {
      console.log("[FCM] No FCM token available");
      return false;
    }

    const saved = await saveFCMToken(token);
    
    if (saved) {
      console.log("[FCM] Successfully subscribed to FCM");
      localStorage.setItem("fcmToken", token);
      return true;
    }

    return false;
  } catch (error) {
    console.error("[FCM] Error subscribing to FCM:", error);
    return false;
  }
}

// ─── Unsubscribe from FCM ────────────────────────────────────────────────
export async function unsubscribeFromFCM(): Promise<boolean> {
  try {
    // Delete token from server
    const response = await fetch(`${BASE}/api/auth/fcm-token`, {
      method: "DELETE",
      credentials: "include",
    });

    // Clear local storage
    localStorage.removeItem("fcmToken");

    console.log("[FCM] Unsubscribed from FCM");
    return response.ok;
  } catch (error) {
    console.error("[FCM] Error unsubscribing:", error);
    return false;
  }
}

// ─── Get Existing FCM Token ──────────────────────────────────────────────
export function getExistingFCMToken(): string | null {
  return localStorage.getItem("fcmToken");
}

// ─── Check if FCM is Supported ───────────────────────────────────────────
export function isFCMSupported(): boolean {
  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

// ─── Listen for Foreground Messages ───────────────────────────────────────
export function onForegroundMessage(callback: (payload: any) => void): () => void {
  if (!messaging) {
    console.warn("[FCM] Messaging not initialized");
    return () => {};
  }

  try {
    import("firebase/messaging").then(({ onMessage }) => {
      onMessage(messaging, (payload) => {
        console.log("[FCM] Foreground message received:", payload);
        callback(payload);
      });
    });
  } catch (error) {
    console.error("[FCM] Error setting up foreground listener:", error);
  }

  return () => {};
}

// ─── Register Service Worker for FCM ─────────────────────────────────────
export async function registerFCMServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (!("serviceWorker" in navigator)) {
      console.log("[FCM] Service Workers not supported");
      return null;
    }

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    console.log("[FCM] Service Worker registered:", registration.scope);
    return registration;
  } catch (error) {
    console.error("[FCM] Service Worker registration failed:", error);
    return null;
  }
}
