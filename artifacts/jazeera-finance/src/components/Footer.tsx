// تذييل الصفحة - يدعم التخصيص من لوحة الإدارة
import { Building2 } from "lucide-react";
import type { SiteSettings } from "@workspace/api-client-react";
import { usePageContent } from "@/hooks/usePageContent";

interface FooterProps {
  settings?: SiteSettings | null;
}

export default function Footer({ settings }: FooterProps) {
  const footer = usePageContent("footer");
  const colors = usePageContent("site_colors");

  const footerBg = colors.primary_color || "#1e3a5f";
  const accentColor = colors.accent_color || "#c8a84b";

  return (
    <footer style={{ backgroundColor: footerBg }} className="text-white py-12" dir="rtl">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: accentColor }}>
                <Building2 className="w-6 h-6" style={{ color: footerBg }} />
              </div>
              <span className="font-black text-lg">{footer.company_name || "الجزيرة للتمويل"}</span>
            </div>
            <p className="text-white/60 text-sm leading-relaxed">
              {footer.company_desc || "شركة الجزيرة للتمويل والحلول المالية — شريكك الموثوق في تحقيق أهدافك المالية"}
            </p>
          </div>
          <div>
            <h4 className="font-bold mb-4" style={{ color: accentColor }}>{footer.quick_links_title || "روابط سريعة"}</h4>
            <ul className="space-y-2">
              <li><a href="/" className="text-white/60 hover:text-white text-sm transition-colors">الرئيسية</a></li>
              <li><a href="/apply" className="text-white/60 hover:text-white text-sm transition-colors">قدّم طلبك</a></li>
              <li><a href="/#services" className="text-white/60 hover:text-white text-sm transition-colors">خدماتنا</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4" style={{ color: accentColor }}>{footer.contact_title || "معلومات التواصل"}</h4>
            <ul className="space-y-2 text-white/60 text-sm">
              <li>{settings?.contactPhone || "920000000"}</li>
              <li>{settings?.contactEmail || "info@aljazeera-finance.com"}</li>
              <li>{settings?.contactAddress || "الدوحة،   "}</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/20 pt-6 text-center text-white/40 text-sm">
          © {new Date().getFullYear()} {footer.copyright || "الجزيرة للتمويل والحلول المالية. جميع الحقوق محفوظة."}
        </div>
      </div>
    </footer>
  );
}
