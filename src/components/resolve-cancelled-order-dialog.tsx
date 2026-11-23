'use client';

import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Wrench, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2, 
  FileText, 
  RotateCcw,
  ShieldCheck,
  Layers
} from 'lucide-react';
import { useDatabase, useUser } from '@/firebase';
import { ref, update, get } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';
import type { Order, Expense } from '@/lib/definitions';
import { format } from 'date-fns';
import { runProductStockTransaction } from '@/lib/stock-movements';

export type UnsettledOrderCase = {
  order: Order;
  matchingExpenses: Expense[];
  totalRefunded: number;
};

type ResolveCancelledOrderDialogProps = {
  orderCase: UnsettledOrderCase;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
};

export function ResolveCancelledOrderDialog({
  orderCase,
  trigger,
  onSuccess,
}: ResolveCancelledOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [returnStock, setReturnStock] = useState(true);

  const { appUser } = useUser();
  const db = useDatabase();
  const { toast } = useToast();

  const { order, matchingExpenses, totalRefunded } = orderCase;
  const isDuplicateRefund = matchingExpenses.length > 1;

  const handleResolve = async () => {
    if (!appUser || !db || !order.id) return;

    setIsLoading(true);

    try {
      const nowISO = new Date().toISOString();
      const timestampAr = new Date().toLocaleString('ar-EG');

      // 1. تحديد مسار التاريخ الدقيق للطلب
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
        console.warn('DatePath search warning:', pathErr);
      }

      // 2. فحص وإرجاع المخزون إذا طُلب ذلك
      if (returnStock && order.items && order.items.length > 0) {
        for (const item of order.items) {
          if (!item.productId) continue;
          await runProductStockTransaction(db, item.productId, (currentProduct) => {
            const itemType = item.itemTransactionType || order.transactionType;
            const quantityBefore = currentProduct.quantityInStock || 0;
            currentProduct.quantityInStock = quantityBefore + item.quantity;

            if (itemType === 'Sale') {
              currentProduct.quantitySold = Math.max(0, (currentProduct.quantitySold || 0) - item.quantity);
            } else if (itemType === 'Rental') {
              currentProduct.quantityRented = Math.max(0, (currentProduct.quantityRented || 0) - item.quantity);
            }

            currentProduct.updatedAt = nowISO;

            return {
              date: nowISO,
              type: 'return',
              quantity: item.quantity,
              quantityBefore,
              quantityAfter: currentProduct.quantityInStock,
              notes: `تسوية وإلغاء الطلب المعلق ${order.orderCode}`,
              orderCode: order.orderCode,
              userId: appUser.id,
              userName: appUser.fullName,
            };
          });
        }
      }

      // 3. تجهيز ملاحظة التسوية الإدارية
      const duplicateNote = isDuplicateRefund
        ? ` [تنبيه: تم رصد عدد ${matchingExpenses.length} سندات مرتجع بمجموع ${totalRefunded.toLocaleString()} ج.م]`
        : '';
      const settlementNote = `\n[تسوية إدارية للإلغاء] [${timestampAr}] بواسطة ${appUser.fullName}: تم تثبيت حالة الإلغاء للفاتورة وتصفير الأرصدة بعد التحقق من صرف مرتجع الدفعة سابقاً.${duplicateNote}`;

      // 4. تحديث حالة الفاتورة رسمياً وإسقاطها من الحسابات
      const updates: Record<string, any> = {};
      updates[`daily-entries/${datePath}/orders/${order.id}/status`] = 'Cancelled';
      updates[`daily-entries/${datePath}/orders/${order.id}/cancelledAt`] = nowISO;
      updates[`daily-entries/${datePath}/orders/${order.id}/cancelledByUserId`] = appUser.id;
      updates[`daily-entries/${datePath}/orders/${order.id}/cancelledByUserName`] = appUser.fullName;
      updates[`daily-entries/${datePath}/orders/${order.id}/notes`] = (order.notes || '') + settlementNote;
      updates[`daily-entries/${datePath}/orders/${order.id}/paid`] = 0;
      updates[`daily-entries/${datePath}/orders/${order.id}/remainingAmount`] = 0;
      updates[`daily-entries/${datePath}/orders/${order.id}/updatedAt`] = nowISO;
      updates[`daily-entries/${datePath}/updatedAt`] = nowISO;

      await update(ref(db), updates);

      toast({
        title: 'تمت تسوية الفاتورة بنجاح',
        description: `تم تحويل الطلب #${order.orderCode} إلى ملغي وتصحيح المبيعات.`,
      });

      setOpen(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Settlement Error:', error);
      toast({
        variant: 'destructive',
        title: 'خطأ أثناء تنفيذ التسوية',
        description: error.message || 'حدث خطأ غير متوقع.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline" className="gap-1.5 text-primary border-primary/30 hover:bg-primary/10">
            <Wrench className="h-3.5 w-3.5" />
            حل المشكلة
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl text-right" dir="rtl">
        <DialogHeader className="text-right space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <DialogTitle className="text-lg">
              تسوية ومعالجة الفاتورة المعلقة #{order.orderCode}
            </DialogTitle>
          </div>
          <DialogDescription className="text-right text-xs">
            معالجة الخلل الناتج عن تسجيل مرتجع الدفعة مع بقاء الفاتورة نشطة في النظام.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* تنبيه الحالة */}
          <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 space-y-2">
            <div className="font-bold flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              تشخيص المشكلة في هذه الفاتورة:
            </div>
            <p className="text-xs leading-relaxed">
              تم صرف مبلغ <span className="font-bold font-mono text-[#CD5C5C]">{totalRefunded.toLocaleString()} ج.م</span> كمرتجع دفعة للعميل ({order.customerName}) ومسجل في المصروفات والورديات، ولكن الفاتورة لا تزال مسجلة بحالة <Badge variant="outline" className="font-mono bg-white">{order.status}</Badge> وتُحسب ضمن مبيعات الفرع.
            </p>
            {isDuplicateRefund && (
              <div className="mt-2 p-2 rounded bg-amber-100 border border-amber-300 text-xs font-semibold text-amber-950 flex items-center gap-2">
                <Layers className="h-4 w-4 text-amber-800 shrink-0" />
                تحذير: تم العثور على {matchingExpenses.length} سندات مرتجع مكررة بقيمة إجمالية {totalRefunded.toLocaleString()} ج.م!
              </div>
            )}
          </div>

          {/* بيانات الفاتورة */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 rounded-lg border text-xs">
            <div>
              <span className="text-muted-foreground block">العميل:</span>
              <span className="font-bold">{order.customerName}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">الفرع:</span>
              <span className="font-bold">{order.branchName || 'غير محدد'}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">إجمالي الفاتورة:</span>
              <span className="font-mono font-bold text-foreground">{(order.total || 0).toLocaleString()} ج.م</span>
            </div>
            <div>
              <span className="text-muted-foreground block">المسدد القديم بالطلب:</span>
              <span className="font-mono font-bold text-green-700">{(order.paid || 0).toLocaleString()} ج.م</span>
            </div>
          </div>

          {/* سجل سندات المرتجع المسجلة */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground">سندات المرتجع المسجلة بالمصروفات:</Label>
            <div className="space-y-1 max-h-28 overflow-y-auto border rounded p-2 bg-background">
              {matchingExpenses.map((exp, idx) => (
                <div key={exp.id || idx} className="flex justify-between items-center text-xs py-1 border-b last:border-b-0">
                  <span className="truncate max-w-[280px]">{exp.description}</span>
                  <span className="font-mono font-bold text-[#CD5C5C] shrink-0">
                    {exp.amount.toLocaleString()} ج.م
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ما سيتم تنفيذه */}
          <div className="p-3 rounded-lg border bg-blue-50/50 border-blue-200 text-blue-950 space-y-2">
            <p className="font-bold text-xs text-blue-900 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
              ما سيتم تنفيذه فور تأكيد التسوية:
            </p>
            <ul className="text-xs space-y-1 list-disc list-inside text-blue-900 leading-relaxed pr-1">
              <li>تحويل حالة الفاتورة رسمياً إلى <span className="font-bold text-destructive">"ملغي" (Cancelled)</span> لإسقاطها فوراً من مبيعات الفرع والتقارير.</li>
              <li>تصفير المبالغ المالية على الفاتورة (المدفوع: 0 ج.م، المتبقي: 0 ج.م) لمنع أي تضارب مالي.</li>
              <li>توثيق حركة تسوية تدقيقية رسمية باسمك وتاريخ اليوم داخل ملاحظات الفاتورة.</li>
            </ul>
          </div>

          {/* خيار المخزون */}
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="returnStockCheck"
              checked={returnStock}
              onCheckedChange={(c) => setReturnStock(!!c)}
            />
            <Label htmlFor="returnStockCheck" className="text-xs cursor-pointer font-medium">
              التحقق من إعادة كميات الأصناف لمخزون المنتجات (تأكيد رد القطع)
            </Label>
          </div>
        </div>

        <DialogFooter className="flex-row-reverse gap-2 sm:gap-0 pt-2 border-t">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            تراجع وإلغاء
          </Button>
          <Button
            onClick={handleResolve}
            disabled={isLoading}
            className="bg-primary gap-2"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            تأكيد تنفيذ التسوية
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
