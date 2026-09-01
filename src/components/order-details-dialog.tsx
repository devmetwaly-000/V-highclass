
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogClose,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { useRtdbList } from '@/hooks/use-rtdb';
import type { Order, User, Customer, OrderPayment } from '@/lib/definitions';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Package,
  Calendar,
  User as UserIcon,
  Store,
  BookUser,
  FileText,
  Scissors,
  Printer,
  Pencil,
  MessageSquarePlus,
  Ruler,
  Settings,
  CheckCircle2,
  DollarSign,
  Phone,
  Trash2,
  ArrowLeftRight,
  UserCheck,
  Wrench,
  Truck,
  AlertTriangle,
  Loader2,
  CreditCard,
  FileQuestion,
  History,
  RefreshCw,
  Hash,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AddOrderNoteDialog } from './add-order-note-dialog';
import { PrintCashierReceiptDialog } from './print-cashier-receipt-dialog';
import { PrintTailorReceiptDialog } from './print-tailor-receipt-dialog';
import { NewOrderDialog } from './new-order-dialog';
import { getNextOrderCode, DEFAULT_ORDER_COUNTER_START } from '@/lib/order-counter';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { AddPaymentDialog } from './add-payment-dialog';
import { CancelOrderDialog } from './cancel-order-dialog';
import { ExchangeItemDialog } from './exchange-item-dialog';
import { EditPaymentsDialog } from './edit-payments-dialog';
import { DeletePaymentDialog } from './delete-payment-dialog';
import { useDatabase, useUser } from '@/firebase';
import { ref, update } from 'firebase/database';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type OrderDetailsDialogProps = {
  orderId: string;
  order?: Order;
  children: React.ReactNode;
};

function formatDate(dateString?: string | Date) {
    if (!dateString) return '-';
    const cleanDateString = typeof dateString === 'string' ? dateString.replace('Z', '') : dateString;
    const date = new Date(cleanDateString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('ar-EG', {
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

const getStatusBadge = (order: Order) => {
    const { status, transactionType } = order;
    switch (status) {
      case 'Completed':
        return <Badge className="bg-green-500 text-white">مكتمل</Badge>;
      case 'Delivered to Customer':
         if (transactionType === 'Sale') {
             return <Badge className="bg-green-600 text-white flex gap-1"><CheckCircle2 className="h-4 w-4"/> تم التسليم</Badge>;
         }
         return <Badge className="bg-blue-500 text-white">مؤجر</Badge>;
      case 'Pending':
          return <Badge variant="destructive">قيد التجهيز</Badge>;
      case 'Ready for Pickup':
          return <Badge className="bg-yellow-500 text-black">جاهز للتسليم</Badge>;
       case 'Returned from Tailor':
          return <Badge className="bg-purple-500 text-white">عند الخياط</Badge>;
      case 'Returned':
          return <Badge className="bg-green-100 text-green-800">تم الإرجاع</Badge>;
      case 'Cancelled':
          return <Badge variant="destructive">ملغي</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
};

function OrderDetailsContent({ order: initialOrder, orderId }: { order: Order | undefined, orderId: string }) {
    const { appUser } = useUser();
    const db = useDatabase();
    const { toast } = useToast();
    const { data: allOrders } = useRtdbList<Order>('daily-entries', { limit: 100 });
    const { data: customers } = useRtdbList<Customer>('customers');
    const { permissions } = usePermissions([
        'orders:edit',
        'orders:add-note',
        'orders:print-receipt',
        'orders:print-tailor-receipt',
        'orders:add-payment',
        'orders:delete-payment',
        'orders:cancel',
        'orders:exchange',
    ] as const);

    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [isFixingCode, setIsFixingCode] = useState(false);
    const [showFixDialog, setShowFixDialog] = useState(false);
    const [selectedGapCode, setSelectedGapCode] = useState<string>("");

    const order = useMemo(() => {
        if (initialOrder) return initialOrder;
        return allOrders.find(o => o.id === orderId);
    }, [initialOrder, allOrders, orderId]);

    const customerPhone = useMemo(() => {
        if (order?.customerPhone) return order.customerPhone;
        if (order?.customerId && customers) {
            return customers.find(c => c.id === order.customerId)?.primaryPhone;
        }
        return null;
    }, [order, customers]);

    const paymentList = useMemo(() => {
        if (!order) return [];
        
        let pList: OrderPayment[] = [];
        if (order.payments) {
            const paymentsData = order.payments;
            pList = Object.keys(paymentsData)
                .map(key => ({ ...paymentsData[key], id: key }))
                .filter(p => !!p && p.amount > 0);
        }
        
        const paymentsSum = pList.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
        const legacyDiff = Number(order.paid || 0) - paymentsSum;
        
        if (legacyDiff > 0.5) {
            pList.unshift({
                id: "legacy-initial",
                amount: legacyDiff,
                method: "رصيد سابق",
                date: (order.createdAt || order.orderDate) as string,
                userId: order.processedByUserId,
                userName: order.processedByUserName,
                shiftId: order.shiftId || ""
            });
        }
        
        return pList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [order]);

    const availableGaps = useMemo(() => {
        if (!allOrders || !order?.branchId) return [];

        const branchOrders = allOrders.filter((o) => o.branchId === order.branchId);
        const codes = branchOrders
            .map(o => parseInt(o.orderCode))
            .filter(code => !isNaN(code))
            .sort((a, b) => a - b);

        if (codes.length === 0) return [];

        const minCode = DEFAULT_ORDER_COUNTER_START;
        const maxCode = codes[codes.length - 1];
        const gaps: string[] = [];

        for (let i = minCode; i <= maxCode; i++) {
            if (!codes.includes(i)) {
                gaps.push(i.toString());
            }
        }

        return gaps;
    }, [allOrders, order?.branchId]);

    const handleUpdateStatus = async (newStatus: string, extraData: any = {}) => {
        if (!order || !db) return;
        setIsUpdatingStatus(true);
        try {
            const datePath = order.datePath || format(new Date(order.orderDate), 'yyyy-MM-dd');
            const nowISO = new Date().toISOString();
            
            const updates: any = {};
            updates[`daily-entries/${datePath}/orders/${order.id}/status`] = newStatus;
            updates[`daily-entries/${datePath}/orders/${order.id}/updatedAt`] = nowISO;
            updates[`daily-entries/${datePath}/updatedAt`] = nowISO;

            Object.keys(extraData).forEach(key => {
                updates[`daily-entries/${datePath}/orders/${order.id}/${key}`] = extraData[key];
            });

            await update(ref(db), updates);
            toast({ title: "تم تحديث الحالة بنجاح" });
        } catch (e: any) {
            toast({ variant: 'destructive', title: "خطأ في التحديث", description: e.message });
        } finally {
            setIsUpdatingStatus(false);
        }
    };

    const handleApplyFixedCode = async () => {
        if (!order || !db || !appUser || !selectedGapCode) return;
        setIsFixingCode(true);
        try {
            const datePath = order.datePath || format(new Date(order.orderDate), 'yyyy-MM-dd');
            const orderRef = ref(db, `daily-entries/${datePath}/orders/${order.id}`);
            
            const logNote = `\n[إصلاح كود يدوي] [${new Date().toLocaleString('ar-EG')}] بواسطة ${appUser.fullName}: تم اختيار الرقم (${selectedGapCode}) من الثغرات المتاحة لسد فجوة التسلسل.`;

            await update(orderRef, {
                orderCode: selectedGapCode,
                notes: (order.notes || "") + logNote,
                updatedAt: new Date().toISOString()
            });

            toast({ title: "تم تخصيص الكود بنجاح", description: `رقم الفاتورة الجديد: ${selectedGapCode}` });
            setShowFixDialog(false);
        } catch (e: any) {
            toast({ variant: "destructive", title: "خطأ في التحديث", description: e.message });
        } finally {
            setIsFixingCode(false);
        }
    };

    const handleTakeNextSequential = async () => {
        if (!order || !db || !appUser || !order.branchId) return;
        setIsFixingCode(true);
        try {
            const branchOrders = allOrders.filter((o) => o.branchId === order.branchId);
            const newCode = await getNextOrderCode(db, order.branchId, branchOrders);
            const datePath = order.datePath || format(new Date(order.orderDate), 'yyyy-MM-dd');
            const orderRef = ref(db, `daily-entries/${datePath}/orders/${order.id}`);
            
            const logNote = `\n[إصلاح كود تلقائي] [${new Date().toLocaleString('ar-EG')}] بواسطة ${appUser.fullName}: تم توليد رقم فاتورة جديد (${newCode}).`;

            await update(orderRef, {
                orderCode: newCode,
                notes: (order.notes || "") + logNote,
                updatedAt: new Date().toISOString()
            });

            toast({ title: "تم توليد الكود بنجاح", description: `الرقم الجديد: ${newCode}` });
            setShowFixDialog(false);
        } catch (e: any) {
            toast({ variant: "destructive", title: "خطأ في التحديث", description: e.message });
        } finally {
            setIsFixingCode(false);
        }
    };

  if (!order) {
      return (
          <div className="flex flex-col items-center justify-center p-12 text-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
              <div className="space-y-1">
                <h3 className="text-xl font-bold">جاري تحميل تفاصيل الطلب...</h3>
              </div>
          </div>
      )
  }
  
  const transactionBaseGross = (order.total || 0) + (order.discountAmount || 0);
  const isMissingCode = !order.orderCode;

  const summaryRowClass = "flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between";

  return (
    <div className="min-w-0" dir="rtl">
        <Dialog open={showFixDialog} onOpenChange={setShowFixDialog}>
            <DialogContent className="sm:max-w-md text-right" dir="rtl">
                <DialogHeader>
                    <DialogTitle className="text-right flex items-center gap-2">
                        <Hash className="h-5 w-5 text-primary" />
                        إصلاح رقم الطلب المفقود
                    </DialogTitle>
                    <DialogDescription className="text-right">
                        لقد تم اكتشاف وجود ثغرات في تسلسل الأرقام. يمكنك اختيار رقم من القائمة التالية لسد الثغرة ووضع الفاتورة في مكانها الصحيح.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-6 space-y-6">
                    {availableGaps.length > 0 ? (
                        <div className="space-y-4">
                            <Label className="font-bold">اختر رقماً من الثغرات المتاحة:</Label>
                            <Select value={selectedGapCode} onValueChange={setSelectedGapCode}>
                                <SelectTrigger className="h-12 text-lg font-mono">
                                    <SelectValue placeholder="-- اختر رقماً --" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableGaps.map(gap => (
                                        <SelectItem key={gap} value={gap} className="font-mono text-lg">{gap}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button className="w-full h-11 font-bold gap-2" onClick={handleApplyFixedCode} disabled={!selectedGapCode || isFixingCode}>
                                {isFixingCode ? <Loader2 className="h-4 w-4 animate-spin ml-2"/> : <CheckCircle2 className="h-4 w-4"/>}
                                تخصيص الرقم المختار للطلب
                            </Button>
                        </div>
                    ) : (
                        <div className="p-4 rounded-lg bg-muted text-center space-y-4">
                            <p className="text-sm font-medium">لا توجد ثغرات حالياً في التسلسل (التسلسل مكتمل).</p>
                            <p className="text-xs text-muted-foreground">يمكنك استخراج الرقم التسلسلي التالي المتاح في النظام.</p>
                        </div>
                    )}
                    
                    <Separator />
                    
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">خيار بديل:</Label>
                        <Button variant="outline" className="w-full gap-2 text-xs" onClick={handleTakeNextSequential} disabled={isFixingCode}>
                            <RefreshCw className="h-3 w-3" />
                            استخراج الرقم التالي من العداد (تلقائي)
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <div className="flex flex-col-reverse gap-4 sm:gap-6 xl:grid xl:grid-cols-3 xl:items-start px-3 sm:px-6 pb-4 pt-2">
            <div className="xl:col-span-2 flex flex-col gap-4 sm:gap-6 min-w-0">
                {isMissingCode && (
                    <Alert variant="destructive" className="bg-destructive/5 border-destructive/20">
                        <AlertTriangle className="h-5 w-5" />
                        <AlertTitle className="font-bold">تنبيه: كود الطلب مفقود!</AlertTitle>
                        <AlertDescription className="flex flex-col gap-3 mt-2">
                            <p>يفتقد هذا الطلب لرقم الفاتورة التسلسلي في قاعدة البيانات. يمكنك اختيار رقم من الثغرات المتاحة في النظام لسد فجوة التسلسل.</p>
                            <Button 
                                variant="destructive" 
                                size="sm" 
                                className="w-fit gap-2 font-bold" 
                                onClick={() => setShowFixDialog(true)}
                                disabled={isFixingCode}
                            >
                                {isFixingCode ? <Loader2 className="h-4 w-4 animate-spin ml-2"/> : <Hash className="h-4 w-4" />}
                                عرض قائمة الأرقام المتاحة للإصلاح
                            </Button>
                        </AlertDescription>
                    </Alert>
                )}

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                            <Package className="h-5 w-5 text-primary shrink-0"/>
                            أصناف الطلب
                            <Badge variant="secondary" className="mr-auto text-xs">{order.items.length}</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-6 pt-0">
                        {/* Mobile: card layout */}
                        <div className="md:hidden space-y-3">
                            {order.items.map((item, index) => {
                                const basePrice = item.priceAtTimeOfOrder + (item.itemDiscount || 0);
                                const lineTotal = item.priceAtTimeOfOrder * item.quantity;
                                return (
                                    <div key={index} className="rounded-lg border bg-card p-3 space-y-2">
                                        <p className="font-medium text-sm leading-snug">{item.productName}</p>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
                                                <p className="text-muted-foreground">الكمية</p>
                                                <p className="font-bold">{item.quantity}</p>
                                            </div>
                                            <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
                                                <p className="text-muted-foreground">الصافي</p>
                                                <p className="font-mono font-bold">{lineTotal.toLocaleString()} ج.م</p>
                                            </div>
                                            <div className="rounded-md bg-muted/30 px-2 py-1.5 text-center">
                                                <p className="text-muted-foreground">السعر</p>
                                                <p className="font-mono">{basePrice.toLocaleString()}</p>
                                            </div>
                                            <div className="rounded-md bg-muted/30 px-2 py-1.5 text-center">
                                                <p className="text-muted-foreground">الخصم</p>
                                                <p className="font-mono text-green-600">{(item.itemDiscount || 0).toLocaleString()}</p>
                                            </div>
                                        </div>
                                        {(item.tailorNotes || item.measurements) && (
                                            <div className="pt-2 border-t space-y-2 text-sm">
                                                {item.measurements && (
                                                    <div className="flex items-start gap-2">
                                                        <Ruler className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-semibold text-muted-foreground">القياسات</p>
                                                            <p className="text-sm break-words">{item.measurements}</p>
                                                        </div>
                                                    </div>
                                                )}
                                                {item.tailorNotes && (
                                                    <div className="flex items-start gap-2">
                                                        <Scissors className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-semibold text-muted-foreground">ملاحظات الخياط</p>
                                                            <p className="text-sm break-words">{item.tailorNotes}</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Desktop: table layout */}
                        <div className="hidden md:block overflow-x-auto -mx-1">
                         <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-right w-[40%]">المنتج</TableHead>
                                    <TableHead className="text-center">الكمية</TableHead>
                                    <TableHead className="text-center">سعر المعاملة</TableHead>
                                    <TableHead className="text-center">الخصم</TableHead>
                                    <TableHead className="text-center">الصافي</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {order.items.map((item, index) => {
                                    const basePrice = item.priceAtTimeOfOrder + (item.itemDiscount || 0);
                                    return (
                                        <React.Fragment key={index}>
                                            <TableRow>
                                                <TableCell className="font-medium text-right">{item.productName}</TableCell>
                                                <TableCell className="text-center">{item.quantity}</TableCell>
                                                <TableCell className="text-center font-mono text-muted-foreground">{basePrice.toLocaleString()} ج.م</TableCell>
                                                <TableCell className="text-center font-mono text-green-600">{(item.itemDiscount || 0).toLocaleString()} ج.م</TableCell>
                                                <TableCell className="text-center font-mono font-bold">{(item.priceAtTimeOfOrder * item.quantity).toLocaleString()} ج.م</TableCell>
                                            </TableRow>
                                            {(item.tailorNotes || item.measurements) && (
                                                <TableRow className="bg-muted/50">
                                                    <TableCell colSpan={5} className="py-2 px-4">
                                                        {item.measurements &&
                                                            <div className="flex items-start gap-2 mb-2">
                                                                <Ruler className="h-4 w-4 mt-1 text-muted-foreground" />
                                                                <div className="flex-1">
                                                                    <p className="text-xs font-semibold text-muted-foreground">القياسات</p>
                                                                    <p className="text-sm">{item.measurements}</p>
                                                                </div>
                                                            </div>
                                                        }
                                                        {item.tailorNotes &&
                                                            <div className="flex items-start gap-2">
                                                                <Scissors className="h-4 w-4 mt-1 text-muted-foreground" />
                                                                <div className="flex-1">
                                                                    <p className="text-xs font-semibold text-muted-foreground">ملاحظات الخياط</p>
                                                                    <p className="text-sm">{item.tailorNotes}</p>
                                                                </div>
                                                            </div>
                                                        }
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </React.Fragment>
                                    )
                                })}
                            </TableBody>
                        </Table>
                        </div>
                    </CardContent>
                </Card>

                {paymentList.length > 0 && (
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                                <History className="h-5 w-5 text-primary shrink-0"/>
                                سجل المقبوضات
                                <Badge variant="secondary" className="mr-auto text-xs">{paymentList.length}</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 sm:p-6 pt-0">
                            {/* Mobile: payment cards */}
                            <div className="md:hidden space-y-2">
                                {paymentList.map((p) => (
                                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[10px] font-mono text-muted-foreground">{formatDate(p.date)}</p>
                                            <p className="text-xs mt-0.5">{p.userName}</p>
                                            <Badge variant="outline" className="text-[10px] mt-1">{p.method}</Badge>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="font-bold font-mono text-green-600 text-sm">+{p.amount.toLocaleString()}</span>
                                            {permissions.canOrdersDeletePayment && p.id !== "legacy-initial" && (
                                                <DeletePaymentDialog order={order} payment={p} />
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Desktop: payments table */}
                            <div className="hidden md:block overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-right">التاريخ والوقت</TableHead>
                                        <TableHead className="text-center">الطريقة</TableHead>
                                        <TableHead className="text-center">بواسطة</TableHead>
                                        <TableHead className="text-center">المبلغ</TableHead>
                                        <TableHead className="text-center">إجراءات</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paymentList.map((p) => (
                                        <TableRow key={p.id}>
                                            <TableCell className="text-[10px] font-mono whitespace-nowrap">{formatDate(p.date)}</TableCell>
                                            <TableCell className="text-center"><Badge variant="outline" className="text-[10px]">{p.method}</Badge></TableCell>
                                            <TableCell className="text-center text-[10px]">{p.userName}</TableCell>
                                            <TableCell className="text-center font-bold font-mono text-green-600">+{p.amount.toLocaleString()} ج.م</TableCell>
                                            <TableCell className="text-center">
                                                {permissions.canOrdersDeletePayment && p.id !== "legacy-initial" && (
                                                    <DeletePaymentDialog order={order} payment={p} />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {order.notes && (
                     <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5 text-primary"/>
                                ملاحظات الطلب
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                           <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
                        </CardContent>
                    </Card>
                )}
            </div>
            <div className="xl:col-span-1 flex flex-col gap-4 sm:gap-6 min-w-0">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base sm:text-lg">ملخص الطلب</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:gap-4 text-sm">
                        <div className={summaryRowClass}>
                            <span className="text-muted-foreground">الحالة</span>
                            <div className="sm:text-left">{getStatusBadge(order)}</div>
                        </div>
                        <Separator/>
                         <div className={summaryRowClass}>
                            <span className="text-muted-foreground flex items-center gap-1.5 shrink-0"><Calendar className="h-4 w-4"/> تاريخ الطلب</span>
                            <span className="text-[10px] sm:text-xs font-mono font-bold break-all sm:text-left">{formatDate(order.orderDate)}</span>
                        </div>
                         {order.deliveryDate && (
                             <div className={summaryRowClass}>
                                <span className="text-muted-foreground flex items-center gap-1.5 shrink-0"><Calendar className="h-4 w-4"/> تاريخ التسليم</span>
                                <span className="text-[10px] sm:text-xs font-mono font-bold break-all sm:text-left">{formatDate(order.deliveryDate)}</span>
                            </div>
                         )}
                        <Separator/>
                         <div className={summaryRowClass}>
                            <span className="text-muted-foreground flex items-center gap-1.5 shrink-0"><UserIcon className="h-4 w-4"/> العميل</span>
                            <div className="sm:text-left min-w-0">
                                <p className="font-bold truncate">{order.customerName}</p>
                                {customerPhone && <p dir="ltr" className="text-xs font-mono">{customerPhone}</p>}
                            </div>
                        </div>
                         <div className={summaryRowClass}>
                            <span className="text-muted-foreground flex items-center gap-1.5 shrink-0"><BookUser className="h-4 w-4"/> البائع</span>
                            <span className="sm:text-left truncate">{order.sellerName}</span>
                        </div>
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                           <FileText className="h-5 w-5 text-primary shrink-0"/>
                            الملخص المالي
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-2 sm:gap-3 text-sm">
                        <div className={cn(summaryRowClass, "font-medium")}>
                            <span>إجمالي سعر المعاملة</span>
                            <span className="font-mono sm:text-left">{transactionBaseGross.toLocaleString()} ج.م</span>
                        </div>
                        <div className={cn(summaryRowClass, "font-medium text-green-600")}>
                            <span>الخصم الممنوح</span>
                            <span className="font-mono sm:text-left">-{(order.discountAmount || 0).toLocaleString()} ج.م</span>
                        </div>
                         <Separator/>
                         <div className={cn(summaryRowClass, "font-bold text-base text-primary")}>
                            <span>الصافي النهائي</span>
                            <span className="font-mono sm:text-left">{(order.total || 0).toLocaleString()} ج.م</span>
                        </div>
                         <div className={summaryRowClass}>
                            <span>المسدد</span>
                            <span className="font-mono sm:text-left">{(order.paid || 0).toLocaleString()} ج.م</span>
                        </div>
                         <div className={cn(summaryRowClass, "font-bold text-base sm:text-lg p-2 sm:p-3 rounded-md", order.remainingAmount > 0 ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-600')}>
                            <span>المتبقي</span>
                            <span className="font-mono sm:text-left">{(order.remainingAmount || 0).toLocaleString()} ج.م</span>
                        </div>
                        {order.status !== 'Cancelled' && (
                            <div className="pt-2">
                                <EditPaymentsDialog order={order} trigger={<Button variant="ghost" size="sm" className="w-full text-[10px] text-muted-foreground gap-1"><CreditCard className="h-3 w-3"/>تعديل طريقة دفع الفاتورة</Button>} />
                            </div>
                        )}
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader className="pb-3">
                         <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                           <Settings className="h-5 w-5 text-primary shrink-0"/>
                            الإجراءات
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2">
                        {order.status !== 'Cancelled' && (
                            <div className="space-y-2 mb-1 p-3 bg-muted/30 rounded-lg border border-dashed text-right col-span-full">
                                <p className="text-[10px] text-muted-foreground mb-2 font-bold">تغيير الحالة:</p>
                                {order.status === 'Pending' && (
                                    <Button variant="outline" className="w-full justify-start gap-2 text-primary" onClick={() => handleUpdateStatus('Ready for Pickup')} disabled={isUpdatingStatus}>
                                        <Wrench className="h-4 w-4" /> تجهيز الطلب
                                    </Button>
                                )}
                                {(order.status === 'Ready for Pickup' || order.status === 'Returned from Tailor') && (
                                    <div className="flex flex-col gap-2">
                                        <Button variant="default" className="w-full justify-start gap-2 bg-green-600 hover:bg-green-700" onClick={() => handleUpdateStatus('Delivered to Customer')} disabled={isUpdatingStatus || order.remainingAmount > 0}>
                                            <Truck className="h-4 w-4" /> تسليم للعميل
                                        </Button>
                                        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive" onClick={() => handleUpdateStatus('Pending')} disabled={isUpdatingStatus}>
                                            <RotateCcw className="h-4 w-4" /> تراجع لـ قيد التجهيز
                                        </Button>
                                    </div>
                                )}
                                {order.status === 'Delivered to Customer' && order.transactionType === 'Rental' && (
                                     <Button variant="outline" className="w-full justify-start gap-2 text-green-600" onClick={() => handleUpdateStatus('Returned')} disabled={isUpdatingStatus}>
                                        <CheckCircle2 className="h-4 w-4" /> تم الإرجاع
                                    </Button>
                                )}
                            </div>
                        )}

                        <Separator className="my-1 col-span-full" />

                        {order.remainingAmount > 0 && permissions.canOrdersAddPayment && order.status !== 'Cancelled' && (
                            <AddPaymentDialog order={order} trigger={<Button variant="default" className="w-full justify-start gap-2 bg-blue-600 col-span-full sm:col-span-2 xl:col-span-1"><DollarSign className="h-4 w-4 shrink-0" /> تحصيل دفعة</Button>} />
                        )}
                        
                        {order.status !== 'Cancelled' && permissions.canOrdersAddNote && (
                            <AddOrderNoteDialog order={order} trigger={<Button variant="outline" className="w-full justify-start gap-2"><MessageSquarePlus className="h-4 w-4 shrink-0" /> إضافة ملاحظة</Button>} />
                        )}

                        {permissions.canOrdersPrintReceipt && (
                            <PrintCashierReceiptDialog order={order} trigger={<Button className="w-full justify-start gap-2" variant="outline"><Printer className="h-4 w-4 shrink-0" /> طباعة الإيصال</Button>} />
                        )}
                        {order.status !== 'Cancelled' && permissions.canOrdersExchange && (
                            <ExchangeItemDialog order={order} trigger={<Button variant="outline" className="w-full justify-start gap-2"><ArrowLeftRight className="h-4 w-4 shrink-0" /> تبديل صنف</Button>}/>
                        )}
                        {order.status !== 'Cancelled' && permissions.canOrdersEdit && (
                            <NewOrderDialog order={order} trigger={<Button variant="outline" className="w-full justify-start gap-2"><Pencil className="h-4 w-4 shrink-0" /> تعديل الطلب</Button>}/>
                        )}
                        {order.status !== 'Cancelled' && order.status !== 'Returned' && permissions.canOrdersCancel && (
                            <CancelOrderDialog order={order} trigger={<Button variant="ghost" className="w-full justify-start gap-2 text-destructive col-span-full sm:col-span-2 xl:col-span-1"><Trash2 className="h-4 w-4 shrink-0" /> إلغاء الطلب</Button>} />
                        )}
                    </CardContent>
                 </Card>
            </div>
          </div>
    </div>
  );
}


export function OrderDetailsDialog({ orderId, order, children }: OrderDetailsDialogProps) {
  const [open, setOpen] = React.useState(false);

  useEffect(() => {
    if (!open) {
      const cleanup = () => {
        document.body.style.pointerEvents = 'auto';
        document.body.style.overflow = '';
        document.body.classList.remove('pointer-events-none');
      };
      const t1 = setTimeout(cleanup, 50);
      const t2 = setTimeout(cleanup, 300);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className={cn(
          "flex flex-col gap-0 p-0 overflow-hidden",
          "w-[100vw] max-w-[100vw] h-[100dvh] max-h-[100dvh] rounded-none border-0",
          "sm:w-[min(96vw,56rem)] sm:max-w-5xl sm:h-[min(92dvh,900px)] sm:max-h-[92dvh] sm:rounded-lg sm:border",
          "lg:max-w-6xl"
        )}
        dir="rtl"
      >
        <DialogHeader className="shrink-0 px-4 py-3 sm:px-6 sm:py-4 border-b text-right space-y-2">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <DialogTitle className="text-base sm:text-lg leading-snug">
              تفاصيل الطلب
              {order?.orderCode && (
                <span className="font-mono text-primary mr-1">#{order.orderCode}</span>
              )}
            </DialogTitle>
            {order && getStatusBadge(order)}
          </div>
          {order && (
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {order.customerName} · {order.branchName}
            </p>
          )}
          <DialogDescription className="sr-only">عرض تفاصيل الطلب.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {open && <OrderDetailsContent order={order} orderId={orderId} />}
        </div>

        <DialogFooter className="shrink-0 p-3 sm:p-4 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <DialogClose asChild>
              <Button variant="outline" className="w-full sm:w-auto min-h-10">إغلاق</Button>
            </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
