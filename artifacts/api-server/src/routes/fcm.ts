// FCM Routes - للحصول على VAPID Key
import { Router } from "express";
import { isFirebaseConfigured } from "../lib/firebase-admin.js";

const router = Router();

// ─── الحصول على VAPID Public Key ─────────────────────────────────────────
// ملاحظة: في Firebase FCM، نستخدم Web Push API العادي مع Firebase
// VAPID keys يتم توليدها باستخدام web-push أو firebase-admin
router.get("/vapid-key", async (_req, res) => {
  try {
    // في Firebase Admin SDK، يتم توليد VAPID key تلقائياً
    // لكن يمكننا توليد واحدة يدوياً إذا احتجنا
    
    // للتحقق، نرسل رسالة نجاح إذا Firebase مهيأ
    if (isFirebaseConfigured()) {
      // Firebase Cloud Messaging يستخدم مفاتيح خاصة بـ Firebase
      // لا نحتاج VAPID key منفصل مع Firebase Admin SDK
      res.json({ 
        configured: true,
        message: "Firebase FCM is configured. No separate VAPID key needed."
      });
    } else {
      res.status(503).json({ 
        error: "Firebase not configured",
        configured: false
      });
    }
  } catch (err) {
    console.error("[FCM] Error getting VAPID key:", err);
    res.status(500).json({ error: "Failed to get configuration" });
  }
});

// ─── إرسال إشعار اختبار ───────────────────────────────────────────────────
router.post("/test", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Not available in production" });
  }

  const { eventType = "visitor", applicantName = "اختبار" } = req.body as {
    eventType?: "visitor" | "personal" | "bank" | "otp";
    applicantName?: string;
  };

  try {
    const { sendFCMNotification } = await import("../lib/firebase-admin.js");
    const result = await sendFCMNotification(eventType, { applicantName });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("[FCM] Test notification failed:", err);
    res.status(500).json({ error: "Failed to send test notification" });
  }
});

// ─── حالة FCM ─────────────────────────────────────────────────────────────
router.get("/status", async (_req, res) => {
  res.json({
    configured: isFirebaseConfigured(),
    projectId: process.env.FIREBASE_PROJECT_ID || null,
  });
});

export default router;
