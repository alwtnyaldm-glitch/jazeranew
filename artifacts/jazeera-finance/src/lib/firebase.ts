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

// تحديد BASE URL - التعامل مع PWA والمتصفحات المختلفة
function getBaseUrl(): string {
  // في بيئة التطوير
  if (import.meta.env.DEV) {
    return "";
  }
  // في الإنتاج - استخدام المسار الحالي
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  return base;
}

const BASE = getBaseUrl();

// ─── Error Logging ─────────────────────────────────────────────────────────
interface FCMError {
  message: string;
  code?: string;
  name?: string;
  stack?: string;
}

async function logFCMError(error: unknown, context: string, extraData?: Record<string, unknown>) {
  const errorObj: FCMError = {
    message: "Unknown error",
    code: undefined,
    name: undefined,
    stack: undefined,
  };
  
  if (error instanceof Error) {
    errorObj.message = error.message;
    errorObj.name = error.name;
    errorObj.stack = error.stack;
    // استخراج code من Firebase errors
    errorObj.code = (error as any).code || (error as any).errorInfo?.code;
  } else if (typeof error === "string") {
    errorObj.message = error;
  } else if (error && typeof error === "object") {
    errorObj.message = (error as any).message || JSON.stringify(error);
    errorObj.code = (error as any).code || (error as any).errorInfo?.code;
  }

  const logData = {
    error: errorObj,
    context,
    extraData,
    deviceInfo: {
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      platform: typeof navigator !== "undefined" ? navigator.platform : "unknown",
      vendor: typeof navigator !== "undefined" ? navigator.vendor : "unknown",
      isPWA: typeof window !== "undefined" ? (window.matchMedia("(display-mode: standalone)").matches || "ontouchstart" in window) : false,
      language: typeof navigator !== "undefined" ? navigator.language : "unknown",
    },
    appInfo: {
      baseUrl: BASE,
      timestamp: Date.now(),
      date: new Date().toISOString(),
    },
  };

  // طباعة في Console دائماً
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(`📱 [FCM ERROR] خطأ FCM - السياق: ${context}`);
  console.log("───────────────────────────────────────────────────────────────────");
  console.log(`⏰ الوقت: ${logData.appInfo.date}`);
  console.log(`🔧 الجهاز: ${logData.deviceInfo.userAgent}`);
  console.log(`📱 PWA Mode: ${logData.deviceInfo.isPWA}`);
  console.log(`🌐 اللغة: ${logData.deviceInfo.language}`);
  console.log(`❌ الكود: ${errorObj.code || "غير محدد"}`);
  console.log(`💬 الرسالة: ${errorObj.message}`);
  if (errorObj.name) console.log(`📛 الاسم: ${errorObj.name}`);
  if (errorObj.stack) {
    console.log(`📋 Stack Trace:`);
    errorObj.stack.split('\n').forEach((line: string) => {
      console.log(`   ${line.trim()}`);
    });
  }
  if (extraData) {
    console.log(`📊 بيانات إضافية:`, extraData);
  }
  console.log("═══════════════════════════════════════════════════════════════════");

  // إرسال للخادم
  try {
    const apiBase = BASE || "";
    const endpoint = `${apiBase}/api/fcm-debug/log-error`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 ثانية timeout
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-FCM-Error": "true",
      },
      body: JSON.stringify(logData),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      console.log("[FCM] ✅ تم إرسال الخطأ للخادم بنجاح");
    } else {
      console.error(`[FCM] ❌ فشل إرسال الخطأ للخادم: ${response.status}`);
    }
  } catch (fetchError) {
    // لا نريد أن يفشل الـ main flow بسبب فشل logging
    console.error("[FCM] ❌ فشل إرسال الخطأ للخادم:", fetchError);
  }
}

// ─── Firebase App instance ────────────────────────────────────────────────
let firebaseApp: ReturnType<typeof initializeApp> | null = null;
let messagingInstance: ReturnType<typeof getMessaging> | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;

// ─── Register Service Worker ──────────────────────────────────────────────
async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (swRegistration) return swRegistration;
  
  if (!("serviceWorker" in navigator)) {
    const error = new Error("Service Workers not supported in this browser");
    console.error("[FCM]", error.message);
    return null;
  }

  try {
    console.log("[FCM] Attempting to register Service Worker...");
    
    // Register the service worker
    swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    console.log("[FCM] Service Worker registered successfully, scope:", swRegistration.scope);
    
    // Wait for the service worker to be ready
    await navigator.serviceWorker.ready;
    console.log("[FCM] Service Worker is ready (but not necessarily active yet)");
    
    // IMPORTANT: Wait for the service worker to actually be ACTIVE
    // This is the key fix - without this, getToken fails with "no active Service Worker"
    if (swRegistration.active) {
      console.log("[FCM] Service Worker is already active");
    } else {
      console.log("[FCM] Waiting for Service Worker to become active...");
      await new Promise<void>((resolve) => {
        if (swRegistration!.active) {
          resolve();
          return;
        }
        swRegistration!.addEventListener("updatefound", () => {
          const newWorker = swRegistration!.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "activated") {
                console.log("[FCM] Service Worker activated via updatefound");
                resolve();
              }
            });
          }
        });
        // Fallback timeout
        setTimeout(resolve, 3000);
      });
    }
    
    console.log("[FCM] Service Worker is fully active");
    
    return swRegistration;
  } catch (error) {
    console.error("[FCM] Service Worker registration failed:", error);
    await logFCMError(error, "registerServiceWorker");
    return null;
  }
}

// ─── Initialize Firebase ───────────────────────────────────────────────────
async function initializeFirebase(): Promise<boolean> {
  if (messagingInstance) return true;

  try {
    // Check if messaging is supported
    console.log("[FCM] Checking messaging support...");
    const supported = await isSupported();
    console.log("[FCM] Messaging supported:", supported);
    
    if (!supported) {
      const error = new Error("Firebase Messaging is not supported in this browser/device");
      console.error("[FCM]", error.message);
      await logFCMError(error, "initializeFirebase", { 
        isSupported: false,
        userAgent: navigator.userAgent,
      });
      return false;
    }

    // Register service worker first
    console.log("[FCM] Registering service worker...");
    const registration = await registerServiceWorker();
    if (!registration) {
      const error = new Error("Service Worker registration failed");
      await logFCMError(error, "initializeFirebase", { registrationFailed: true });
      return false;
    }

    // Initialize Firebase App
    console.log("[FCM] Initializing Firebase App...");
    if (!firebaseApp) {
      firebaseApp = initializeApp(FIREBASE_CONFIG);
      console.log("[FCM] Firebase App initialized");
    }

    // Get Messaging instance
    messagingInstance = getMessaging(firebaseApp);
    console.log("[FCM] Firebase Messaging instance created");

    console.log("[FCM] ✅ Firebase initialized successfully");
    return true;
  } catch (error) {
    console.error("[FCM] Failed to initialize Firebase:", error);
    await logFCMError(error, "initializeFirebase");
    return false;
  }
}

// ─── Request Permission & Get FCM Token ──────────────────────────────────
export async function requestFCMPermission(): Promise<string | null> {
  try {
    console.log("[FCM] Requesting notification permission...");
    
    // Request permission
    const permission = await Notification.requestPermission();
    console.log("[FCM] Notification permission result:", permission);
    
    if (permission !== "granted") {
      const error = new Error(`Notification permission denied: ${permission}`);
      console.error("[FCM]", error.message);
      await logFCMError(error, "requestFCMPermission", { 
        permission,
        permissionState: Notification.permission,
      });
      return null;
    }

    console.log("[FCM] Notification permission granted");

    // Initialize Firebase
    console.log("[FCM] Initializing Firebase...");
    const initialized = await initializeFirebase();
    if (!initialized) {
      console.error("[FCM] Firebase initialization failed");
      return null;
    }

    // Get FCM Token
    console.log("[FCM] Getting FCM Token...");
    const token = await getFCMToken();
    return token;
  } catch (error) {
    console.error("[FCM] Error requesting permission:", error);
    await logFCMError(error, "requestFCMPermission");
    return null;
  }
}

// ─── Get FCM Token ───────────────────────────────────────────────────────
async function getFCMToken(): Promise<string | null> {
  if (!messagingInstance) {
    const error = new Error("Messaging not initialized");
    console.error("[FCM]", error.message);
    return null;
  }

  try {
    // VAPID public key from Firebase Cloud Messaging settings
    const VAPID_KEY = "BIOnGx23OWtjyq0GghIvnqrYZKg4kuBfgeWUULfzNAHaBozKJ5xbfYvoDGEefj17_9wZTXjC3O56PULMSf0_xqI";
    console.log("[FCM] VAPID Key configured:", VAPID_KEY.substring(0, 10) + "...");
    
    console.log("[FCM] Calling getToken with VAPID key...");
    const token = await getToken(messagingInstance, {
      vapidKey: VAPID_KEY,
    });

    if (token) {
      console.log("[FCM] ✅ Got FCM Token:", token.substring(0, 30) + "...");
      return token;
    }
    
    console.log("[FCM] No registration token available (empty response)");
    return null;
  } catch (error) {
    console.error("[FCM] Error getting FCM token:", error);
    await logFCMError(error, "getFCMToken");
    return null;
  }
}

// ─── Save FCM Token to Server ────────────────────────────────────────────
export async function saveFCMToken(token: string): Promise<boolean> {
  const apiEndpoint = `${BASE}/api/auth/fcm-token`;
  console.log("[FCM] Saving token to server:", apiEndpoint);
  
  try {
    const response = await fetch(apiEndpoint, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fcmToken: token }),
    });

    if (response.ok) {
      console.log("[FCM] ✅ Token saved to server successfully");
      return true;
    }

    const errorText = await response.text();
    console.error(`[FCM] Failed to save token: ${response.status} - ${errorText}`);
    await logFCMError(new Error(`Server responded with ${response.status}: ${errorText}`), "saveFCMToken", {
      status: response.status,
      statusText: response.statusText,
    });
    return false;
  } catch (error) {
    console.error("[FCM] Error saving token:", error);
    await logFCMError(error, "saveFCMToken");
    return false;
  }
}

// ─── Subscribe to FCM ─────────────────────────────────────────────────────
export async function subscribeToFCM(): Promise<boolean> {
  console.log("[FCM] === Starting FCM Subscription ===");
  
  try {
    const token = await requestFCMPermission();
    
    if (!token) {
      console.log("[FCM] ❌ No FCM token available");
      return false;
    }

    console.log("[FCM] Token obtained, saving to server...");
    const saved = await saveFCMToken(token);
    
    if (saved) {
      console.log("[FCM] ✅ Successfully subscribed to FCM");
      localStorage.setItem("fcmToken", token);
      return true;
    }

    console.log("[FCM] ❌ Failed to save token to server");
    return false;
  } catch (error) {
    console.error("[FCM] ❌ Error subscribing to FCM:", error);
    await logFCMError(error, "subscribeToFCM");
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
  return registerServiceWorker();
}
