import { useEffect, useState, useRef } from "react";

/**
 * تنسيق الوقت للوحة الإدارة - عداد تصاعدي
 * - 1-4 ثواني: "1 ثانية", "2 ثانية", "3 ثانية", "4 ثواني"
 * - 5-59 ثانية: "5 ثواني", "10 ثواني", "30 ثانية", "45 ثانية"
 * - 1-59 دقيقة: "1 دقيقة", "2 دقيقة", ... "59 دقيقة"
 * - 1-23 ساعة: "1 ساعة", "2 ساعة", ... "23 ساعة"
 * - 1-10+ أيام: "1 يوم", "2 يوم", ... "10+ أيام"
 */
export function timeAgo(dateStr: string | Date): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);

  // 1-4 ثواني: ثواني فردية
  if (diff <= 4) return `${diff} ثانية`;
  
  // 5-9 ثواني: كل ثانية
  if (diff < 10) return `${diff} ثواني`;
  
  // 10-29 ثانية: كل 5 ثواني
  if (diff <= 29) return `${Math.floor(diff / 5) * 5} ثانية`;
  
  // 30-59 ثانية: كل 15 ثانية
  if (diff <= 59) return `${Math.floor(diff / 15) * 15} ثانية`;

  // 1-59 دقيقة: كل دقيقة
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins} دقيقة`;

  // 1-23 ساعة: كل ساعة
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ساعة`;

  // 1-10+ أيام
  const days = Math.floor(hours / 24);
  if (days <= 10) return `${days} يوم`;
  return "10+ أيام";
}

/**
 * مكون عداد الوقت التصاعدي - يتحدث كل ثانية
 * يعرض الوقت منذ الإدخال من 1 ثانية حتى 10+ أيام
 */
export function TimeCounter({ dateStr }: { dateStr: string | Date }) {
  const [time, setTime] = useState(() => timeAgo(dateStr));
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    // تحديث كل ثانية للعداد التصاعدي
    intervalRef.current = setInterval(() => {
      setTime(timeAgo(dateStr));
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [dateStr]);

  return <span>{time}</span>;
}

export function useTimeTicker(intervalMs = 30_000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
