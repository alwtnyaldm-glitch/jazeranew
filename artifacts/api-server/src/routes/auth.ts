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

// ─── فحص إذا الجهاز مسجل مسبقاً ─────────────────────────────────────────
router.get("/check-device", async (req, res) => {
  if (!req.session.isAuthenticated) {
    return res.status(401).json({ error: "غير مصرح" });
  }

  try {
    const deviceId = req.session.adminUsername || "admin";
    
    // البحث عن الجهاز في قاعدة البيانات
    const [device] = await db
      .select()
      .from(trustedDevicesTable)
      .where(eq(trustedDevicesTable.deviceId, deviceId))
      .limit(1);

    if (device && device.pushSubscription) {
      // الجهاز مسجل وله اشتراك
      res.json({ 
        hasPushSubscription: true,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
      });
    } else {
      // الجهاز غير مسجل
      res.json({ 
        hasPushSubscription: false,
        deviceId: deviceId,
      });
    }
  } catch (err) {
    req.log.error({ err }, "خطأ في فحص الجهاز");
    res.json({ hasPushSubscription: false, error: "خطأ في الفحص" });
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

    const deviceId = req.session.adminUsername || "admin";

    console.log(`📱 [FCM] Saving token for device: ${deviceId}`);

    // Check if device exists
    const existingDevice = await db
      .select()
      .from(trustedDevicesTable)
      .where(eq(trustedDevicesTable.deviceId, deviceId))
      .limit(1);

    if (existingDevice.length > 0) {
      // Update existing device
      await db
        .update(trustedDevicesTable)
        .set({
          pushSubscription: JSON.stringify({ token: fcmToken }),
          deviceName: deviceInfo?.deviceName || existingDevice[0].deviceName,
          browser: deviceInfo?.browser || existingDevice[0].browser,
          os: deviceInfo?.os || existingDevice[0].os,
          ipAddress: ip,
          lastUsedAt: new Date(),
        })
        .where(eq(trustedDevicesTable.deviceId, deviceId));
    } else {
      // Create new device
      await db.insert(trustedDevicesTable).values({
        deviceId: deviceId,
        pushSubscription: JSON.stringify({ token: fcmToken }),
        deviceName: deviceInfo?.deviceName || "Unknown Device",
        browser: deviceInfo?.browser || "Unknown",
        os: deviceInfo?.os || "Unknown",
        ipAddress: ip,
        isActive: true,
      });
    }

    console.log(`📱 [FCM] Token saved successfully for: ${deviceId}`);
    res.json({ success: true });
  } catch (err) {
    console.error(`📱 [FCM] Error saving token:`, err);
    req.log.error({ err }, "خطأ في حفظ FCM Token");
    res.status(500).json({ error: "فشل في حفظ FCM Token", details: String(err) });
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
