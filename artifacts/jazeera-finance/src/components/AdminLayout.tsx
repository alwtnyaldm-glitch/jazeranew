// تخطيط لوحة الإدارة مع الشريط الجانبي — متجاوب مع الجوال
import { useLocation, Link } from "wouter";
import { useAdminLogout, useGetAdminMe } from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, Building2, Settings, LogOut,
  ClipboardList, Wifi, Eye, KeyRound, FileEdit, Trash2, Menu, X
} from "lucide-react";
import AdminNotificationCenter from "./AdminNotificationCenter";

const navItems = [
  { href: "/admin/dashboard", label: "لوحة التحكم", icon: <LayoutDashboard className="w-5 h-5" /> },
  { href: "/admin/applications", label: "الطلبات", icon: <ClipboardList className="w-5 h-5" /> },
  { href: "/admin/visitors", label: "الزوار", icon: <Eye className="w-5 h-5" /> },
  { href: "/admin/banks", label: "إدارة البنوك", icon: <Building2 className="w-5 h-5" /> },
  { href: "/admin/page-editor", label: "تعديل المحتوى", icon: <FileEdit className="w-5 h-5" /> },
  { href: "/admin/settings", label: "إعدادات الموقع", icon: <Settings className="w-5 h-5" /> },
  { href: "/admin/change-password", label: "تغيير كلمة السر", icon: <KeyRound className="w-5 h-5" /> },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const logout = useAdminLogout();
  const { data: admin, isError } = useGetAdminMe({ query: { retry: false } });

  // إغلاق الشريط الجانبي عند تغيير الصفحة
  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  useEffect(() => {
    if (isError) navigate("/admin");
  }, [isError]);

  const handleLogout = async () => {
    await logout.mutateAsync({});
    navigate("/admin");
  };

  return (
    <div className="min-h-screen flex" dir="rtl">

      {/* طبقة التغطية على الجوال */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* الشريط الجانبي */}
      <aside className={`
        fixed lg:static inset-y-0 right-0 z-30
        w-72 lg:w-64
        bg-sidebar text-sidebar-foreground
        flex flex-col shrink-0
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
      `}>
        {/* رأس الشريط الجانبي */}
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-black text-sm">الجزيرة للتمويل</p>
                <p className="text-xs text-sidebar-foreground/60">لوحة الإدارة</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* جرس الإشعارات */}
              <AdminNotificationCenter />
              {/* زر الإغلاق على الجوال */}
              <button
                className="lg:hidden p-2 rounded-xl hover:bg-sidebar-accent text-sidebar-foreground/60"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          {admin && (
            <div className="mt-4 flex items-center gap-2 bg-sidebar-accent rounded-lg px-3 py-2">
              <Users className="w-4 h-4 text-sidebar-accent-foreground/70" />
              <span className="text-sm text-sidebar-accent-foreground">{admin.username}</span>
            </div>
          )}
        </div>

        {/* قائمة التنقل */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href || location.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}

          {/* سلة المهملات */}
          <div className="pt-2 mt-2 border-t border-sidebar-border">
            <Link
              href="/admin/trash"
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${
                location === "/admin/trash"
                  ? "bg-red-100 text-red-700"
                  : "text-sidebar-foreground/50 hover:bg-red-50 hover:text-red-600"
              }`}
            >
              <Trash2 className="w-5 h-5" />
              سلة المهملات
            </Link>
          </div>
        </nav>

        {/* أسفل الشريط */}
        <div className="p-4 border-t border-sidebar-border space-y-2">
          <Link
            href="/"
            className="flex items-center gap-3 px-4 py-2 rounded-xl text-sidebar-foreground/60 hover:bg-sidebar-accent transition-colors text-sm"
          >
            <Wifi className="w-4 h-4" />
            الموقع الرئيسي
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-xl text-destructive hover:bg-destructive/10 transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* المحتوى الرئيسي */}
      <main className="flex-1 bg-background overflow-auto min-w-0">
        {/* شريط علوي للجوال */}
        <div className="lg:hidden sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-accent" />
            <span className="font-bold text-sm">الجزيرة للتمويل</span>
          </div>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl hover:bg-sidebar-accent"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {children}
      </main>
    </div>
  );
}
