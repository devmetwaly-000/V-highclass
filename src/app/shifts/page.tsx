'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
    PlusCircle, 
    Clock, 
    Archive, 
    DollarSign, 
    Wallet, 
    LogOut, 
    Trash2, 
    Loader2, 
    Landmark, 
    ArrowUpRight, 
    Phone, 
    Smartphone, 
    Banknote, 
    ShoppingCart, 
    Repeat, 
    BadgePercent, 
    Undo, 
    Hash,
    CreditCard,
    Eye,
    TrendingDown,
    Lock,
    Info,
    ListFilter,
    ChevronLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
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
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EndShiftDialog } from '@/components/end-shift-dialog';
import type { Shift, Order, Expense } from '@/lib/definitions';
import { useRtdbList } from '@/hooks/use-rtdb';
import { Skeleton } from '@/components/ui/skeleton';
import { StartShiftDialog } from '@/components/start-shift-dialog';
import { useUser, useDatabase } from '@/firebase';
import { AuthLayout, AuthGuard } from '@/components/app-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { cn } from '@/lib/utils';
import { ref, remove } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';
import { PostShiftDialog } from '@/components/post-shift-dialog';

const requiredPermissions = ['shifts:start', 'shifts:end', 'shifts:delete', 'shifts:view-closed', 'shifts:post', 'shifts:view-details'] as const;

const formatCurrency = (amount: number) => `${Math.round(amount).toLocaleString()} ج.م`;

const formatDate = (dateString?: string | Date) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) + ' - ' + date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
}

export type BreakdownItem = {
    id: string;
    label: string;
    amount: number;
    subLabel?: string;
    date?: string;
    method?: string;
};

/**
 * دالة الحساب الموحدة لكافة شاشات النظام
 */
export function calculateShiftStats(shift: Shift, allOrders: Order[], allExpenses: Expense[]) {
    let salesGross = 0;
    let rentalsGross = 0;
    let receivedCash = 0;
    let receivedVodafone = 0;
    let receivedInstaPay = 0;
    let receivedVisa = 0;
    let discounts = 0;
    let expenseTotal = 0;
    let saleReturnsTotal = 0;
    let txCount = 0;

    const salesList: BreakdownItem[] = [];
    const rentalsList: BreakdownItem[] = [];
    const paymentsList: BreakdownItem[] = [];
    const discountsList: BreakdownItem[] = [];
    const expensesList: BreakdownItem[] = [];
    const returnsList: BreakdownItem[] = [];

    const shiftStartTime = new Date(shift.startTime);
    const shiftEndTime = shift.endTime ? new Date(shift.endTime) : new Date(8640000000000000);

    allOrders.forEach(order => {
        if (order.status === 'Cancelled') return;
        
        const orderIsLinked = order.shiftId === shift.id;
        const creationDate = new Date(order.createdAt || order.orderDate);
        const isLegacyMatch = !order.shiftId && 
                             order.processedByUserId === shift.cashier.id && 
                             creationDate >= shiftStartTime && 
                             creationDate <= shiftEndTime;

        if (orderIsLinked || isLegacyMatch) {
            txCount++;
            const netTotal = Number(order.total) || 0;
            const discount = Number(order.discountAmount) || 0;
            const gross = netTotal + discount;
            const items = Array.isArray(order.items) ? order.items : [];
            const itemsSummary = items.map(i => i.productName).join(' + ');

            const breakdownItem = {
                id: `${order.id}-gross`,
                label: `فاتورة ${order.orderCode} - ${order.customerName}`,
                amount: gross,
                subLabel: itemsSummary || 'بدون أصناف',
                date: order.orderDate
            };

            if (order.transactionType === 'Sale') {
                salesGross += gross;
                salesList.push(breakdownItem);
            } else {
                rentalsGross += gross;
                rentalsList.push(breakdownItem);
            }

            if (discount > 0) {
                discounts += discount;
                discountsList.push({
                    id: `d-${order.id}`,
                    label: `خصم فاتورة ${order.orderCode}`,
                    amount: discount,
                    subLabel: order.customerName,
                    date: order.discountAppliedDate || order.orderDate
                });
            }
        }

        if (order.payments) {
            Object.values(order.payments).forEach((p: any) => {
                if (!p) return;
                const pDate = new Date(p.date);
                const paymentIsLinked = p.shiftId === shift.id;
                const isLegacyPMatch = !p.shiftId && 
                                     p.userId === shift.cashier.id && 
                                     pDate >= shiftStartTime && 
                                     pDate <= shiftEndTime;

                if (paymentIsLinked || isLegacyPMatch) {
                    txCount++;
                    const amt = Number(p.amount) || 0;
                    if (p.method === 'Vodafone Cash') receivedVodafone += amt;
                    else if (p.method === 'InstaPay') receivedInstaPay += amt;
                    else if (p.method === 'Visa') receivedVisa += amt;
                    else receivedCash += amt;

                    paymentsList.push({
                        id: `${order.id}-${p.id}-pay`,
                        label: `تحصيل فاتورة ${order.orderCode}`,
                        amount: amt,
                        method: p.method,
                        subLabel: order.customerName,
                        date: p.date
                    });
                }
            });
        } else if (order.paid > 0 && (orderIsLinked || isLegacyMatch)) {
            const amt = Number(order.paid);
            receivedCash += amt;
            paymentsList.push({
                id: `${order.id}-initial-pay`,
                label: `تحصيل فاتورة ${order.orderCode}`,
                amount: amt,
                method: 'Cash',
                subLabel: order.customerName,
                date: (order.createdAt || order.orderDate) as string
            });
        }
    });

    allExpenses.forEach(e => {
        const eDate = new Date(e.date);
        const expenseIsLinked = e.shiftId === shift.id;
        const isLegacyEMatch = !e.shiftId && 
                              e.userId === shift.cashier.id && 
                              eDate >= shiftStartTime && 
                              eDate <= shiftEndTime;

        if (expenseIsLinked || isLegacyEMatch) {
            txCount++;
            const amt = Number(e.amount);
            const breakdownItem = {
                id: `exp-${e.id}`,
                label: e.description,
                amount: amt,
                subLabel: e.category,
                date: e.date
            };

            if (e.category === 'مرتجعات بيع' || e.category === 'مرتجع بيع' || e.category === 'إلغاء طلبات') {
                saleReturnsTotal += amt;
                returnsList.push(breakdownItem);
            } else {
                expenseTotal += amt;
                expensesList.push(breakdownItem);
            }
        }
    });

    const totalReceived = receivedCash + receivedVodafone + receivedInstaPay + receivedVisa;

    return { 
        salesGross, rentalsGross, receivedCash, receivedVodafone,
        receivedInstaPay, receivedVisa, totalReceived, discounts, 
        expenseTotal, saleReturnsTotal, txCount,
        totalRevenue: salesGross + rentalsGross - discounts,
        cashInDrawer: (Number(shift.openingBalance) || 0) + receivedCash - (expenseTotal + saleReturnsTotal),
        salesList, rentalsList, paymentsList, discountsList, expensesList, returnsList
    };
}

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
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                    {items.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">لا توجد حركات مسجلة.</div>
                    ) : (
                        <div className="grid gap-2">
                            {items.map((item, idx) => (
                                <div key={`${item.id}-${idx}`} className="flex justify-between items-center p-3 rounded-md bg-muted/30 border border-transparent hover:border-primary/20 transition-colors">
                                    <div className="space-y-0.5">
                                        <p className="font-bold text-sm">{item.label}</p>
                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                            {item.date && <span>{new Date(item.date).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'})}</span>}
                                            {item.method && <Badge variant="outline" className="text-[8px] px-1 h-4">{item.method}</Badge>}
                                            {item.subLabel && <span className="truncate max-w-[140px]">{item.subLabel}</span>}
                                        </div>
                                    </div>
                                    <span className={cn("font-mono font-black text-sm", isNegative ? "text-destructive" : "text-green-600")}>
                                        {isNegative ? '-' : '+'}{item.amount.toLocaleString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <Separator />
                <div className="flex justify-between items-center font-black text-lg p-2">
                    <span>{totalLabel}:</span>
                    <span className={isNegative ? "text-destructive" : "text-primary"}>{formatCurrency(total)}</span>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function ShiftStatusBadge({ shift }: { shift: Shift }) {
    if (!shift.endTime) return <Badge className="bg-green-500 text-white animate-pulse">مفتوحة</Badge>;
    if (shift.isPosted) return <Badge className="bg-green-100 text-green-800 border-green-200">تم الترحيل</Badge>;
    return <Badge variant="secondary">مغلقة</Badge>;
}

function ShiftCard({ shift, orders, expenses, permissions }: { shift: Shift, orders: Order[], expenses: Expense[], permissions: any }) {
    const router = useRouter();
    const stats = useMemo(() => calculateShiftStats(shift, orders, expenses), [shift, orders, expenses]);
    const canSeeDetails = permissions.canShiftsViewDetails;

    const [breakdown, setBreakdown] = useState<{ open: boolean, title: string, items: BreakdownItem[], label: string, isNegative: boolean }>({
        open: false, title: '', items: [], label: '', isNegative: false
    });

    const openBreakdown = (e: React.MouseEvent, title: string, items: BreakdownItem[], label: string, isNegative = false) => {
        e.stopPropagation();
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
            <Card className="flex flex-col border-primary/50 h-full hover:bg-muted/5 transition-colors cursor-pointer group" onClick={() => router.push(`/shifts/${shift.id}`)}>
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                        <div className="space-y-1 text-right">
                            <CardTitle className="font-headline text-lg flex items-center gap-2 group-hover:text-primary transition-colors">
                                <Clock className="h-5 w-5 opacity-50" />
                                وردية {shift.cashier?.name}
                            </CardTitle>
                            <div className="flex flex-col text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1 font-mono font-bold"><Hash className="h-3 w-3"/> رقم {shift.shiftCode || shift.id.slice(-6).toUpperCase()}</span>
                                <span>بدأت: {formatDate(shift.startTime)}</span>
                            </div>
                        </div>
                        <ShiftStatusBadge shift={shift} />
                    </div>
                </CardHeader>
                <CardContent className="grid gap-3 text-xs flex-grow" dir="rtl">
                    {canSeeDetails ? (
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={(e) => openBreakdown(e, "تفاصيل المبيعات", stats.salesList, "إجمالي مبيعات الوردية")} className="p-2.5 rounded-lg border-2 border-emerald-100 bg-emerald-50/50 hover:bg-emerald-100 text-right transition-all">
                                    <p className="text-[10px] text-emerald-700 flex items-center gap-1 font-bold"><ShoppingCart className="h-3 w-3"/> المبيعات</p>
                                    <p className="font-mono font-black text-sm mt-1 text-emerald-800">{formatCurrency(stats.salesGross)}</p>
                                </button>
                                <button onClick={(e) => openBreakdown(e, "تفاصيل الإيجارات", stats.rentalsList, "إجمالي إيجارات الوردية")} className="p-2.5 rounded-lg border-2 border-blue-100 bg-blue-50/50 hover:bg-blue-100 text-right transition-all">
                                    <p className="text-[10px] text-blue-700 flex items-center gap-1 font-bold"><Repeat className="h-3 w-3"/> الإيجارات</p>
                                    <p className="font-mono font-black text-sm mt-1 text-blue-800">{formatCurrency(stats.rentalsGross)}</p>
                                </button>
                            </div>

                            <button onClick={(e) => openBreakdown(e, "تفاصيل كافة المقبوضات", stats.paymentsList, "إجمالي المحصل")} className="w-full p-2.5 rounded-lg border-2 border-amber-200 bg-amber-50/50 hover:bg-amber-100 text-right transition-all">
                                <div className="flex justify-between items-center">
                                    <span className="flex items-center gap-1.5 font-bold text-amber-700 text-xs">
                                        <DollarSign className="h-4 w-4" /> إجمالي المحصل (مقبوضات)
                                    </span>
                                    <span className="font-mono font-black text-amber-700">{formatCurrency(stats.totalReceived)}</span>
                                </div>
                                <div className="flex gap-4 mt-2 pr-5 text-[9px] text-amber-600/70 font-medium">
                                    <span className="flex items-center gap-1"><Banknote className="h-2.5 w-2.5"/> كاش: {formatCurrency(stats.receivedCash)}</span>
                                    <span className="flex items-center gap-1"><Smartphone className="h-2.5 w-2.5"/> إلكتروني: {formatCurrency(stats.receivedVodafone + stats.receivedInstaPay + stats.receivedVisa)}</span>
                                </div>
                            </button>

                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={(e) => openBreakdown(e, "سجل الخصومات", stats.discountsList, "إجمالي الخصومات", true)} className="p-2 rounded-lg border border-amber-100 bg-amber-50/20 hover:bg-amber-100/50 text-right transition-all">
                                    <p className="text-[9px] text-amber-700 flex items-center gap-1"><BadgePercent className="h-3 w-3"/> الخصومات</p>
                                    <p className="font-mono font-black text-amber-700">{formatCurrency(stats.discounts)}</p>
                                </button>
                                <button onClick={(e) => openBreakdown(e, "سجل المصاريف والمرتجعات", [...stats.expensesList, ...stats.returnsList], "إجمالي الخارج", true)} className="p-2 rounded-lg border border-destructive/10 bg-destructive/5 hover:bg-destructive/10 text-right transition-all">
                                    <p className="text-[9px] text-destructive flex items-center gap-1"><TrendingDown className="h-3 w-3"/> مصاريف/مرتجع</p>
                                    <p className="font-mono font-black text-destructive">{formatCurrency(stats.expenseTotal + stats.saleReturnsTotal)}</p>
                                </button>
                            </div>
                            
                            <div className="p-3.5 rounded-xl bg-primary text-primary-foreground shadow-sm text-center relative overflow-hidden group/box">
                                <div className="absolute top-1 right-1 opacity-20"><Wallet className="h-10 w-10 rotate-12" /></div>
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-80">صافي النقدية المتوقع بالدرج</p>
                                <p className="font-black text-2xl font-mono mt-1">{formatCurrency(stats.cashInDrawer)}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-10 gap-3 bg-muted/20 rounded-md border border-dashed border-primary/20">
                            <Lock className="h-8 w-8 text-muted-foreground opacity-40" />
                            <p className="text-center text-muted-foreground font-bold">التفاصيل المالية محجوبة</p>
                            <p className="text-[10px] text-center text-muted-foreground">لا تملك صلاحية رؤية مبالغ الدرج.</p>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="pt-0">
                    {!shift.endTime ? (
                        permissions.canShiftsEnd ? (
                            <div className="w-full" onClick={(e) => e.stopPropagation()}>
                                <EndShiftDialog 
                                    shift={shift} 
                                    orders={orders} 
                                    expenses={expenses}
                                    trigger={<Button className="w-full gap-2 font-bold h-11 bg-primary text-primary-foreground hover:bg-primary/90"><LogOut className="h-5 w-5" /> إنهاء الوردية</Button>} 
                                />
                            </div>
                        ) : <Button variant="outline" className="w-full h-11 pointer-events-none opacity-50">الوردية جارية...</Button>
                    ) : (
                        <Button variant="ghost" className="w-full gap-2 h-11 text-primary">
                            عرض تقرير الإغلاق <ChevronLeft className="h-4 w-4" />
                        </Button>
                    )}
                </CardFooter>
            </Card>
        </>
    );
}

function ShiftsPageContent() {
    const { data: allShifts, isLoading: isLoadingShifts } = useRtdbList<Shift>('shifts');
    const { data: orders, isLoading: isLoadingOrders } = useRtdbList<Order>('daily-entries');
    const { data: expenses, isLoading: isLoadingExpenses } = useRtdbList<Expense>('expenses');
    const { appUser } = useUser();
    const db = useDatabase();
    const { toast } = useToast();
    const { permissions, isLoading: isLoadingPermissions } = usePermissions(requiredPermissions);
    const [showStartShiftDialog, setShowStartShiftDialog] = useState(false);
    const router = useRouter();

    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [shiftToDelete, setShiftToDelete] = useState<Shift | null>(null);

    const { openShifts, closedShifts } = useMemo(() => {
        const open: Shift[] = [];
        const closed: Shift[] = [];
        [...allShifts].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
            .forEach(shift => {
                if (shift.endTime) closed.push(shift);
                else open.push(shift);
            });
        return { openShifts: open, closedShifts: closed };
    }, [allShifts]);

    const handleDelete = async () => {
        if (!shiftToDelete || !db) return;
        try {
            await remove(ref(db, `shifts/${shiftToDelete.id}`));
            toast({ title: "تم حذف الوردية بنجاح" });
            setIsDeleteDialogOpen(false);
            setShiftToDelete(null);
        } catch (e: any) {
            toast({ variant: "destructive", title: "خطأ في الحذف", description: e.message });
        }
    };

    const isLoading = (isLoadingShifts && allShifts.length === 0) || isLoadingPermissions || isLoadingOrders || isLoadingExpenses;

  return (
    <div className="flex flex-col gap-8">
        <PageHeader title="إدارة الورديات والترحيل" showBackButton>
        {permissions.canShiftsStart && (
            <Button size="sm" className="gap-1" onClick={() => setShowStartShiftDialog(true)}>
                <PlusCircle className="h-4 w-4" /> بدء وردية جديدة
            </Button>
        )}
        </PageHeader>

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent dir="rtl" className="text-right">
                <AlertDialogHeader>
                    <AlertDialogTitle>حذف الوردية</AlertDialogTitle>
                    <AlertDialogDescription>هل أنت متأكد من حذف الوردية؟ هذا الإجراء سيؤثر على دقة التقارير المالية.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row-reverse gap-2">
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive">تأكيد الحذف</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {appUser && <StartShiftDialog open={showStartShiftDialog} onOpenChange={setShowStartShiftDialog} user={appUser} />}
        
        <div className="flex flex-col gap-8">
            <Card className="border-none shadow-none bg-transparent">
                <CardHeader className="text-right px-0">
                    <div className="flex items-center gap-2 justify-end">
                        <Clock className="h-5 w-5 text-green-500"/>
                        <CardTitle className="text-lg">الورديات المفتوحة حالياً</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="px-0">
                    {isLoading ? (
                        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                            {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
                        </div>
                    ) : openShifts.length === 0 ? (
                        <div className="h-32 flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl bg-muted/10">
                            لا توجد وردية مفتوحة حالياً في النظام.
                        </div>
                    ) : (
                        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                            {openShifts.map(shift => (
                                <ShiftCard key={shift.id} shift={shift} orders={orders} expenses={expenses} permissions={permissions} />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {permissions.canShiftsViewClosed && (
                <Card>
                    <CardHeader className="text-right border-b">
                        <div className="flex items-center gap-2 justify-end">
                            <Archive className="h-5 w-5 text-muted-foreground"/>
                            <CardTitle className="text-lg">سجل الورديات السابقة والترحيل</CardTitle>
                        </div>
                        <CardDescription>الورديات التي تم إغلاقها وتنتظر الترحيل إلى الخزائن المختصة.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 sm:p-6">
                        {isLoading ? (
                            <div className="p-6 space-y-4">
                                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-right">الرقم</TableHead>
                                            <TableHead className="text-right">الموظف</TableHead>
                                            <TableHead className="text-center">إجمالي العقود</TableHead>
                                            <TableHead className="text-center">كاش فعلي</TableHead>
                                            <TableHead className="text-center">الحالة</TableHead>
                                            <TableHead className="text-center">إجراءات</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {closedShifts.map((shift) => {
                                            const stats = calculateShiftStats(shift, orders, expenses);
                                            return (
                                                <TableRow key={shift.id} className={cn(shift.isPosted && "bg-green-50/30", "group cursor-pointer")} onClick={() => router.push(`/shifts/${shift.id}`)}>
                                                    <TableCell className="font-mono font-bold text-primary">{shift.shiftCode || shift.id.slice(-6).toUpperCase()}</TableCell>
                                                    <TableCell className="font-medium text-right">{shift.cashier?.name}</TableCell>
                                                    <TableCell className="text-center font-mono font-bold">
                                                        {permissions.canShiftsViewDetails ? formatCurrency(stats.totalRevenue) : '****'}
                                                    </TableCell>
                                                    <TableCell className="text-center font-mono font-bold text-primary">
                                                        {permissions.canShiftsViewDetails ? formatCurrency(shift.closingBalance || 0) : '****'}
                                                    </TableCell>
                                                    <TableCell className="text-center"><ShiftStatusBadge shift={shift}/></TableCell>
                                                    <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                                                        <div className="flex items-center justify-center gap-1">
                                                            {!shift.isPosted && permissions.canShiftsPost && (
                                                                <PostShiftDialog shift={shift} trigger={<Button variant="outline" size="sm" className="h-8 gap-1.5"><ArrowUpRight className="h-3.5 w-3.5"/> ترحيل</Button>} />
                                                            )}
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground group-hover:text-primary" asChild>
                                                                <Link href={`/shifts/${shift.id}`}><Eye className="h-4 w-4" /></Link>
                                                            </Button>
                                                            {permissions.canShiftsDelete && (
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); setShiftToDelete(shift); setIsDeleteDialogOpen(true); }}>
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    </div>
  );
}

export default function ShiftsPage() {
    return (
        <AuthLayout>
            <AuthGuard>
                <ShiftsPageContent />
            </AuthGuard>
        </AuthLayout>
    )
}
