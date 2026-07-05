// مسارات تسجيل دخول المدير
import { Router } from "express";
import { db, adminConfigTable, trustedDevicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// ─── تسجيل دخول المدير ────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    return res.status(400).json({ error: "اسم المستخدم وكلمة السر مطلوبان" });
  }

  try {
    const [admin] = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.username, username))
      .limit(1);

    if (!admin || admin.password !== password) {
      return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    }

    const sessionToken = `admin_${Date.now()}_${Math.random().toString(36).slice(2, 15)}`;
    
    req.session.adminToken = sessionToken;
    req.session.adminUsername = username;
    req.session.isAuthenticated = true;

    res.json({
      success: true,
      username: admin.username,
      token: sessionToken,
    });
  } catch (err) {
    req.log.error({ err }, "خطأ في تسجيل الدخول");
    res.status(500).json({ error: "فشل في تسجيل الدخول" });
  }
});

// ─── التحقق من الجلسة ────────────────────────────────────────────────────
router.get("/check", async (req, res) => {
  try {
    if (!req.session.isAuthenticated) {
      return res.json({ authenticated: false });
    }

    res.json({
      authenticated: true,
      username: req.session.adminUsername,
    });
  } catch (err) {
    req.log.error({ err }, "خطأ في التحقق من الجلسة");
    res.json({ authenticated: false });
  }
});

// ─── تسجيل الخروج ─────────────────────────────────────────────────────────
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "فشل في تسجيل الخروج" });
    }
    res.json({ success: true });
  });
});

// ─── إضافة/تحديث FCM Token ───────────────────────────────────────────────
router.post("/fcm-token", async (req, res) => {
  if (!req.session.isAuthenticated) {
    return res.status(401).json({ error: "غير مصرح" });
  }

  const { fcmToken, deviceInfo } = req.body as {
    fcmToken?: string;
    deviceInfo?: { deviceName?: string; browser?: string; os?: string };
  };

  if (!fcmToken) {
    return res.status(400).json({ error: "FCM Token مطلوب" });
  }

  try {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
               req.ip ||
               req.socket.remoteAddress ||
               null;

    await db
      .update(trustedDevicesTable)
      .set({
        pushSubscription: fcmToken, // FCM token
        lastUsedAt: new Date(),
      })
      .where(eq(trustedDevicesTable.deviceId, req.session.adminUsername || "admin"));

    console.log(`📱 [FCM] Token saved for admin`);
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "خطأ في حفظ FCM Token");
    res.status(500).json({ error: "فشل في حفظ FCM Token" });
  }
});

// ─── الحصول على قائمة الأجهزة (للتوافق) ───────────────────────────────────
router.get("/devices", async (req, res) => {
  if (!req.session.isAuthenticated) {
    return res.status(401).json({ error: "غير مصرح" });
  }

  try {
    const devices = await db
      .select()
      .from(trustedDevicesTable)
      .where(eq(trustedDevicesTable.isActive, true))
      .orderBy(trustedDevicesTable.lastUsedAt);

    res.json(
      devices.map((d) => ({
        id: d.id,
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        deviceType: d.deviceType,
        browser: d.browser,
        os: d.os,
        lastUsedAt: d.lastUsedAt,
        createdAt: d.createdAt,
        hasFcmToken: !!d.pushSubscription,
      }))
    );
  } catch (err) {
    req.log.error({ err }, "خطأ في جلب الأجهزة");
    res.status(500).json({ error: "فشل في جلب الأجهزة" });
  }
});

export default router;
