
"use client"

import * as React from "react"
import { format, parse } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type DatePickerDialogProps = {
  value?: Date;
  onValueChange: (date?: Date) => void;
  trigger?: React.ReactNode;
  fromDate?: Date;
  disabled?: boolean;
  className?: string;
  showTime?: boolean;
};

/**
 * مكون مطور لاختيار التاريخ يعتمد على الإدخال الأصلي للمتصفح (Native HTML5)
 * تم تحسينه ليفتح نافذة الاختيار عند الضغط في أي مكان داخل الحقل.
 */
export function DatePickerDialog({ 
  value, 
  onValueChange, 
  fromDate, 
  disabled,
  className,
  showTime = false
}: DatePickerDialogProps) {
  
  // تحويل كائن التاريخ إلى صيغة نصية يفهمها حقل الإدخال (مع مراعاة التوقيت المحلي)
  const formattedValue = React.useMemo(() => {
    if (!value || isNaN(value.getTime())) return "";
    return format(value, showTime ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd");
  }, [value, showTime]);

  const minDate = React.useMemo(() => {
    if (!fromDate || isNaN(fromDate.getTime())) return undefined;
    return format(fromDate, showTime ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd");
  }, [fromDate, showTime]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) {
      onValueChange(undefined);
      return;
    }
    
    // إصلاح هام: تحويل النص القادم من المتصفح (YYYY-MM-DD) إلى كائن تاريخ بالتوقيت المحلي
    // لتجنب مشاكل الـ Timezone التي تجعل التاريخ ينقص يوماً واحداً
    if (!showTime) {
        const [year, month, day] = val.split('-').map(Number);
        const localDate = new Date(year, month - 1, day);
        onValueChange(localDate);
    } else {
        onValueChange(new Date(val));
    }
  };

  return (
    <div className={cn("relative w-full group", className)}>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors z-10">
        <CalendarIcon className="h-4 w-4" />
      </div>
      <input
        type={showTime ? "datetime-local" : "date"}
        value={formattedValue}
        min={minDate}
        onChange={handleChange}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          "pr-10 text-right cursor-pointer relative",
          "[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0",
          disabled && "cursor-not-allowed"
        )}
      />
    </div>
  )
}
