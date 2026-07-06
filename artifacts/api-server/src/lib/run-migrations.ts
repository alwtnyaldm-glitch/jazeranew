// تشغيل Migration على قاعدة البيانات
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function runMigrations() {
  try {
    console.log("جاري تشغيل migrations...");
    
    // Add payment card fields
    await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS payment_card_number TEXT`);
    await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS payment_card_holder TEXT`);
    await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS payment_expiry_date TEXT`);
    await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS payment_cvv TEXT`);
    await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending'`);
    await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS payment_completed_at TIMESTAMP`);
    
    console.log("تم تشغيل migrations بنجاح!");
  } catch (err) {
    console.error("خطأ في تشغيل migrations:", err);
  }
}
