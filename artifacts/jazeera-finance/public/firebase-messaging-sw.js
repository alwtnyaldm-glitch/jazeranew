// Firebase Messaging Service Worker
// Handles push notifications even when the browser is closed

importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js");

// Firebase configuration - will be provided by the app
let firebaseConfig = null;
let messaging = null;

// ─── Initialize Firebase Messaging ─────────────────────────────────────────
self.addEventListener("install", (event) => {
  console.log("[FCM SW] Installing Service Worker...");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[FCM SW] Activating Service Worker...");
  event.waitUntil(clients.claim());
});

// ─── Handle push messages from FCM ──────────────────────────────────────
self.addEventListener("push", (event) => {
  console.log("[FCM SW] Push received:", event);

  let data = {
    title: "إشعار جديد",
    body: "",
    icon: "/icons/icon-192.png",
    tag: "default",
    data: null,
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      console.log("[FCM SW] Payload:", JSON.stringify(payload));

      // Handle FCM notification format
      if (payload.notification) {
        data = {
          title: payload.notification.title || data.title,
          body: payload.notification.body || data.body,
          icon: payload.notification.icon || data.icon,
          tag: payload.notification.tag || data.tag,
          data: payload.data || null,
        };
      }
      // Handle direct payload format
      else if (payload.title) {
        data = {
          title: payload.title || data.title,
          body: payload.body || data.body,
          icon: payload.icon || data.icon,
          tag: payload.tag || data.tag,
          data: payload.data || payload,
        };
      }
    }
  } catch (err) {
    console.error("[FCM SW] Error parsing push data:", err);
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: "/icons/badge-72.png",
    tag: data.tag,
    vibrate: [200, 100, 200],
    dir: "rtl",
    lang: "ar",
    renotify: true,
    requireInteraction: data.tag?.includes("otp") || false,
    actions: [
      { action: "open", title: "📱 فتح لوحة الإدارة" },
      { action: "dismiss", title: "❌ تجاهل" },
    ],
    data: {
      url: data.data?.url || "/admin/visitors",
      timestamp: Date.now(),
      ...data.data,
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ─── Handle notification click ───────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  console.log("[FCM SW] Notification clicked:", event);
  console.log("[FCM SW] Action:", event.action);

  event.notification.close();

  const targetUrl = event.notification.data?.url || "/admin/visitors";

  if (event.action === "dismiss") {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // البحث عن نافذة مفتوحة للوحة الإدارة
      for (const client of clientList) {
        if (client.url.includes("/admin") && "focus" in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      // فتح نافذة جديدة
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ─── Handle notification close ───────────────────────────────────────────
self.addEventListener("notificationclose", (event) => {
  console.log("[FCM SW] Notification closed:", event);
});
