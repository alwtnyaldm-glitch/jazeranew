// Service Worker for Push Notifications
// هذا الملف يجب أن يكون في /public/sw.js

const CACHE_NAME = "jazeera-finance-v1";

// ─── تثبيت Service Worker ─────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  console.log("[SW] Installing...");
  self.skipWaiting();
});

// ─── تفعيل Service Worker ─────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating...");
  event.waitUntil(clients.claim());
});

// ─── استقبال Push Notification ─────────────────────────────────────────────
self.addEventListener("push", (event) => {
  console.log("[SW] Push received:", event);

  let data = {
    title: "إشعار جديد",
    body: "",
    icon: "/icons/icon-192.png",
    tag: "default",
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = {
        title: payload.title || data.title,
        body: payload.body || data.body,
        icon: payload.icon || data.icon,
        tag: payload.tag || data.tag,
      };
    }
  } catch (err) {
    console.error("[SW] Error parsing push data:", err);
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
    requireInteraction: true,
    actions: [
      { action: "open", title: "فتح لوحة الإدارة" },
      { action: "dismiss", title: "تجاهل" },
    ],
    data: {
      url: "/admin/visitors",
      timestamp: Date.now(),
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ─── معالجة النقر على الإشعار ──────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  console.log("[SW] Notification clicked:", event);

  event.notification.close();

  const targetUrl = event.notification.data?.url || "/admin/visitors";

  if (event.action === "open" || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
        // البحث عن نافذة مفتوحة
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
  }
});

// ─── معالجة إغلاق الإشعار ──────────────────────────────────────────────────
self.addEventListener("notificationclose", (event) => {
  console.log("[SW] Notification closed:", event);
});
