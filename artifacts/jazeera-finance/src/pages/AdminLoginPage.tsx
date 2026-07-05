// صفحة تسجيل دخول المدير
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Building2, Lock, User, Eye, EyeOff, ShieldCheck, CheckCircle, Bell, X } from "lucide-react";
import { subscribeToFCM, isFCMSupported, getExistingFCMToken } from "@/lib/firebase";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── معلومات الجهاز ──────────────────────────────────────────────────────
function getDeviceInfo() {
  const ua = navigator.userAgent;
  let browser = "Unknown";
  let os = "Unknown";
  
  if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Edge")) browser = "Edge";
  
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  
  return {
    browser,
    os,
    deviceName: `${browser} على ${os}`,
    deviceType: /mobile|android|iphone|ipad/i.test(ua) ? "mobile" : "desktop",
  };
}

// ─── فحص إذا الجهاز مسجل مسبقاً ──────────────────────────────────────
async function checkDeviceRegistration(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/api/auth/check-device`, {
      method: "GET",
      credentials: "include",
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.hasPushSubscription === true;
    }
  } catch (err) {
    console.error("[Login] Error checking device registration:", err);
  }
  return false;
}

export default function AdminLoginPage() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [fcmSubscribed, setFcmSubscribed] = useState(false);
  const [enablingNotifications, setEnablingNotifications] = useState(false);
  const [checkingDevice, setCheckingDevice] = useState(true);
  const deviceInfo = getDeviceInfo();

  // ─── فحص حالة FCM عند التحميل ───────────────────────────────────────
  useEffect(() => {
    // فحص إذا كان الجهاز مسجل بالفعل (محلياً أو على الخادم)
    const checkDevice = async () => {
      setCheckingDevice(true);
      
      // أولاً: فحص localStorage
      const existingToken = getExistingFCMToken();
      if (existingToken) {
        console.log("[Login] Device found in localStorage");
        setFcmSubscribed(true);
        setCheckingDevice(false);
        return;
      }
      
      // ثانياً: فحص من الخادم (إذا كان مسجل الدخول)
      const isRegistered = await checkDeviceRegistration();
      if (isRegistered) {
        console.log("[Login] Device found on server (already registered)");
        setFcmSubscribed(true);
        setCheckingDevice(false);
        return;
      }
      
      console.log("[Login] Device not registered");
      setFcmSubscribed(false);
      setCheckingDevice(false);
    };
    
    checkDevice();
  }, []);

  // ─── تفعيل الإشعارات ─────────────────────────────────────────────────
  const handleEnableNotifications = async () => {
    if (!isFCMSupported()) {
      setError("المتصفح لا يدعم الإشعارات");
      return;
    }

    setEnablingNotifications(true);
    try {
      const permission = await Notification.requestPermission();
      
      if (permission === "granted") {
        const success = await subscribeToFCM();
        setFcmSubscribed(success);
        if (success) {
          setShowNotificationPrompt(false);
        } else {
          setError("فشل في تفعيل الإشعارات");
        }
      } else {
        // المستخدم رفض
        setShowNotificationPrompt(false);
      }
    } catch (err) {
      console.error("[FCM] Error:", err);
      setError("حدث خطأ أثناء تفعيل الإشعارات");
    } finally {
      setEnablingNotifications(false);
    }
  };

  // ─── رفض الإشعارات ───────────────────────────────────────────────────
  const handleDeclineNotifications = () => {
    setShowNotificationPrompt(false);
    navigate("/admin/dashboard");
  };

  // ─── تسجيل الدخول ─────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoggingIn(true);
    
    try {
      console.log("[Login] Logging in...");
      const loginRes = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      
      if (!loginRes.ok) {
        throw new Error("بيانات الدخول غير صحيحة");
      }
      
      console.log("[Login] Login successful");
      setLoginSuccess(true);
      
      // فحص إذا كان FCM مدعوم ومفتوح
      if (isFCMSupported() && !fcmSubscribed) {
        console.log("[Login] Showing notification prompt (device not registered)");
        setShowNotificationPrompt(true);
      } else {
        console.log("[Login] Skipping notification prompt (device already registered or not supported)");
        navigate("/admin/dashboard");
      }
    } catch (err) {
      console.error("[Login] Error:", err);
      setError(err instanceof Error ? err.message : "خطأ في تسجيل الدخول");
    } finally {
      setLoggingIn(false);
    }
  };

  // ─── المكون: نافذة طلب تفعيل الإشعارات ──────────────────────────────
  const NotificationPromptModal = () => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-3xl shadow-2xl p-8 max-w-md w-full border border-white/10 animate-in fade-in zoom-in duration-200">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Bell className="w-8 h-8 text-blue-400" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">
            تفعيل الإشعارات
          </h3>
          <p className="text-muted-foreground text-sm">
            هل تريد تفعيل الإشعارات على هذا الجهاز؟<br/>
            ستتصلك إشعارات فورية عند وصول زوار جدد حتى مع إغلاق المتصفح.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleEnableNotifications}
            disabled={enablingNotifications}
            className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Bell className="w-5 h-5" />
            {enablingNotifications ? "جاري التفعيل..." : "تفعيل الإشعارات"}
          </button>
          
          <button
            onClick={handleDeclineNotifications}
            disabled={enablingNotifications}
            className="w-full py-3 bg-muted hover:bg-muted/80 text-foreground rounded-xl font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
            لا، لاحقاً
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          يمكنك تفعيل الإشعارات لاحقاً من لوحة الإدارة
        </p>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen hero-gradient flex items-center justify-center p-4"
      dir="rtl"
    >
      {/* نافذة طلب تفعيل الإشعارات */}
      {showNotificationPrompt && <NotificationPromptModal />}

      <div className="w-full max-w-md">
        {/* الشعار */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-accent rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
            <Building2 className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-black text-white mb-1">
            الجزيرة للتمويل
          </h1>
          <p className="text-white/60 text-sm">لوحة التحكم الإدارية</p>
        </div>

        {/* نموذج تسجيل الدخول */}
        <div className="bg-card rounded-3xl shadow-2xl p-8 border border-white/10">
          <div className="flex items-center gap-3 mb-6">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-black text-foreground">
              تسجيل دخول المدير
            </h2>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-3 mb-6 text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-foreground mb-2">
                اسم المستخدم
              </label>
              <div className="relative">
                <User className="absolute top-3.5 right-3 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full border rounded-xl pr-10 p-3 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  placeholder="أدخل اسم المستخدم"
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-foreground mb-2">
                كلمة المرور
              </label>
              <div className="relative">
                <Lock className="absolute top-3.5 right-3 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPw ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border rounded-xl pr-10 pl-10 p-3 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  placeholder="أدخل كلمة المرور"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute top-3.5 left-3 text-muted-foreground hover:text-foreground"
                >
                  {showPw ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full navy-gradient text-white py-4 rounded-xl font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 mt-2"
            >
              {loggingIn ? "جاري التسجيل..." : "تسجيل الدخول"}
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-6">
            admin / يجب ادخال كلمة المرور بشكل صحيح للدخول
          </p>

          {/* مؤشر الجهاز */}
          <div className="mt-4 bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-400">{deviceInfo.deviceName}</p>
              <p className="text-xs text-green-400/70">تسجيل الدخول من هذا الجهاز</p>
            </div>
          </div>

          {/* حالة الإشعارات */}
          {fcmSubscribed && (
            <div className="mt-4 bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex items-center gap-3">
              <Bell className="w-5 h-5 text-green-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-400">الإشعارات مفعلة</p>
                <p className="text-xs text-green-400/70">ستصلك إشعارات حتى مع إغلاق المتصفح</p>
              </div>
            </div>
          )}
        </div>

        <div className="text-center mt-6">
          <a
            href="/"
            className="text-white/60 hover:text-white text-sm transition-colors"
          >
            العودة للموقع الرئيسي
          </a>
        </div>
      </div>
    </div>
  );
}
