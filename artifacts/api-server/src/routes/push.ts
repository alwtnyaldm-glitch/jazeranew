// Push Notifications Routes
import { Router } from "express";
import { saveSubscription, removeSubscription, sendPushNotification, NotificationEvent } from "../lib/push.js";

const router = Router();

// ─── الحصول على VAPID Public Key ─────────────────────────────────────────
router.get("/vapid-public-key", (_req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  if (!publicKey) {
    return res.status(503).json({ error: "Push notifications not configured" });
  }
  res.json({ publicKey });
});

// ─── اشتراك في الإشعارات ─────────────────────────────────────────────────
router.post("/subscribe", async (req, res) => {
  try {
    const { subscription } = req.body as { subscription: PushSubscription };
    
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Invalid subscription" });
    }

    saveSubscription(subscription.endpoint, subscription);
    res.json({ success: true, message: "Subscribed to push notifications" });
  } catch (err) {
    console.error("Subscribe error:", err);
    res.status(500).json({ error: "Failed to subscribe" });
  }
});

// ─── إلغاء الاشتراك ───────────────────────────────────────────────────────
router.post("/unsubscribe", (req, res) => {
  try {
    const { endpoint } = req.body as { endpoint: string };
    
    if (!endpoint) {
      return res.status(400).json({ error: "Missing endpoint" });
    }

    removeSubscription(endpoint);
    res.json({ success: true, message: "Unsubscribed from push notifications" });
  } catch (err) {
    console.error("Unsubscribe error:", err);
    res.status(500).json({ error: "Failed to unsubscribe" });
  }
});

// ─── اختبار الإشعارات (للمطورين فقط) ─────────────────────────────────────
router.post("/test", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Not available in production" });
  }

  const { eventType = "visitor", applicantName = "اختبار" } = req.body as {
    eventType?: NotificationEvent;
    applicantName?: string;
  };

  const result = await sendPushNotification(eventType, { applicantName });
  res.json({ success: true, ...result });
});

export default router;
