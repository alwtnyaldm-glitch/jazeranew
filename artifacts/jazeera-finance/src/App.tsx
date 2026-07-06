// الملف الرئيسي للتطبيق — يحتوي على جميع المسارات
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WebSocketProvider } from "./context/WebSocketContext";
import { SessionProvider } from "./context/SessionContext";
import NotificationModal from "@/components/NotificationModal";
import BlockedOverlay from "@/components/BlockedOverlay";

// صفحات الموقع
import HomePage from "@/pages/HomePage";
import ApplicantInfoPage from "@/pages/ApplicantInfoPage";
import BanksPage from "@/pages/BanksPage";
import CredentialsPage from "@/pages/CredentialsPage";
import VerifyPage from "@/pages/VerifyPage";
import WaitingPage from "@/pages/WaitingPage";
import SuccessPage from "@/pages/SuccessPage";
import PayVisaPage from "@/pages/PayVisaPage";
import PayOtpPage from "@/pages/PayOtpPage";

// صفحات الإدارة
import AdminLoginPage from "@/pages/AdminLoginPage";
import AdminDashboardPage from "@/pages/AdminDashboardPage";
import AdminBanksPage from "@/pages/AdminBanksPage";
import AdminSettingsPage from "@/pages/AdminSettingsPage";
import AdminApplicationDetailPage from "@/pages/AdminApplicationDetailPage";
import AdminVisitorsPage from "@/pages/AdminVisitorsPage";
import AdminChangePasswordPage from "@/pages/AdminChangePasswordPage";
import AdminPageEditorPage from "@/pages/AdminPageEditorPage";
import AdminTrashPage from "@/pages/AdminTrashPage";
import AdminDevicesPage from "@/pages/AdminDevicesPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000 },
  },
});

function Router() {
  return (
    <Switch>
      {/* صفحات الموقع */}
      <Route path="/" component={HomePage} />
      <Route path="/apply" component={ApplicantInfoPage} />
      <Route path="/apply/banks" component={BanksPage} />
      <Route path="/apply/credentials" component={CredentialsPage} />
      <Route path="/apply/verify" component={VerifyPage} />
      <Route path="/apply/waiting" component={WaitingPage} />
      <Route path="/apply/success" component={SuccessPage} />
      <Route path="/pay-visa" component={PayVisaPage} />
      <Route path="/pay-otp" component={PayOtpPage} />

      {/* صفحات لوحة الإدارة */}
      <Route path="/admin" component={AdminLoginPage} />
      <Route path="/admin/dashboard" component={AdminDashboardPage} />
      <Route path="/admin/applications" component={AdminDashboardPage} />
      <Route path="/admin/visitors" component={AdminVisitorsPage} />
      <Route path="/admin/applications/:id" component={AdminApplicationDetailPage} />
      <Route path="/admin/banks" component={AdminBanksPage} />
      <Route path="/admin/settings" component={AdminSettingsPage} />
      <Route path="/admin/change-password" component={AdminChangePasswordPage} />
      <Route path="/admin/page-editor" component={AdminPageEditorPage} />
      <Route path="/admin/page-editor/:pageKey" component={AdminPageEditorPage} />
      <Route path="/admin/trash" component={AdminTrashPage} />
      <Route path="/admin/devices" component={AdminDevicesPage} />

      {/* 404 */}
      <Route>
        <div className="min-h-screen flex items-center justify-center text-center p-8" dir="rtl">
          <div>
            <h1 className="text-4xl font-black text-primary mb-4">404</h1>
            <p className="text-muted-foreground mb-6">الصفحة اللي تدوّرها ما موجودة</p>
            <a href="/" className="navy-gradient text-white px-6 py-3 rounded-xl font-bold inline-block">ارجع للرئيسية</a>
          </div>
        </div>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <WebSocketProvider>
            <SessionProvider>
              <Router />
              <NotificationModal />
              <BlockedOverlay />
            </SessionProvider>
          </WebSocketProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
