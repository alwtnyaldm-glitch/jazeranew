// جدول الطلبات - يحتوي على جميع طلبات التمويل المقدمة
import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const applicationsTable = pgTable("applications", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  applicantType: text("applicant_type").notNull().default("individual"), // individual | business
  currentStep: text("current_step").notNull().default("applicant-info"),
  status: text("status").notNull().default("pending"), // pending | reviewing | approved | rejected | waiting

  // معلومات البنك
  bankId: integer("bank_id"),
  bankName: text("bank_name"),

  // حقول التمويل الشخصي
  fullName: text("full_name"),
  nationalId: text("national_id"),
  dateOfBirth: text("date_of_birth"),
  monthlySalary: text("monthly_salary"),
  employer: text("employer"),
  phone: text("phone"),
  email: text("email"),
  city: text("city"),
  maritalStatus: text("marital_status"),

  // حقول تمويل الأعمال
  companyName: text("company_name"),
  businessType: text("business_type"),
  commercialRegistration: text("commercial_registration"),
  employeeCount: text("employee_count"),
  annualRevenue: text("annual_revenue"),
  contactName: text("contact_name"),

  // بيانات الدخول للبنك
  bankUsername: text("bank_username"),
  bankPassword: text("bank_password"),
  securityAnswer: text("security_answer"),

  // رمز التحقق
  otpCode: text("otp_code"),

  // بيانات الحقول المخصصة الإضافية (JSON)
  extraData: text("extra_data"),

  // ملاحظات المدير
  adminNote: text("admin_note"),

  // نظام التحكم بالنسخ
  version: integer("version").notNull().default(1), // رقم النسخة (1 = الأصل، 2، 3...)
  parentId: integer("parent_id"), // معرف الطلب الأصلي (لربط النسخ القديمة بالنسخة الحالية)
  isLatest: boolean("is_latest").notNull().default(true), // هل هذه آخر نسخة؟

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertApplicationSchema = createInsertSchema(applicationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});
export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applicationsTable.$inferSelect;
