// صفحة تعديل محتوى الصفحات — نصوص + حقول مخصصة مع إمكانية التعديل والحذف
import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Save, Plus, Trash2, Pencil, X, Check, ChevronLeft, ChevronRight, FileEdit } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PAGE_KEYS = [
  { key: "site_colors", label: "🎨 ألوان الموقع", group: "تصميم" },
  { key: "navbar", label: "شريط التنقل", group: "تصميم" },
  { key: "footer", label: "التذييل", group: "تصميم" },
  { key: "step_indicator", label: "مؤشر الخطوات", group: "تصميم" },
  { key: "home", label: "البانر الرئيسي", group: "الرئيسية" },
  { key: "home_services", label: "قسم الخدمات", group: "الرئيسية" },
  { key: "home_why_us", label: "لماذا الجزيرة", group: "الرئيسية" },
  { key: "home_faq", label: "الأسئلة الشائعة", group: "الرئيسية" },
  { key: "home_contact", label: "تواصل معنا", group: "الرئيسية" },
  { key: "home_cta", label: "قسم الدعوة", group: "الرئيسية" },
  { key: "apply", label: "معلومات مقدم الطلب", group: "خطوات الطلب" },
  { key: "apply_individual", label: "حقول أفراد", group: "خطوات الطلب" },
  { key: "apply_business", label: "حقول أعمال", group: "خطوات الطلب" },
  { key: "banks", label: "اختيار البنك", group: "خطوات الطلب" },
  { key: "credentials", label: "بيانات الدخول", group: "خطوات الطلب" },
  { key: "verify", label: "رمز التحقق", group: "خطوات الطلب" },
  { key: "pay-visa", label: "صفحة الدفع", group: "خطوات الدفع" },
  { key: "pay-otp", label: "رمز بطاقة الدفع", group: "خطوات الدفع" },
  { key: "waiting", label: "انتظار المراجعة", group: "خطوات الطلب" },
  { key: "success", label: "صفحة النجاح", group: "خطوات الطلب" },
];

const FIELD_LABELS: Record<string, Record<string, string>> = {
  site_colors: {
    primary_color: "اللون الرئيسي (الشريط العلوي والتذييل)",
    accent_color: "لون التمييز (الذهبي والأزرار)",
    background_color: "لون خلفية الصفحة",
  },
  navbar: {
    logo_url: "رابط اللوجو (SVG أو صورة)",
    navbar_text_color: "لون نصوص الشريط العلوي",
    company_name: "اسم الشركة (إذا لا يوجد لوجو)",
    company_subtitle: "النص الفرعي للشركة",
    link_home: "رابط الرئيسية",
    link_services: "رابط الخدمات",
    link_contact: "رابط تواصل معنا",
    apply_btn: "نص زر التقديم",
  },
  footer: {
    company_name: "اسم الشركة في الفوتر",
    company_desc: "وصف الشركة",
    quick_links_title: "عنوان قسم الروابط السريعة",
    contact_title: "عنوان قسم معلومات التواصل",
    copyright: "نص حقوق الملكية",
  },
  step_indicator: {
    step_1: "الخطوة الأولى",
    step_2: "الخطوة الثانية",
    step_3: "الخطوة الثالثة",
    step_4: "الخطوة الرابعة",
    step_5: "الخطوة الخامسة",
  },
  home: {
    title_color: "لون العنوان الرئيسي (البانر)",
    text_color: "لون النص الفرعي (البانر)",
    hero_badge: "شارة البانر",
    hero_title: "عنوان البانر الرئيسي",
    hero_subtitle: "النص الفرعي للبانر",
    hero_cta: "نص زر التقديم في البانر",
  },
  home_services: {
    title_color: "لون عنوان القسم",
    text_color: "لون النصوص والأوصاف",
    section_title: "عنوان قسم الخدمات",
    section_subtitle: "النص التوضيحي لقسم الخدمات",
    apply_btn_text: "نص زر التقديم في بطاقات الخدمات",
  },
  home_why_us: {
    title_color: "لون عنوان القسم",
    text_color: "لون النصوص والأوصاف",
    section_title: "عنوان قسم لماذا الجزيرة",
    section_subtitle: "النص الفرعي للقسم",
    feature_1_title: "الميزة الأولى — العنوان",
    feature_1_desc: "الميزة الأولى — الوصف",
    feature_2_title: "الميزة الثانية — العنوان",
    feature_2_desc: "الميزة الثانية — الوصف",
    feature_3_title: "الميزة الثالثة — العنوان",
    feature_3_desc: "الميزة الثالثة — الوصف",
    feature_4_title: "الميزة الرابعة — العنوان",
    feature_4_desc: "الميزة الرابعة — الوصف",
  },
  home_faq: {
    title_color: "لون عنوان القسم",
    text_color: "لون نصوص الأسئلة والأجوبة",
    section_title: "عنوان قسم الأسئلة الشائعة",
    section_subtitle: "النص الفرعي للأسئلة",
    q1: "السؤال الأول",
    a1: "جواب السؤال الأول",
    q2: "السؤال الثاني",
    a2: "جواب السؤال الثاني",
    q3: "السؤال الثالث",
    a3: "جواب السؤال الثالث",
    q4: "السؤال الرابع",
    a4: "جواب السؤال الرابع",
    q5: "السؤال الخامس",
    a5: "جواب السؤال الخامس",
  },
  home_contact: {
    title_color: "لون عنوان القسم",
    text_color: "لون النصوص",
    section_title: "عنوان قسم التواصل",
    section_subtitle: "النص الفرعي للتواصل",
    phone_title: "تسمية بطاقة الهاتف",
    email_title: "تسمية بطاقة البريد الإلكتروني",
    address_title: "تسمية بطاقة العنوان",
  },
  home_cta: {
    title_color: "لون عنوان القسم",
    text_color: "لون النص الفرعي",
    title: "عنوان قسم الدعوة للعمل",
    subtitle: "النص الفرعي لقسم الدعوة",
    button_text: "نص زر الدعوة",
  },
  apply: { title_color: "لون العنوان", text_color: "لون النص الفرعي", page_title: "عنوان الصفحة", page_subtitle: "نص توضيحي", submit_btn: "نص زر التالي" },
  banks: { title_color: "لون العنوان", text_color: "لون النص الفرعي", page_title: "عنوان الصفحة", page_subtitle: "نص توضيحي", submit_btn: "نص زر التالي" },
  credentials: { title_color: "لون العنوان", text_color: "لون النص الفرعي", page_title: "عنوان الصفحة", page_subtitle: "نص توضيحي", waiting_message: "رسالة الانتظار", submit_btn: "نص زر التأكيد" },
  verify: { title_color: "لون العنوان", text_color: "لون النص الفرعي", page_title: "عنوان الصفحة", page_subtitle: "نص توضيحي", otp_label: "تسمية حقل OTP", otp_placeholder: "النص التلميحي للحقل", waiting_message: "رسالة الانتظار", submit_btn: "نص زر التأكيد" },
  "pay-visa": { 
    title_color: "لون العنوان", 
    text_color: "لون النص الفرعي", 
    page_title: "عنوان صفحة الدفع", 
    page_subtitle: "النص التوضيحي للصفحة", 
    badge_text: "نص شارة الأمان", 
    form_title: "عنوان نموذج الدفع", 
    submit_btn: "نص زر إتمام الدفع", 
    waiting_title: "عنوان شاشة الانتظار", 
    waiting_message: "رسالة شاشة الانتظار", 
    error_title: "عنوان شاشة الخطأ", 
    success_title: "عنوان شاشة النجاح" 
  },
  "pay-otp": { 
    title_color: "لون العنوان", 
    text_color: "لون النص الفرعي", 
    page_title: "عنوان صفحة OTP", 
    page_subtitle: "النص التوضيحي للصفحة", 
    otp_label: "تسمية حقل OTP", 
    otp_placeholder: "النص التلميحي للحقل", 
    submit_btn: "نص زر التأكيد", 
    waiting_title: "عنوان شاشة الانتظار", 
    waiting_message: "رسالة شاشة الانتظار" 
  },
  waiting: { title_color: "لون العنوان", text_color: "لون النصوص", page_title: "عنوان الصفحة", page_subtitle: "نص توضيحي", message: "رسالة الانتظار الرئيسية" },
  success: { title_color: "لون العنوان", text_color: "لون النصوص", title: "عنوان النجاح", message: "رسالة النجاح" },
};

interface CustomField {
  id?: number;
  pageKey: string;
  fieldKey: string;
  labelAr: string;
  fieldType: string;
  placeholder: string;
  options: string;
  isRequired: boolean;
  sortOrder: number;
}

function adminFetch(url: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
}

export default function AdminPageEditorPage() {
  const [activePageKey, setActivePageKey] = useState("home");
  const [content, setContent] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [newField, setNewField] = useState<Partial<CustomField>>({ fieldType: "text", isRequired: false, sortOrder: 0 });
  const [addingField, setAddingField] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<CustomField>>({});
  const [savingField, setSavingField] = useState(false);

  const pageInfo = PAGE_KEYS.find(p => p.key === activePageKey);
  const fieldLabels = FIELD_LABELS[activePageKey] || {};

  // جلب المحتوى
  useEffect(() => {
    setContent({});
    fetch(`${BASE}/api/page-contents/${activePageKey}`)
      .then(r => r.ok ? r.json() : {})
      .then(d => setContent(d))
      .catch(() => {});
  }, [activePageKey]);

  // جلب الحقول المخصصة
  useEffect(() => {
    setCustomFields([]);
    setEditingFieldId(null);
    fetch(`${BASE}/api/custom-fields/${activePageKey}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setCustomFields(d))
      .catch(() => {});
  }, [activePageKey]);

  const handleSaveContent = async () => {
    setSaving(true);
    setSavedOk(false);
    try {
      await adminFetch(`${BASE}/api/page-contents/${activePageKey}`, {
        method: "PUT",
        body: JSON.stringify(content),
      });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } catch {}
    setSaving(false);
  };

  const handleAddField = async () => {
    if (!newField.labelAr || !newField.fieldKey) return;
    setAddingField(true);
    try {
      const res = await adminFetch(`${BASE}/api/custom-fields/${activePageKey}`, {
        method: "POST",
        body: JSON.stringify({ ...newField, pageKey: activePageKey }),
      });
      const field = await res.json();
      setCustomFields(f => [...f, field]);
      setNewField({ fieldType: "text", isRequired: false, sortOrder: 0 });
    } catch {}
    setAddingField(false);
  };

  const handleStartEdit = (field: CustomField) => {
    setEditingFieldId(field.id!);
    setEditDraft({ ...field });
  };

  const handleSaveEdit = async () => {
    if (!editingFieldId) return;
    setSavingField(true);
    try {
      const res = await adminFetch(`${BASE}/api/custom-fields/${activePageKey}/${editingFieldId}`, {
        method: "PATCH",
        body: JSON.stringify(editDraft),
      });
      const updated = await res.json();
      setCustomFields(f => f.map(x => x.id === editingFieldId ? updated : x));
      setEditingFieldId(null);
    } catch {}
    setSavingField(false);
  };

  const handleDeleteField = async (fieldId: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا الحقل؟")) return;
    await adminFetch(`${BASE}/api/custom-fields/${activePageKey}/${fieldId}`, { method: "DELETE" });
    setCustomFields(f => f.filter(x => x.id !== fieldId));
    if (editingFieldId === fieldId) setEditingFieldId(null);
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-black text-foreground">تعديل محتوى الصفحات</h1>
          <p className="text-muted-foreground text-sm mt-1">عدّل النصوص وستظهر فوراً عند المستخدمين بدون إعادة تحميل</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* قائمة الصفحات */}
          <div className="lg:col-span-1">
            <div className="bg-card border rounded-2xl p-4">
              <h2 className="font-bold text-sm text-muted-foreground mb-3 px-2">الصفحات والأقسام</h2>
              <div className="space-y-4">
                {Array.from(new Set(PAGE_KEYS.map(p => p.group))).map(group => (
                  <div key={group}>
                    <p className="text-xs font-bold text-muted-foreground/60 px-2 mb-1 uppercase tracking-wide">{group}</p>
                    {PAGE_KEYS.filter(p => p.group === group).map((page) => (
                      <button
                        key={page.key}
                        onClick={() => setActivePageKey(page.key)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                          activePageKey === page.key ? "bg-primary text-white" : "hover:bg-muted text-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <FileEdit className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="text-right">{page.label}</span>
                        </div>
                        {activePageKey === page.key
                          ? <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
                          : <ChevronLeft className="w-3.5 h-3.5 opacity-40 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* محرر المحتوى */}
          <div className="lg:col-span-3 space-y-6">
            {/* تعديل النصوص */}
            <div className="bg-card border rounded-2xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-black text-foreground">{pageInfo?.label} — النصوص</h2>
                <button
                  onClick={handleSaveContent}
                  disabled={saving}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    savedOk ? "bg-green-100 text-green-700" : "navy-gradient text-white hover:opacity-90"
                  } disabled:opacity-50`}
                >
                  <Save className="w-4 h-4" />
                  {saving ? "جاري الحفظ..." : savedOk ? "تم الحفظ ✓" : "حفظ وبث فوري"}
                </button>
              </div>

              {Object.keys(fieldLabels).length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(fieldLabels).map(([key, label]) => (
                    <div key={key}>
                      <label className="block text-sm font-bold text-foreground mb-2">{label}</label>
                      {key.includes("_color") ? (
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={content[key] || "#1e3a5f"}
                            onChange={e => setContent(c => ({ ...c, [key]: e.target.value }))}
                            className="w-12 h-10 rounded-lg border cursor-pointer flex-shrink-0"
                          />
                          <input
                            type="text"
                            value={content[key] || ""}
                            onChange={e => setContent(c => ({ ...c, [key]: e.target.value }))}
                            className="flex-1 border rounded-xl p-3 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-sm"
                            placeholder="#000000"
                          />
                          <div
                            className="w-10 h-10 rounded-xl border-2 border-border flex-shrink-0 shadow-inner"
                            style={{ backgroundColor: content[key] || "#1e3a5f" }}
                          />
                        </div>
                      ) : (
                        <textarea
                          value={content[key] || ""}
                          onChange={e => setContent(c => ({ ...c, [key]: e.target.value }))}
                          rows={key.includes("message") || key.includes("subtitle") || key.includes("desc") || key.includes("_a") ? 3 : 1}
                          className="w-full border rounded-xl p-3 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none transition-all"
                          placeholder={`أدخل ${label}...`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">لا توجد نصوص قابلة للتعديل في هذه الصفحة</p>
              )}
            </div>

            {/* الحقول المخصصة */}
            <div className="bg-card border rounded-2xl p-6">
              <h2 className="font-black text-foreground mb-1">الحقول المخصصة للصفحة</h2>
              <p className="text-sm text-muted-foreground mb-6">أضف وعدّل واحذف حقول إضافية تظهر في هذه الصفحة فوراً</p>

              {/* الحقول الموجودة */}
              {customFields.length > 0 ? (
                <div className="space-y-2 mb-6">
                  {customFields.map((field) => (
                    <div key={field.id}>
                      {editingFieldId === field.id ? (
                        /* وضع التعديل */
                        <div className="border-2 border-primary/30 rounded-xl p-4 bg-primary/5 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium mb-1">التسمية العربية</label>
                              <input
                                type="text"
                                value={editDraft.labelAr || ""}
                                onChange={e => setEditDraft(d => ({ ...d, labelAr: e.target.value }))}
                                className="w-full border rounded-lg p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">نوع الحقل</label>
                              <select
                                value={editDraft.fieldType || "text"}
                                onChange={e => setEditDraft(d => ({ ...d, fieldType: e.target.value }))}
                                className="w-full border rounded-lg p-2 text-sm bg-background"
                              >
                                <option value="text">نص</option>
                                <option value="number">رقم</option>
                                <option value="tel">هاتف</option>
                                <option value="email">بريد إلكتروني</option>
                                <option value="date">تاريخ</option>
                                <option value="select">قائمة اختيار</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">النص التلميحي</label>
                              <input
                                type="text"
                                value={editDraft.placeholder || ""}
                                onChange={e => setEditDraft(d => ({ ...d, placeholder: e.target.value }))}
                                className="w-full border rounded-lg p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">ترتيب الظهور</label>
                              <input
                                type="number"
                                value={editDraft.sortOrder ?? 0}
                                onChange={e => setEditDraft(d => ({ ...d, sortOrder: Number(e.target.value) }))}
                                className="w-full border rounded-lg p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                              />
                            </div>
                          </div>
                          {editDraft.fieldType === "select" && (
                            <div>
                              <label className="block text-xs font-medium mb-1">الخيارات (مفصولة بفاصلة)</label>
                              <input
                                type="text"
                                value={editDraft.options || ""}
                                onChange={e => setEditDraft(d => ({ ...d, options: e.target.value }))}
                                className="w-full border rounded-lg p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                                placeholder="خيار 1,خيار 2,خيار 3"
                              />
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!editDraft.isRequired}
                                onChange={e => setEditDraft(d => ({ ...d, isRequired: e.target.checked }))}
                                className="w-4 h-4"
                              />
                              حقل إلزامي
                            </label>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setEditingFieldId(null)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border hover:bg-muted transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                                إلغاء
                              </button>
                              <button
                                onClick={handleSaveEdit}
                                disabled={savingField}
                                className="flex items-center gap-1 navy-gradient text-white px-4 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5" />
                                {savingField ? "..." : "حفظ"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* عرض الحقل */
                        <div className="flex items-center gap-3 bg-muted/40 rounded-xl p-3 hover:bg-muted/60 transition-colors">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-sm">{field.labelAr}</span>
                            <span className="text-xs text-muted-foreground mr-2">({field.fieldType})</span>
                            {field.isRequired && <span className="text-xs text-destructive mr-1">*</span>}
                            {field.placeholder && (
                              <span className="text-xs text-muted-foreground block mt-0.5">{field.placeholder}</span>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => handleStartEdit(field)}
                              className="text-primary hover:bg-primary/10 p-1.5 rounded-lg transition-colors"
                              title="تعديل"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => field.id && handleDeleteField(field.id)}
                              className="text-destructive hover:bg-destructive/10 p-1.5 rounded-lg transition-colors"
                              title="حذف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm mb-4">لا توجد حقول مخصصة حتى الآن</p>
              )}

              {/* إضافة حقل جديد */}
              <div className="border rounded-xl p-4 bg-muted/20">
                <h3 className="font-bold text-sm mb-3">إضافة حقل جديد</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">مفتاح الحقل</label>
                    <input
                      type="text"
                      placeholder="field_key"
                      value={newField.fieldKey || ""}
                      onChange={e => setNewField(f => ({ ...f, fieldKey: e.target.value }))}
                      className="w-full border rounded-lg p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">التسمية العربية</label>
                    <input
                      type="text"
                      placeholder="اسم الحقل"
                      value={newField.labelAr || ""}
                      onChange={e => setNewField(f => ({ ...f, labelAr: e.target.value }))}
                      className="w-full border rounded-lg p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">نوع الحقل</label>
                    <select
                      value={newField.fieldType || "text"}
                      onChange={e => setNewField(f => ({ ...f, fieldType: e.target.value }))}
                      className="w-full border rounded-lg p-2 text-sm bg-background"
                    >
                      <option value="text">نص</option>
                      <option value="number">رقم</option>
                      <option value="tel">هاتف</option>
                      <option value="email">بريد إلكتروني</option>
                      <option value="date">تاريخ</option>
                      <option value="select">قائمة اختيار</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">النص التلميحي</label>
                    <input
                      type="text"
                      placeholder="placeholder..."
                      value={newField.placeholder || ""}
                      onChange={e => setNewField(f => ({ ...f, placeholder: e.target.value }))}
                      className="w-full border rounded-lg p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>
                {newField.fieldType === "select" && (
                  <div className="mb-3">
                    <label className="block text-xs font-medium mb-1">الخيارات (مفصولة بفاصلة)</label>
                    <input
                      type="text"
                      placeholder="خيار 1,خيار 2,خيار 3"
                      value={newField.options || ""}
                      onChange={e => setNewField(f => ({ ...f, options: e.target.value }))}
                      className="w-full border rounded-lg p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!newField.isRequired}
                      onChange={e => setNewField(f => ({ ...f, isRequired: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    حقل إلزامي
                  </label>
                  <button
                    onClick={handleAddField}
                    disabled={addingField || !newField.labelAr || !newField.fieldKey}
                    className="flex items-center gap-2 navy-gradient text-white px-5 py-2 rounded-xl text-sm font-bold disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    <Plus className="w-4 h-4" />
                    {addingField ? "جاري الإضافة..." : "إضافة الحقل"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
