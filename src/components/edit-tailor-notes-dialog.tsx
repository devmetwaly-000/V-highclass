'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Scissors, Ruler, Loader2, Pencil, CheckCircle2, AlertCircle } from 'lucide-react';
import { useDatabase, useUser } from '@/firebase';
import { ref, update, get } from 'firebase/database';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import type { Order, OrderItem } from '@/lib/definitions';

type EditTailorNotesDialogProps = {
  order: Order;
  itemIndex: number;
  item: OrderItem;
  trigger?: React.ReactNode;
  onSuccess?: (updatedNotes: string, updatedMeasurements: string) => void;
};

export function EditTailorNotesDialog({
  order,
  itemIndex,
  item,
  trigger,
  onSuccess,
}: EditTailorNotesDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tailorNotes, setTailorNotes] = useState(item.tailorNotes || '');
  const [measurements, setMeasurements] = useState(item.measurements || '');

  const db = useDatabase();
  const { appUser } = useUser();
  const { toast } = useToast();

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setTailorNotes(item.tailorNotes || '');
      setMeasurements(item.measurements || '');
    }
    setOpen(newOpen);
  };

  const handleSave = async () => {
    if (!db || !appUser || !order.id) return;

    setIsLoading(true);

    try {
      const nowISO = new Date().toISOString();
      const timestampAr = new Date().toLocaleString('ar-EG');

      // تحديد مسار التاريخ الدقيق للطلب لتفادي أي فروق زمنية
      let datePath = order.datePath || format(new Date(order.orderDate), 'yyyy-MM-dd');
      try {
        const checkSnap = await get(ref(db, `daily-entries/${datePath}/orders/${order.id}`));
        if (!checkSnap.exists()) {
          const rootSnap = await get(ref(db, 'daily-entries'));
          if (rootSnap.exists()) {
            const allDays = rootSnap.val();
            for (const dk of Object.keys(allDays)) {
              if (allDays[dk]?.orders?.[order.id]) {
                datePath = dk;
                break;
              }
            }
          }
        }
      } catch (pathErr) {
        console.warn('DatePath verification warning:', pathErr);
      }

      const trimmedNotes = tailorNotes.trim();
      const trimmedMeasurements = measurements.trim();

      const logNote = `\n[ملاحظات الخياط] [${timestampAr}] بواسطة ${appUser.fullName}: تم تحديث ملاحظات الخياط للصنف (${item.productName}).`;

      const updates: Record<string, any> = {};
      updates[`daily-entries/${datePath}/orders/${order.id}/items/${itemIndex}/tailorNotes`] = trimmedNotes || null;
      updates[`daily-entries/${datePath}/orders/${order.id}/items/${itemIndex}/measurements`] = trimmedMeasurements || null;
      updates[`daily-entries/${datePath}/orders/${order.id}/notes`] = (order.notes || '') + logNote;
      updates[`daily-entries/${datePath}/orders/${order.id}/updatedAt`] = nowISO;
      updates[`daily-entries/${datePath}/updatedAt`] = nowISO;

      await update(ref(db), updates);

      // تحديث فوري للكائن محلياً
      if (order.items && order.items[itemIndex]) {
        order.items[itemIndex].tailorNotes = trimmedNotes || undefined;
        order.items[itemIndex].measurements = trimmedMeasurements || undefined;
      }

      toast({
        title: 'تم حفظ ملاحظات الخياط بنجاح',
        description: `تم تحديث الملاحظات للصنف: ${item.productName}`,
      });

      onSuccess?.(trimmedNotes, trimmedMeasurements);
      setOpen(false);
    } catch (error: any) {
      console.error('Error updating tailor notes:', error);
      toast({
        variant: 'destructive',
        title: 'خطأ أثناء الحفظ',
        description: error.message || 'تعذر تحديث الملاحظات في قاعدة البيانات.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs gap-1.5 border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 text-primary"
          >
            <Scissors className="h-3.5 w-3.5" />
            {item.tailorNotes ? 'تعديل ملاحظات الخياط' : 'إضافة ملاحظات خياط'}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md text-right" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Scissors className="h-5 w-5 text-primary" />
            تعديل ملاحظات الخياط والقياسات
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {item.productName} {item.productCode ? `(${item.productCode})` : ''} - فاتورة {order.orderCode}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* حقل ملاحظات الخياط والتظبيطات */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Scissors className="h-3.5 w-3.5 text-primary" />
              ملاحظات وتظبيطات الخياط:
            </Label>
            <Textarea
              value={tailorNotes}
              onChange={(e) => setTailorNotes(e.target.value)}
              placeholder="اكتب تفاصيل التعديل (تضييق، تقصير، فك، تركيب تطريز، سحاب...)"
              className="min-h-[100px] text-sm leading-relaxed resize-y"
            />
          </div>

          {/* حقل القياسات */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
              القياسات (اختياري):
            </Label>
            <Input
              value={measurements}
              onChange={(e) => setMeasurements(e.target.value)}
              placeholder="مثال: الصدر 92 سم، الوسط 72 سم، الطول 145 سم"
              className="text-sm h-9"
            />
          </div>
        </div>

        <DialogFooter className="flex-row-reverse gap-2 sm:gap-0 pt-2 border-t">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isLoading}
            className="gap-2 min-w-[120px]"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري الحفظ...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                حفظ التعديلات
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
