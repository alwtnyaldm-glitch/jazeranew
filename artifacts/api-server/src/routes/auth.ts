// مسارات تسجيل دخول المدير - نظام الأجهزة الموثوقة
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
    // التحقق من كلمة السر
    const [admin] = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.username, username))
      .limit(1);

    if (!admin || admin.password !== password) {
      return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    }

    // إنشاء session آمن
    const sessionToken = `admin_${Date.now()}_${Math.random().toString(36).slice(2, 15)}`;
    
    // تخزين الجلسة في cookie
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

    // التحقق من صلاحية الجلسة
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

// ─── إضافة جهاز موثوق ────────────────────────────────────────────────────
router.post("/devices/trust", async (req, res) => {
  if (!req.session.isAuthenticated) {
    return res.status(401).json({ error: "غير مصرح" });
  }

  const { deviceId, deviceName, deviceType, browser, os } = req.body as {
    deviceId?: string;
    deviceName?: string;
    deviceType?: string;
    browser?: string;
    os?: string;
  };

  if (!deviceId) {
    return res.status(400).json({ error: "معرف الجهاز مطلوب" });
  }

  try {
    // الحصول على IP
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
               req.ip ||
               req.socket.remoteAddress ||
               null;

    // حذف أي جهاز قديم بنفس المعرف
    await db
      .delete(trustedDevicesTable)
      .where(eq(trustedDevicesTable.deviceId, deviceId));

    // إضافة الجهاز الجديد
    const [device] = await db
      .insert(trustedDevicesTable)
      .values({
        deviceId,
        deviceName: deviceName || "جهاز غير معروف",
        deviceType: deviceType || "browser",
        browser,
        os,
        ipAddress: ip,
        isActive: true,
      })
      .returning();

    res.json({
      success: true,
      device: {
        id: device.id,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
      },
    });
  } catch (err) {
    req.log.error({ err }, "خطأ في إضافة الجهاز الموثوق");
    res.status(500).json({ error: "فشل في إضافة الجهاز الموثوق" });
  }
});

// ─── تحديث أو إنشاء اشتراك Push للجهاز ──────────────────────────────────────
router.post("/devices/:deviceId/push-subscription", async (req, res) => {
  if (!req.session.isAuthenticated) {
    return res.status(401).json({ error: "غير مصرح" });
  }

  const { deviceId } = req.params;
  const { subscription, deviceName, browser, os } = req.body as {
    subscription?: object;
    deviceName?: string;
    browser?: string;
    os?: string;
  };

  if (!subscription) {
    return res.status(400).json({ error: "اشتراك Push مطلوب" });
  }

  console.log(`📱 [Auth] Saving push subscription for device: ${deviceId}`);
  console.log(`📱 [Auth] Subscription:`, JSON.stringify(subscription).substring(0, 200) + "...");

  try {
    // البحث عن الجهاز الموجود
    const [existingDevice] = await db
      .select()
      .from(trustedDevicesTable)
      .where(eq(trustedDevicesTable.deviceId, deviceId))
      .limit(1);

    if (existingDevice) {
      // تحديث اشتراك Push للجهاز الموجود
      console.log(`📱 [Auth] Device exists, updating push subscription...`);
      console.log(`📱 [Auth] Subscription type: ${typeof subscription}`);
      console.log(`📱 [Auth] Subscription value:`, subscription);
      
      const subscriptionJson = typeof subscription === 'string' 
        ? subscription 
        : JSON.stringify(subscription);
      
      console.log(`📱 [Auth] Subscription JSON length: ${subscriptionJson.length}`);
      console.log(`📱 [Auth] Subscription JSON preview: ${subscriptionJson.substring(0, 100)}...`);
      
      await db
        .update(trustedDevicesTable)
        .set({
          pushSubscription: subscriptionJson,
          lastUsedAt: new Date(),
        })
        .where(eq(trustedDevicesTable.deviceId, deviceId));
      
      console.log(`📱 [Auth] ✅ Successfully updated push subscription for device: ${deviceId}`);
      res.json({ success: true, action: "updated" });
    } else {
      // إنشاء جهاز جديد مع اشتراك Push
      console.log(`📱 [Auth] Device doesn't exist, creating new device with push subscription...`);
      
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
                 req.ip ||
                 req.socket.remoteAddress ||
                 null;

      const [newDevice] = await db
        .insert(trustedDevicesTable)
        .values({
          deviceId,
          deviceName: deviceName || "جهاز غير معروف",
          deviceType: "browser",
          browser,
          os,
          pushSubscription: JSON.stringify(subscription),
          ipAddress: ip,
          isActive: true, // defaults to true
          lastUsedAt: new Date(),
          createdAt: new Date(),
        })
        .returning();

      console.log(`📱 [Auth] ✅ Successfully created device with push subscription!`);
      console.log(`📱 [Auth] New device ID: ${newDevice.id}`);
      console.log(`📱 [Auth] Push subscription length: ${newDevice.pushSubscription?.length || 0}`);
      
      res.json({ success: true, action: "created", deviceId: newDevice.id });
    }
  } catch (err) {
    req.log.error({ err }, "خطأ في حفظ اشتراك Push");
    console.error(`📱 [Auth] ❌ Error saving push subscription:`, err);
    res.status(500).json({ error: "فشل في حفظ اشتراك Push" });
  }
});

// ─── الحصول على قائمة الأجهزة الموثوقة ───────────────────────────────────
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
        hasPushSubscription: !!d.pushSubscription,
      }))
    );
  } catch (err) {
    req.log.error({ err }, "خطأ في جلب الأجهزة الموثوقة");
    res.status(500).json({ error: "فشل في جلب الأجهزة الموثوقة" });
  }
});

// ─── حذف جهاز موثوق ─────────────────────────────────────────────────────
router.delete("/devices/:deviceId", async (req, res) => {
  if (!req.session.isAuthenticated) {
    return res.status(401).json({ error: "غير مصرح" });
  }

  const { deviceId } = req.params;

  try {
    await db
      .delete(trustedDevicesTable)
      .where(eq(trustedDevicesTable.deviceId, deviceId));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "خطأ في حذف الجهاز الموثوق");
    res.status(500).json({ error: "فشل في حذف الجهاز الموثوق" });
  }
});

export default router;
