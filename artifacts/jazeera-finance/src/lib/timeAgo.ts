import { useEffect, useState } from "react";

/**
 * تنسيق الوقت للوحة الإدارة
 * - 0-30 ثانية: "الآن"
 * - 30 ثانية: "30 ثانية"
 * - 1-59 ثانية: "1 دقيقة"
 * - 1+ دقيقة: "2 دقيقة", "3 دقيقة", ...
 * - بعد 60 دقيقة: "1 ساعة", "2 ساعة", ...
 * - بعد 24 ساعة: "1 يوم", "2 يوم", ...
 */
export function timeAgo(dateStr: string | Date): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  
  // 0-30 ثانية: الآن
  if (diff <= 30) return "الآن";
  
  // 31-59 ثانية: 30 ثانية
  if (diff <= 59) return "30 ثانية";
  
  // 60+ ثانية: دقائق
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins} دقيقة`;
  
  // ساعات
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ساعة`;
  
  // أيام
  const days = Math.floor(hours / 24);
  return `${days} يوم`;
}

export function useTimeTicker(intervalMs = 30_000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
