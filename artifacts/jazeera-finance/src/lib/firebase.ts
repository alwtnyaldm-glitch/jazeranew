// Firebase Cloud Messaging Service للواجهة الأمامية
// يتعامل مع Firebase SDK لتسجيل FCM Token

import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

// Firebase configuration
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
let firebaseApp: ReturnType<typeof initializeApp> | null = null;
let messagingInstance: ReturnType<typeof getMessaging> | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;

// ─── Register Service Worker ──────────────────────────────────────────────
async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (swRegistration) return swRegistration;
  
  if (!("serviceWorker" in navigator)) {
    console.error("[FCM] Service Workers not supported");
    return null;
  }

  try {
    // Register the service worker
    swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    console.log("[FCM] Service Worker registered:", swRegistration.scope);
    
    // Wait for the service worker to be ready
    await navigator.serviceWorker.ready;
    console.log("[FCM] Service Worker is ready");
    
    return swRegistration;
  } catch (error) {
    console.error("[FCM] Service Worker registration failed:", error);
    return null;
  }
}

// ─── Initialize Firebase ───────────────────────────────────────────────────
async function initializeFirebase(): Promise<boolean> {
  if (messagingInstance) return true;

  try {
    // Check if messaging is supported
    const supported = await isSupported();
    if (!supported) {
      console.error("[FCM] Firebase Messaging is not supported in this browser");
      return false;
    }

    // Register service worker first
    const registration = await registerServiceWorker();
    if (!registration) {
      console.error("[FCM] Service Worker registration failed");
      return false;
    }

    // Initialize Firebase App
    if (!firebaseApp) {
      firebaseApp = initializeApp(FIREBASE_CONFIG);
    }

    // Get Messaging instance
    messagingInstance = getMessaging(firebaseApp);

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
  if (!messagingInstance) {
    console.error("[FCM] Messaging not initialized");
    return null;
  }

  try {
    // VAPID public key from Firebase Cloud Messaging settings
    const VAPID_KEY = "BIOnGx23OWtjyq0GghIvnqrYZKg4kuBfgeWUULfzNAHaBozKJ5xbfYvoDGEefj17_9wZTXjC3O56PULMSf0_xqI";
    
    const token = await getToken(messagingInstance, {
      vapidKey: VAPID_KEY,
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
  // Basic check - messaging support will be verified during initialization
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

// ─── Listen for Foreground Messages ───────────────────────────────────────
export function onForegroundMessage(callback: (payload: any) => void): () => void {
  if (!messagingInstance) {
    console.warn("[FCM] Messaging not initialized");
    return () => {};
  }

  try {
    onMessage(messagingInstance, (payload) => {
      console.log("[FCM] Foreground message received:", payload);
      callback(payload);
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
