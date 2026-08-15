'use client';

import React, { useMemo, use, useState, useEffect } from 'react';
import { useRtdbList } from '@/hooks/use-rtdb';
import { calculateShiftStats, type BreakdownItem } from '../page';
import type { Order, Shift, Expense, SaleReturn } from '@/lib/definitions';
import {
  ArrowRight,
  Clock,
  Wallet,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Repeat,
  BadgePercent,
  Receipt,
  Hash,
  AlertTriangle,
  CheckCircle2,
  FileText,
  RotateCcw,
  Edit3,
  Lock,
  PlusCircle,
  Undo,
  Landmark,
  ArrowUpRight,
  Phone,
  Smartphone,
  Banknote,
  CreditCard,
  ShieldAlert,
  Info,
  ListFilter
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { AppLayout, AuthGuard } from '@/components/app-layout';
import { OrderDetailsDialog } from '@/components/order-details-dialog';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { useDatabase } from '@/firebase';
import { ref, update } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';
import { AddExpenseDialog } from '@/components/add-expense-dialog';
import { OrderItemsPreviewDialog } from '@/components/order-items-preview-dialog';
import { PostShiftDialog } from '@/components/post-shift-dialog';

const formatCurrency = (amount: number) => `${Math.round(amount).toLocaleString()} ج.م`;

const formatDate = (dateString?: string | Date) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('ar-EG-u-nu-latn', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const formatTimeAndDateShort = (dateString?: string | Date) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) + ' | ' + date.toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit' });
};

function BreakdownDialog({ title, items, open, onOpenChange, totalLabel, isNegative = false }: { title: string, items: BreakdownItem[], open: boolean, onOpenChange: (val: boolean) => void, totalLabel: string, isNegative?: boolean }) {
    const total = items.reduce((sum, i) => sum + i.amount, 0);
    
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg text-right" dir="rtl">
                <DialogHeader>
                    <DialogTitle className="text-right flex items-center gap-2">
                        <ListFilter className="h-5 w-5 text-primary" />
                        {title}
                    </DialogTitle>
                    <DialogDescription className="text-right">تفصيل كامل لكافة البنود التي كونت هذا المجموع.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-4 max-h-[60vh] overflow-y-auto">
                    {items.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-xl">لا توجد سجلات لهذه الفئة حالياً.</div>
                    ) : (
                        <div className="grid gap-2.5">
                            {items.map((item, idx) => (
                                <div key={`${item.id}-${idx}`} className="flex justify-between items-center p-3.5 rounded-xl bg-muted/40 border border-transparent hover:border-primary/30 transition-all shadow-sm">
                                    <div className="space-y-1">
                                        <p className="font-black text-sm">{item.label}</p>
                                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                            <span className="font-mono bg-muted px-1.5 rounded">{item.date ? new Date(item.date).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'}) : ''}</span>
                                            {item.method && <Badge variant="outline" className="text-[9px] px-1.5 h-4.5 bg-background">{item.method}</Badge>}
                                            {item.subLabel && <span className="truncate max-w-[140px] opacity-80">{item.subLabel}</span>}
                                        </div>
                                    </div>
                                    <div className="text-left">
                                        <span className={cn("font-mono font-black text-base", isNegative ? "text-destructive" : "text-green-600")}>
                                            {isNegative ? '-' : '+'}{item.amount.toLocaleString()}
                                        </span>
                                        <p className="text-[9px] text-muted-foreground">ج.م</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <Separator />
                <div className="flex justify-between items-center font-black text-xl p-3 bg-muted/20 rounded-lg">
                    <span>{totalLabel}:</span>
                    <span className={isNegative ? "text-destructive" : "text-primary"}>{formatCurrency(total)}</span>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function ShiftDetailsPageContent({ id }: { id: string }) {
  const { data: shifts, isLoading: isLoadingShifts } = useRtdbList<Shift>('shifts');
  const { data: orders, isLoading: isLoadingOrders } = useRtdbList<Order>('daily-entries');
  const { data: allExpenses, isLoading: isLoadingExpenses } = useRtdbList<Expense>('expenses');
  const { permissions, isLoading: isLoadingPermissions } = usePermissions(['shifts:reopen', 'expenses:add', 'shifts:post', 'shifts:view-details'] as const);
  const db = useDatabase();
  const { toast } = useToast();
  
  const [isReopening, setIsReopening] = useState(false);
  const [newClosingBalance, setNewClosingBalance] = useState<string>('');
  const [breakdown, setBreakdown] = useState<{ open: boolean, title: string, items: BreakdownItem[], label: string, isNegative: boolean }>({
    open: false, title: '', items: [], label: '', isNegative: false
  });
  
  const isLoading = isLoadingShifts || isLoadingOrders || isLoadingExpenses || isLoadingPermissions;

  const shift = useMemo(() => {
    if (isLoading || !shifts) return undefined;
    return shifts.find((s) => s.id === id);
  }, [shifts, id, isLoading]);

  const canSeeDetails = permissions.canShiftsViewDetails;

  const reopenStatus = useMemo(() => {
    if (!shift || !shifts || shift.isPosted) return { canResume: false, isLatest: false, hasOtherOpen: false };
    const cashierShifts = shifts
        .filter(s => s.cashier.id === shift.cashier.id)
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .reverse();
    const latestShift = cashierShifts[0];
    const isLatest = latestShift?.id === shift.id;
    const hasOtherOpen = cashierShifts.some(s => !s.endTime && s.id !== shift.id);
    return { canResume: isLatest && !hasOtherOpen, isLatest, hasOtherOpen };
  }, [shift, shifts]);

  useEffect(() => {
    if (shift?.closingBalance !== undefined) {
        setNewClosingBalance(shift.closingBalance.toString());
    }
  }, [shift]);

  const handleUpdateClosingBalance = async () => {
    if (!shift || !db || shift.isPosted) return;
    const amount = parseFloat(newClosingBalance);
    if (isNaN(amount)) {
        toast({ variant: "destructive", title: "مبلغ غير صالح" });
        return;
    }
    setIsReopening(true);
    try {
        await update(ref(db, `shifts/${shift.id}`), { closingBalance: amount, updatedAt: new Date().toISOString() });
        toast({ title: "تم تعديل مبلغ الإغلاق بنجاح" });
    } catch (error: any) {
        toast({ variant: "destructive", title: "خطأ", description: error.message });
    } finally {
        setIsReopening(false);
    }
  };

  const handleResumeShift = async () => {
    if (!shift || !db || !reopenStatus.canResume) return;
    setIsReopening(true);
    try {
        const shiftRef = ref(db, `shifts/${shift.id}`);
        await update(shiftRef, { endTime: null, closingBalance: null, reopenedAt: new Date().toISOString() });
        toast({ title: "تم فك إقفال الوردية بنجاح" });
    } catch (error: any) {
        toast({ variant: "destructive", title: "خطأ", description: error.message });
    } finally {
        setIsReopening(false);
    }
  };

  const totals = useMemo(() => {
    if (!shift) return null;
    return calculateShiftStats(shift, orders, allExpenses);
  }, [shift, orders, allExpenses]);

  const shiftTransactions = useMemo((): any[] => {
    if (!shift || !orders) return [];
    const shiftStartTime = new Date(shift.startTime);
    const shiftEndTime = shift.endTime ? new Date(shift.endTime) : new Date(8640000000000000);
    const events: any[] = [];

    orders.forEach(order => {
        const creationDate = new Date(order.createdAt || order.orderDate);
        const orderIsLinked = order.shiftId === shift.id;
        const isLegacyMatch = !order.shiftId && order.processedByUserId === shift.cashier.id && creationDate >= shiftStartTime && creationDate <= shiftEndTime;
        
        if (orderIsLinked || isLegacyMatch) {
            events.push({
                date: creationDate.toISOString(),
                category: 'order',
                description: `فاتورة ${order.transactionType === 'Sale' ? 'بيع' : 'إيجار'} (${order.customerName})${order.status === 'Cancelled' ? ' [ملغاة]' : ''}`,
                by: order.sellerName,
                orderId: order.id,
                orderCode: order.orderCode,
                orderTotal: order.total,
                orderPaid: order.paid,
                items: order.items,
                isCancelled: order.status === 'Cancelled',
                txShiftCode: order.shiftCode || (orderIsLinked ? shift.shiftCode : 'Legacy')
            });
        }

        if (order.status !== 'Cancelled' || (order.payments && Object.keys(order.payments).length > 0)) {
            if (order.discountAmount && order.discountAmount > 0) {
                const dDate = new Date(order.discountAppliedDate || order.orderDate);
                if (orderIsLinked || (!order.shiftId && order.processedByUserId === shift.cashier.id && dDate >= shiftStartTime && dDate <= shiftEndTime)) {
                    events.push({
                        date: dDate.toISOString(),
                        category: 'discount',
                        description: `خصم على الطلب ${order.orderCode}`,
                        by: order.processedByUserName || 'نظام',
                        orderId: order.id,
                        orderCode: order.orderCode,
                        discountMovement: order.discountAmount,
                        txShiftCode: order.shiftCode || (orderIsLinked ? shift.shiftCode : 'Legacy')
                    });
                }
            }
            if (order.payments) {
                Object.values(order.payments).forEach((p: any) => {
                    const pDate = new Date(p.date);
                    if (p.shiftId === shift.id || (!p.shiftId && p.userId === shift.cashier.id && pDate >= shiftStartTime && pDate <= shiftEndTime)) {
                        events.push({
                            date: p.date,
                            category: 'payment',
                            description: `دفعة مستلمة - ${order.customerName}`,
                            by: p.userName,
                            orderId: order.id,
                            orderCode: order.orderCode,
                            paymentMovement: p.amount,
                            method: p.method,
                            txShiftCode: p.shiftCode || (p.shiftId === shift.id ? shift.shiftCode : 'Legacy')
                        });
                    }
                });
            }
        }
    });

    allExpenses.forEach(expense => {
        const eDate = new Date(expense.date);
        if (expense.shiftId === shift.id || (!expense.shiftId && expense.userId === shift.cashier.id && eDate >= shiftStartTime && eDate <= shiftEndTime)) {
            if (expense.category === 'مرتجعات بيع' || expense.category === 'مرتجع بيع') return;
            events.push({
                date: expense.date,
                category: 'expense',
                description: `مصروف: ${expense.description}`,
                by: expense.userName,
                expenseMovement: expense.amount,
                method: 'Cash',
                txShiftCode: expense.shiftId === shift.id ? shift.shiftCode : 'Legacy'
            });
        }
    });

    return events.sort((a,b) => b.date.localeCompare(a.date));
  }, [shift, orders, allExpenses]);

  if (isLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  if (!shift || !totals) return <div className="p-8 text-center">الوردية غير موجودة</div>;

  const difference = (Number(shift.closingBalance) || 0) - totals.cashInDrawer;

  const openBreakdown = (title: string, items: BreakdownItem[], label: string, isNegative = false) => {
      setBreakdown({ open: true, title, items, label, isNegative });
  };

  return (
    <>
      <BreakdownDialog 
          open={breakdown.open} 
          onOpenChange={(v) => setBreakdown(prev => ({...prev, open: v}))}
          title={breakdown.title}
          items={breakdown.items}
          totalLabel={breakdown.label}
          isNegative={breakdown.isNegative}
      />
      <div className="flex flex-col gap-8">
        <PageHeader title={`الوردية رقم ${shift.shiftCode || id.slice(-6).toUpperCase()} - ${shift.cashier?.name}`} showBackButton>
            {shift.endTime && (
                <div className="flex flex-wrap gap-2">
                    {!shift.isPosted && permissions.canShiftsPost && (
                        <PostShiftDialog shift={shift} trigger={<Button className="gap-2 bg-green-600 hover:bg-green-700 font-bold"><Landmark className="h-4 w-4"/> ترحيل للخزينة</Button>} />
                    )}
                    {shift.isPosted && (
                        <Badge className="bg-green-100 text-green-800 border-green-200 h-10 px-4 text-sm flex gap-2 font-bold">
                            <CheckCircle2 className="h-4 w-4"/> تم الترحيل لـ {shift.postedToTreasuryName}
                        </Badge>
                    )}
                    {!shift.isPosted && permissions.canShiftsReopen && (
                        <>
                          <AlertDialog>
                              <AlertDialogTrigger asChild><Button variant="outline" className="gap-2 font-bold"><Edit3 className="h-4 w-4" /> تعديل مبلغ الإغلاق</Button></AlertDialogTrigger>
                              <AlertDialogContent dir="rtl" className="text-right">
                                  <AlertDialogHeader><AlertDialogTitle>تعديل مبلغ الإغلاق</AlertDialogTitle><AlertDialogDescription>تصحيح المبلغ الفعلي للدرج المسجل عند الإقفال.</AlertDialogDescription></AlertDialogHeader>
                                  <div className="py-4 space-y-2"><Label>المبلغ الفعلي الصحيح</Label><Input type="number" value={newClosingBalance} onChange={(e) => setNewClosingBalance(e.target.value)} /></div>
                                  <AlertDialogFooter className="flex-row-reverse gap-2"><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={(e) => { e.preventDefault(); handleUpdateClosingBalance(); }} disabled={isReopening}>حفظ التعديل</AlertDialogAction></AlertDialogFooter>
                              </AlertDialogContent>
                          </AlertDialog>
                          {reopenStatus.canResume && (
                              <AlertDialog>
                                  <AlertDialogTrigger asChild><Button variant="outline" className="gap-2 text-amber-600 border-amber-200 font-bold"><RotateCcw className="h-4 w-4" /> إعادة فتح</Button></AlertDialogTrigger>
                                  <AlertDialogContent dir="rtl" className="text-right">
                                      <AlertDialogHeader><AlertDialogTitle>إعادة فتح الوردية</AlertDialogTitle><AlertDialogDescription>سيتم مسح بيانات الإقفال وتصبح الوردية نشطة مرة أخرى.</AlertDialogDescription></AlertDialogHeader>
                                      <AlertDialogFooter className="flex-row-reverse gap-2"><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={(e) => { e.preventDefault(); handleResumeShift(); }} disabled={isReopening} className="bg-amber-600">تأكيد الفتح</AlertDialogAction></AlertDialogFooter>
                                  </AlertDialogContent>
                              </AlertDialog>
                          )}
                        </>
                    )}
                </div>
            )}
        </PageHeader>

        {canSeeDetails ? (
          <>
              <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-4">
                      <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary"/>الملخص المالي التفصيلي</CardTitle>
                      {!shift.isPosted && permissions.canExpensesAdd && <AddExpenseDialog targetShift={shift} trigger={<Button variant="destructive" size="sm" className="gap-1.5 font-bold"><PlusCircle className="h-4 w-4" />إضافة مصروف</Button>} />}
                  </CardHeader>
                  <CardContent className="grid lg:grid-cols-2 gap-8">
                      <div className="flex flex-col gap-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="p-3 rounded-md bg-muted/50 border border-transparent space-y-2">
                                  <button onClick={() => openBreakdown("تفاصيل المبيعات", totals.salesList, "إجمالي المبيعات")} className="flex justify-between items-center w-full text-xs font-bold hover:bg-emerald-50 text-emerald-800 p-1 rounded transition-colors">
                                      <span className="flex items-center gap-1"><ShoppingCart className="h-3 w-3" /> إجمالي المبيعات</span>
                                      <span className="font-mono font-black">{formatCurrency(totals.salesGross)}</span>
                                  </button>
                                  <button onClick={() => openBreakdown("تفاصيل الإيجارات", totals.rentalsList, "إجمالي الإيجارات")} className="flex justify-between items-center w-full text-xs font-bold hover:bg-blue-50 text-blue-800 p-1 rounded transition-colors">
                                      <span className="flex items-center gap-1"><Repeat className="h-3 w-3" /> إجمالي الإيجارات</span>
                                      <span className="font-mono font-black">{formatCurrency(totals.rentalsGross)}</span>
                                  </button>
                                  <button onClick={() => openBreakdown("تفاصيل المقبوضات", totals.paymentsList, "إجمالي المقبوضات")} className="flex justify-between items-center w-full text-xs text-amber-700 font-black border-t border-amber-100 pt-1 hover:bg-amber-50 p-1 rounded transition-colors">
                                      <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> إجمالي المحصل (مقبوضات)</span>
                                      <span className="font-mono font-black">{formatCurrency(totals.totalReceived)}</span>
                                  </button>
                                  <button onClick={() => openBreakdown("سجل الخصومات", totals.discountsList, "إجمالي الخصومات", true)} className="flex justify-between items-center w-full text-xs text-amber-600 font-bold hover:bg-amber-50/50 p-1 rounded transition-colors">
                                      <span className="flex items-center gap-1"><BadgePercent className="h-3 w-3" /> الخصومات المطبقة</span>
                                      <span className="font-mono font-black">-{formatCurrency(totals.discounts)}</span>
                                  </button>
                                  <Separator className="my-1" />
                                  <div className="flex justify-between items-center font-bold text-sm">
                                      <span>إجمالي الإيرادات (عقود)</span>
                                      <span className="font-mono font-black text-primary">{formatCurrency(totals.totalRevenue)}</span>
                                  </div>
                              </div>

                              <div className="p-3 rounded-md bg-muted/40 dark:bg-neutral-900/60 border border-primary/10 space-y-2">
                                  <p className="text-xs text-muted-foreground flex items-center gap-1 font-black mb-1 border-b pb-1 border-primary/5"><DollarSign className="h-3.5 w-3.5 text-blue-500"/> المحصل حسب الوسيلة</p>
                                  <div className="space-y-1.5 pt-1">
                                      <div className="flex justify-between items-center text-sm font-bold">
                                          <span className="flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5 text-muted-foreground" /> كاش (درج):</span> 
                                          <span className="font-mono font-black">{formatCurrency(totals.receivedCash)}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-sm font-bold text-purple-600 dark:text-purple-400">
                                          <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> فودافون كاش:</span> 
                                          <span className="font-mono font-black">{formatCurrency(totals.receivedVodafone)}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                          <span className="flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> إنستا باي:</span> 
                                          <span className="font-mono font-black">{formatCurrency(totals.receivedInstaPay)}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-sm font-bold text-sky-600 dark:text-sky-400">
                                          <span className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> فيزا:</span> 
                                          <span className="font-mono font-black">{formatCurrency(totals.receivedVisa)}</span>
                                      </div>
                                  </div>
                              </div>

                              <button onClick={() => openBreakdown("سجل المصروفات", totals.expensesList, "إجمالي المصروفات", true)} className="p-3 rounded-md bg-muted/50 hover:bg-muted/80 transition-colors text-right">
                                  <p className="text-xs text-muted-foreground flex items-center gap-1 font-bold"><TrendingDown className="h-3 w-3 text-destructive"/> إجمالي المصروفات</p>
                                  <p className="font-black text-xl font-mono text-destructive">-{totals.expenseTotal.toLocaleString()}</p>
                              </button>
                              <button onClick={() => openBreakdown("سجل المرتجعات", totals.returnsList, "إجمالي المرتجعات", true)} className="p-3 rounded-md bg-muted/50 hover:bg-muted/80 transition-colors text-right">
                                  <p className="text-xs text-muted-foreground flex items-center gap-1 font-bold"><Undo className="h-3 w-3 text-destructive"/> مرتجعات وإلغاءات</p>
                                  <p className="font-black text-xl font-mono text-destructive">-{totals.saleReturnsTotal.toLocaleString()}</p>
                              </button>
                              
                              <div className="p-4 rounded-md bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/20 sm:col-span-2 shadow-sm relative overflow-hidden group">
                                  <div className="absolute top-2 right-2 opacity-10 group-hover:opacity-100 transition-opacity"><Info className="h-5 w-5" /></div>
                                  <p className="text-xs text-green-700 dark:text-green-400 font-black">صافي النقدية المتوقع بالدرج (العهدة)</p>
                                  <p className="font-black text-3xl font-mono text-green-700 dark:text-green-500">{formatCurrency(totals.cashInDrawer)}</p>
                                  <p className="text-[10px] text-green-600/80 font-medium mt-1">المعادلة: (رصيد افتتاح + مقبوضات كاش - مصروفات ومرتجعات)</p>
                              </div>
                          </div>
                      </div>
                      <div className="flex flex-col gap-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="p-3 rounded-md bg-primary/10 border border-primary/20"><p className="text-xs text-primary font-black">رصيد الافتتاح</p><p className="font-mono font-black text-2xl">{formatCurrency(shift.openingBalance || 0)}</p></div>
                              {shift.endTime && (
                                  <>
                                      <div className="p-3 rounded-md bg-muted/50 border border-transparent"><p className="text-xs text-muted-foreground font-bold">الرصيد الفعلي عند الإغلاق</p><p className="font-mono font-black text-2xl">{formatCurrency(shift.closingBalance || 0)}</p></div>
                                      <div className={cn('p-3 rounded-md space-y-1 flex flex-col items-center justify-center border', difference !== 0 ? (difference < 0 ? 'bg-orange-500/10 text-orange-600 border-orange-200' : 'bg-green-500/10 text-green-600 border-green-200') : 'bg-muted/50 border-transparent')}><p className="text-xs font-bold">{difference < 0 ? 'العجز' : difference > 0 ? 'الزيادة' : 'الفرق'}</p><p className="font-mono font-black text-2xl">{formatCurrency(difference)}</p></div>
                                  </>
                              )}
                          </div>
                          <div className="grid gap-2 text-sm p-4 border rounded-lg bg-background shadow-sm">
                              <div className="flex justify-between items-center"><span className="text-muted-foreground font-medium">وقت الفتح</span><span className="text-xs font-mono font-bold">{formatDate(shift.startTime)}</span></div>
                              {shift.endTime && <div className="flex justify-between items-center"><span className="text-muted-foreground font-medium">وقت الإغلاق</span><span className="text-xs font-mono font-bold">{formatDate(shift.endTime)}</span></div>}
                              {shift.isPosted && <div className="flex justify-between items-center text-green-600 border-t pt-2 mt-1"><span className="font-black">حالة التوريد</span><span className="font-black">تم الترحيل لـ {shift.postedToTreasuryName}</span></div>}
                          </div>
                      </div>
                  </CardContent>
              </Card>
              
              <Card>
                  <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                          <Receipt className="h-5 w-5 text-primary"/>
                          سجل العمليات التفصيلي ({shiftTransactions.length} عملية)
                      </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 sm:p-6 overflow-x-auto">
                      <Table>
                          <TableHeader>
                              <TableRow>
                                  <TableHead className="text-right w-[180px]">التاريخ والوقت</TableHead>
                                  <TableHead className="text-center w-[120px]">الوردية</TableHead>
                                  <TableHead className="text-right">البيان</TableHead>
                                  <TableHead className="text-center">كود الطلب</TableHead>
                                  <TableHead className="text-center">أصناف الطلب</TableHead>
                                  <TableHead className="text-center">الإجمالي</TableHead>
                                  <TableHead className="text-center">المدفوع</TableHead>
                                  <TableHead className="text-center">الخصم/المصروف</TableHead>
                                  <TableHead className="text-center">المحصل</TableHead>
                                  <TableHead className="text-center">الطريقة</TableHead>
                              </TableRow>
                          </TableHeader>
                          <TableBody>
                              {shiftTransactions.map((tx, idx) => (
                                  <TableRow key={`${tx.id}-${idx}`} className={cn(tx.isCancelled && "bg-destructive/5 opacity-80")}>
                                      <TableCell className="text-right text-[10px] font-mono font-bold">
                                          {formatTimeAndDateShort(tx.date)}
                                      </TableCell>
                                      <TableCell className="text-center">
                                          <Hash className="h-3 w-3 inline ml-1 opacity-50"/>
                                          <span className="font-mono text-[10px]">{tx.txShiftCode || '-'}</span>
                                      </TableCell>
                                      <TableCell className="text-right text-sm">
                                          <span className={cn("font-medium", tx.isCancelled && "line-through text-destructive")}>{tx.description}</span>
                                      </TableCell>
                                      <TableCell className="text-center">{tx.orderId ? <OrderDetailsDialog orderId={tx.orderId}><Button variant="link" className="font-mono p-0 h-auto text-xs font-bold">{tx.orderCode}</Button></OrderDetailsDialog> : '-'}</TableCell>
                                      <TableCell className="text-center">{tx.items ? <OrderItemsPreviewDialog items={tx.items} /> : '-'}</TableCell>
                                      <TableCell className="text-center font-mono text-xs">{tx.orderTotal !== undefined ? formatCurrency(tx.orderTotal) : '-'}</TableCell>
                                      <TableCell className="text-center font-mono text-xs text-green-600 font-medium">{tx.orderPaid !== undefined ? formatCurrency(tx.orderPaid) : '-'}</TableCell>
                                      <TableCell className="text-center font-mono text-xs text-destructive font-medium">{(tx.category === 'discount' && tx.discountMovement) ? formatCurrency(tx.discountMovement) : (tx.category === 'expense' || tx.category === 'sale-return') && tx.expenseMovement ? formatCurrency(tx.expenseMovement) : '-'}</TableCell>
                                      <TableCell className="text-center font-mono text-xs text-green-600 font-black">{(tx.category === 'payment' && tx.paymentMovement) ? formatCurrency(tx.paymentMovement) : '-'}</TableCell>
                                      <TableCell className="text-center">{tx.method ? <Badge variant="outline" className="text-[10px] font-bold border-primary/20">{tx.method}</Badge> : '-'}</TableCell>
                                  </TableRow>
                              ))}
                          </TableBody>
                      </Table>
                  </CardContent>
              </Card>
          </>
        ) : (
          <Card className="border-dashed">
              <CardContent className="h-96 flex flex-col items-center justify-center gap-4 text-center">
                  <ShieldAlert className="h-16 w-16 text-muted-foreground opacity-20" />
                  <div className="space-y-1">
                      <h3 className="text-xl font-bold">التفاصيل المالية محجوبة</h3>
                      <p className="text-muted-foreground max-w-sm">
                          ليس لديك صلاحية لعرض التفاصيل المالية والحركات النقدية لهذه الوردية. 
                          الرجاء مراجعة المدير للمحاسبة.
                      </p>
                  </div>
                  <Link href="/shifts">
                      <Button variant="outline" className="gap-2">
                          <ArrowRight className="h-4 w-4" /> العودة للورديات
                      </Button>
                  </Link>
              </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

interface PageProps { params: Promise<{ id: string }>; }
export default function ShiftDetailsPage({ params }: PageProps) {
    const { id } = use(params);
    return <AppLayout><AuthGuard><ShiftDetailsPageContent id={id} /></AuthGuard></AppLayout>
}
