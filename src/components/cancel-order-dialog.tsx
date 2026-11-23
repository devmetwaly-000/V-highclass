'use client';

import React, { useState, useMemo } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Trash2, AlertCircle, Loader2, Clock } from 'lucide-react';
import { useDatabase, useUser } from '@/firebase';
import { ref, update, runTransaction, push, set, get } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';
import { useRtdbList } from '@/hooks/use-rtdb';
import type { Order, Shift, Product, Expense } from '@/lib/definitions';
import { format } from 'date-fns';
import { runProductStockTransaction } from '@/lib/stock-movements';
import { Label } from './ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type CancelOrderDialogProps = {
    order: Order;
    trigger?: React.ReactNode;
    onSuccess?: () => void;
};

export function CancelOrderDialog({ order, trigger, onSuccess }: CancelOrderDialogProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [selectedShiftId, setSelectedShiftId] = useState<string>('');
    const { appUser } = useUser();
    const db = useDatabase();
    const { toast } = useToast();
    const { data: shifts } = useRtdbList<Shift>('shifts');

    // تصفية الورديات المفتوحة فقط
    const openShifts = useMemo(() => shifts.filter(s => !s.endTime), [shifts]);

    const handleCancelOrder = async () => {
        if (!appUser || !db || !order.id) return;

        if (order.status === 'Cancelled') {
            toast({
                variant: "destructive",
                title: "الطلب ملغي بالفعل",
                description: "هذا الطلب تم إلغاؤه سابقاً في النظام.",
            });
            return;
        }

        // إذا كان هناك مبالغ مدفوعة، يجب اختيار وردية
        if (order.paid > 0 && !selectedShiftId) {
            toast({
                variant: "destructive",
                title: "الرجاء اختيار وردية",
                description: "يجب اختيار الوردية المفتوحة التي سيتم رد المبلغ منها.",
            });
            return;
        }

        setIsLoading(true);

        try {
            const nowISO = new Date().toISOString();

            // التحقق الدقيق من مسار التاريخ لتفادي أخطاء الفروق الزمنية
            let datePath = order.datePath || format(new Date(order.orderDate), 'yyyy-MM-dd');
            try {
                const checkSnap = await get(ref(db, `daily-entries/${datePath}/orders/${order.id}`));
                if (!checkSnap.exists()) {
                    // البحث الشامل في daily-entries لتحديد المسار الفعلي
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
                console.warn("DatePath verification warning:", pathErr);
            }

            const targetShift = openShifts.find(s => s.id === selectedShiftId);

            // 1. Return Stock
            for (const item of (order.items || [])) {
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
                        notes: `إلغاء الطلب ${order.orderCode}`,
                        orderCode: order.orderCode,
                        userId: appUser.id,
                        userName: appUser.fullName,
                    };
                });
            }

            // 2. تحديث إحصائيات الوردية (المرتجعات)
            if (order.paid > 0 && targetShift) {
                const shiftRef = ref(db, `shifts/${targetShift.id}`);
                await runTransaction(shiftRef, (currentShift: any) => {
                    if (currentShift) {
                        currentShift.refunds = (currentShift.refunds || 0) + (order.paid || 0);
                        // نخصم من إجمالي المبيعات فقط إذا كان الطلب قد أُنشئ أصلاً في نفس الوردية
                        if (order.shiftId === targetShift.id) {
                            if (order.transactionType === 'Sale') {
                                currentShift.salesTotal = (currentShift.salesTotal || 0) - (order.total || 0);
                            } else if (order.transactionType === 'Rental') {
                                currentShift.rentalsTotal = (currentShift.rentalsTotal || 0) - (order.total || 0);
                            }
                            if (order.discountAmount) {
                                currentShift.discounts = (currentShift.discounts || 0) - order.discountAmount;
                            }
                        }
                        currentShift.updatedAt = nowISO;
                    }
                    return currentShift;
                });
            }

            // 3. كتابة سند المصروف وإلغاء الفاتورة معاً في عملية ذرية واحدة (Atomic Update)
            const timestampAr = new Date().toLocaleString('ar-EG');
            const cashierName = targetShift?.cashier?.name || '';
            const cancellationNote = `\n[إلغاء] [${timestampAr}] بواسطة ${appUser.fullName}: تم إلغاء الطلب ورد مبلغ ${order.paid.toLocaleString()} ج.م للعميل ${targetShift ? `من وردية ${cashierName}` : ''}.`;

            const updates: Record<string, any> = {};

            if (order.paid > 0 && targetShift) {
                const expenseRef = push(ref(db, 'expenses'));
                const expenseId = expenseRef.key;
                if (expenseId) {
                    const refundExpense: Omit<Expense, 'id'> = {
                        description: `إلغاء طلب ورد مبلغ: ${order.orderCode} (${order.customerName})`,
                        amount: order.paid,
                        category: 'إلغاء طلبات',
                        date: nowISO,
                        userId: appUser.id,
                        userName: appUser.fullName,
                        branchId: order.branchId || targetShift.cashier?.id || '',
                        branchName: order.branchName || 'الفرع',
                        shiftId: targetShift.id,
                        notes: `تم رد المبلغ من وردية ${cashierName}`
                    };
                    updates[`expenses/${expenseId}`] = refundExpense;
                }
            }

            updates[`daily-entries/${datePath}/orders/${order.id}/status`] = 'Cancelled';
            updates[`daily-entries/${datePath}/orders/${order.id}/cancelledAt`] = nowISO;
            updates[`daily-entries/${datePath}/orders/${order.id}/cancelledByUserId`] = appUser.id;
            updates[`daily-entries/${datePath}/orders/${order.id}/cancelledByUserName`] = appUser.fullName;
            updates[`daily-entries/${datePath}/orders/${order.id}/notes`] = (order.notes || "") + cancellationNote;
            updates[`daily-entries/${datePath}/orders/${order.id}/paid`] = 0;
            updates[`daily-entries/${datePath}/orders/${order.id}/remainingAmount`] = 0;
            updates[`daily-entries/${datePath}/orders/${order.id}/updatedAt`] = nowISO;
            updates[`daily-entries/${datePath}/updatedAt`] = nowISO;

            await update(ref(db), updates);

            toast({ title: "تم إلغاء الطلب وتحديث المخزون والوردية المختارة بنجاح" });
            onSuccess?.();
        } catch (error: any) {
            console.error("Cancel Order Error:", error);
            toast({ variant: "destructive", title: "خطأ في الإلغاء", description: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                {trigger || (
                    <Button variant="destructive" size="sm" className="gap-2">
                        <Trash2 className="h-4 w-4" />
                        إلغاء الطلب
                    </Button>
                )}
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
                <AlertDialogHeader className="text-right">
                    <AlertDialogTitle className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        تأكيد إلغاء الطلب {order.orderCode}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        هل أنت متأكد من رغبتك في إلغاء هذا الطلب؟
                        <br /><br />
                        - سيتم تغيير حالة الطلب إلى <span className="font-bold text-destructive">"ملغي"</span>.
                        <br />
                        - سيتم إرجاع كافة الأصناف للمخزون تلقائياً.
                    </AlertDialogDescription>
                </AlertDialogHeader>

                {order.paid > 0 && (
                    <div className="mt-2 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
                        <div className="font-bold mb-2">تنبيه لرد المبلغ (إجمالي المدفوع: {order.paid.toLocaleString()} ج.م):</div>
                        <Label className="text-xs mb-2 block">اختر الوردية المفتوحة لخصم مبلغ الاسترداد منها:</Label>
                        <Select value={selectedShiftId} onValueChange={setSelectedShiftId}>
                            <SelectTrigger className="h-10 bg-white">
                                <SelectValue placeholder="-- اختر وردية مفتوحة --" />
                            </SelectTrigger>
                            <SelectContent>
                                {openShifts.map(s => (
                                    <SelectItem key={s.id} value={s.id}>
                                        وردية {s.cashier.name} ({s.shiftCode || s.id.slice(-4)})
                                    </SelectItem>
                                ))}
                                {openShifts.length === 0 && <SelectItem value="none" disabled>لا توجد ورديات مفتوحة حالياً!</SelectItem>}
                            </SelectContent>
                        </Select>
                    </div>
                )}
                <AlertDialogFooter className="flex-row-reverse gap-2">
                    <AlertDialogCancel disabled={isLoading}>تراجع</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => { e.preventDefault(); handleCancelOrder(); }}
                        className="bg-destructive hover:bg-destructive/90"
                        disabled={isLoading || (order.paid > 0 && !selectedShiftId)}
                    >
                        {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                        تأكيد الإلغاء النهائي
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
