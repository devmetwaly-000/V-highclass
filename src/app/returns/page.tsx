"use client";

import React, { useState, useMemo, useEffect } from 'react';
import {
  Undo2,
  Calendar as CalendarIcon,
  Filter,
  Eye,
  AlertTriangle,
  History,
  CheckCircle2,
  Clock,
  Store,
  User,
  Package,
  XCircle,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { format, startOfToday, isPast, startOfDay, endOfDay, subDays, addDays } from 'date-fns';
import type { Order, Branch } from '@/lib/definitions';
import { useRtdbList } from '@/hooks/use-rtdb';
import { useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { OrderDetailsDialog } from '@/components/order-details-dialog';
import { AppLayout, AuthGuard } from '@/components/app-layout';
import { ReceiveReturnDialog } from '@/components/receive-return-dialog';
import { Progress } from '@/components/ui/progress';
import { DatePickerDialog } from '@/components/ui/date-picker-dialog';

function formatDate(dateString?: string | Date) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        return '-'
    }
    return format(date, "d MMMM yyyy");
}

function ReturnProgress({ order }: { order: Order }) {
    const rentalItems = order.items.filter(item => (item.itemTransactionType || order.transactionType) === 'Rental');
    
    const total = rentalItems.reduce((sum, item) => sum + item.quantity, 0);
    const returned = rentalItems.reduce((sum, item) => sum + (item.returnedQuantity || 0), 0);
    const percent = total > 0 ? (returned / total) * 100 : 0;
    
    return (
        <div className="flex flex-col gap-1 w-full max-w-[150px]">
            <div className="flex justify-between text-[10px] font-bold">
                <span>المرتجع:</span>
                <span dir="ltr" className="font-mono">{returned} / {total}</span>
            </div>
            <Progress value={percent} className="h-1.5" />
        </div>
    );
}

function ReturnsPageContent() {
  const [filter, setFilter] = useState<'all' | 'due' | 'overdue' | 'partial'>('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [fromDate, setFromDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [toDate, setToDate] = useState<Date | undefined>(addDays(new Date(), 60));
  
  const { appUser } = useUser();
  const { data: allOrders, isLoading: isLoadingOrders } = useRtdbList<Order>('daily-entries');
  const { data: branches, isLoading: isLoadingBranches } = useRtdbList<Branch>('branches');

  const isLoading = isLoadingOrders || isLoadingBranches;
  
  const rentalOrdersToReturn = useMemo(() => {
    if (isLoading) return [];

    const start = fromDate ? startOfDay(fromDate) : null;
    const end = toDate ? endOfDay(toDate) : null;

    let orders = allOrders.filter(order => {
        // 1. استبعاد المرتجع بالكامل أو الملغي
        if (order.status === 'Returned' || order.returnStatus === 'fully_returned' || order.status === 'Cancelled') return false;

        // 2. التحقق من وجود أصناف مؤجرة
        const hasRentalItems = order.items.some(item => (item.itemTransactionType || order.transactionType) === 'Rental');
        if (!hasRentalItems) return false;

        // 3. تصفية الفرع
        let branchMatch = branchFilter === 'all' || order.branchId === branchFilter;
        if (appUser?.branchId && appUser.branchId !== 'all') {
            branchMatch = order.branchId === appUser.branchId;
        }
        if (!branchMatch) return false;

        // 4. تصفية التاريخ (بناءً على تاريخ الإرجاع أو تاريخ الطلب كبديل)
        const dateToFilterBy = order.returnDate ? new Date(order.returnDate) : new Date(order.orderDate);
        if (start || end) {
            const dateMatch = (!start || dateToFilterBy >= start) && (!end || dateToFilterBy <= end);
            if (!dateMatch) return false;
        }

        return true;
    });
    
    if (filter === 'overdue') {
        orders = orders.filter(o => o.returnDate && isPast(new Date(o.returnDate)));
    } else if (filter === 'partial') {
        orders = orders.filter(o => o.returnStatus === 'partially_returned');
    } else if (filter === 'due') {
        const today = startOfToday();
        orders = orders.filter(o => o.returnDate && startOfDay(new Date(o.returnDate)).getTime() === today.getTime());
    }

    return orders.sort((a, b) => {
        const dateA = a.returnDate ? new Date(a.returnDate).getTime() : new Date(a.orderDate).getTime();
        const dateB = b.returnDate ? new Date(b.returnDate).getTime() : new Date(b.orderDate).getTime();
        return dateA - dateB; // الأقدم (المستحق أولاً)
    });
  }, [allOrders, filter, branchFilter, fromDate, toDate, appUser, isLoading]);

  const clearFilters = () => {
      setFromDate(undefined);
      setToDate(undefined);
      setFilter('all');
      setBranchFilter('all');
  };

  const renderMobileCards = () => (
    <div className="grid gap-4 md:hidden">
        {rentalOrdersToReturn.map(order => {
            const isOverdue = order.returnDate && isPast(new Date(order.returnDate));
            const isPartial = order.returnStatus === 'partially_returned';

            return (
                <Card key={order.id} className={cn("overflow-hidden", isOverdue && "border-destructive bg-destructive/5", isPartial && "border-amber-400 bg-amber-50/30")}>
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                            <div className="space-y-1">
                                <CardTitle className="font-mono text-lg">{order.orderCode}</CardTitle>
                                <p className="text-sm font-medium">{order.customerName}</p>
                            </div>
                            <div className="flex flex-col gap-1 items-end">
                                {isOverdue && (
                                    <Badge variant="destructive" className="gap-1 text-[10px]">
                                        <AlertTriangle className="h-3 w-3" /> متأخر
                                    </Badge>
                                )}
                                {isPartial && (
                                    <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] gap-1">
                                        <Undo2 className="h-3 w-3" /> إرجاع جزئي
                                    </Badge>
                                )}
                                {!isOverdue && !isPartial && <Badge variant="outline" className="text-[10px]">في الموعد</Badge>}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm pt-2">
                        <ReturnProgress order={order} />
                        <div className="flex justify-between pt-2 border-t">
                            <span className="text-muted-foreground flex items-center gap-1"><CalendarIcon className="h-3 w-3"/> الإرجاع المقرر:</span>
                            <span className={cn(isOverdue && "text-destructive font-bold")}>{formatDate(order.returnDate)}</span>
                        </div>
                    </CardContent>
                    <CardFooter className="flex gap-2">
                        <ReceiveReturnDialog 
                            order={order} 
                            trigger={
                                <Button size="sm" className="flex-1 gap-1.5 bg-green-600 text-white hover:bg-green-700">
                                    <CheckCircle2 className="h-4 w-4"/> استلام
                                </Button>
                            } 
                        />
                        <OrderDetailsDialog orderId={order.id}>
                            <Button variant="outline" size="sm" className="gap-1.5">
                                <Eye className="h-4 w-4"/> عرض
                            </Button>
                        </OrderDetailsDialog>
                    </CardFooter>
                </Card>
            );
        })}
    </div>
  );

  const renderDesktopTable = () => (
    <Card className="hidden md:block">
        <CardHeader>
            <div className="flex items-center gap-2">
                <History className="h-6 w-6 text-primary" />
                <div>
                    <CardTitle>طلبات إيجار تنتظر الإرجاع</CardTitle>
                    <CardDescription>متابعة الأصناف المستلمة والمتبقية لكل فاتورة.</CardDescription>
                </div>
            </div>
        </CardHeader>
        <CardContent className="p-0">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="text-center">كود الطلب</TableHead>
                        <TableHead className="text-right">العميل</TableHead>
                        <TableHead className="text-center">حالة الإرجاع</TableHead>
                        <TableHead className="text-right">تقدم الاستلام</TableHead>
                        <TableHead className="text-center">تاريخ الإرجاع المقرر</TableHead>
                        <TableHead className="text-center">الحالة الزمنية</TableHead>
                        <TableHead className="w-[200px] text-center">الإجراءات</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rentalOrdersToReturn.map(order => {
                        const isOverdue = order.returnDate && isPast(new Date(order.returnDate));
                        const isPartial = order.returnStatus === 'partially_returned';

                        return (
                            <TableRow key={order.id} className={cn(isOverdue && 'bg-destructive/5', isPartial && 'bg-amber-50/30')}>
                                <TableCell className="text-center font-mono font-bold text-primary">{order.orderCode}</TableCell>
                                <TableCell className="text-right font-medium">{order.customerName}</TableCell>
                                <TableCell className="text-center">
                                    {isPartial ? (
                                        <Badge className="bg-amber-100 text-amber-800 border-amber-300 gap-1.5">
                                            <Undo2 className="h-3.5 w-3.5" /> إرجاع جزئي
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary">لم يتم البدء</Badge>
                                    )}
                                </TableCell>
                                <TableCell className="text-right"><ReturnProgress order={order} /></TableCell>
                                <TableCell className="text-center text-xs font-mono">{formatDate(order.returnDate)}</TableCell>
                                <TableCell className="text-center">
                                    {isOverdue ? (
                                        <Badge variant="destructive" className="gap-1.5">
                                            <AlertTriangle className="h-3.5 w-3.5" /> متأخر
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-green-600 border-green-200">في الموعد</Badge>
                                    )}
                                </TableCell>
                                <TableCell className="text-center">
                                    <div className="flex gap-2 justify-center">
                                        <ReceiveReturnDialog 
                                            order={order} 
                                            trigger={
                                                <Button size="sm" className="gap-1.5 bg-green-600 text-white hover:bg-green-700">
                                                    <CheckCircle2 className="h-4 w-4"/> استلام
                                                </Button>
                                            } 
                                        />
                                        <OrderDetailsDialog orderId={order.id}>
                                            <Button variant="ghost" size="sm" className="gap-1.5">
                                                <Eye className="h-4 w-4"/> عرض
                                            </Button>
                                        </OrderDetailsDialog>
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="استلام المرتجعات" showBackButton />

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">تصفية المتابعة</CardTitle>
            </div>
            {(fromDate || toDate || branchFilter !== 'all' || filter !== 'all') && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 gap-1">
                    <XCircle className="h-4 w-4" /> مسح الفلاتر
                </Button>
            )}
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
             <div className="flex flex-col gap-2">
                 <Label>حالة الاستلام</Label>
                 <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">كل المرتجعات المطلوبة</SelectItem>
                        <SelectItem value="due">تستحق اليوم</SelectItem>
                        <SelectItem value="partial">المرتجع جزئياً فقط</SelectItem>
                        <SelectItem value="overdue">المتأخرة عن الموعد</SelectItem>
                    </SelectContent>
                </Select>
            </div>
             <div className="flex flex-col gap-2">
                <Label>من تاريخ استحقاق</Label>
                 <DatePickerDialog
                    value={fromDate}
                    onValueChange={setFromDate}
                 />
            </div>
             <div className="flex flex-col gap-2">
                <Label>إلى تاريخ استحقاق</Label>
                 <DatePickerDialog
                    value={toDate}
                    onValueChange={setToDate}
                 />
            </div>
            <div className="flex flex-col gap-2">
                 <Label>الفرع</Label>
                 <Select value={branchFilter} onValueChange={setBranchFilter} disabled={isLoadingBranches || (!!appUser?.branchId && appUser.branchId !== 'all')}>
                    <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">كل الفروع</SelectItem>
                        {branches.map(branch => (
                            <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </CardContent>
      </Card>

        {isLoading ? (
            <div className="grid gap-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        ) : rentalOrdersToReturn.length === 0 ? (
            <Card className="border-dashed">
                <CardContent className="h-48 flex flex-col items-center justify-center text-muted-foreground gap-3">
                    <div className="p-4 rounded-full bg-muted">
                        <Package className="h-10 w-10 opacity-20" />
                    </div>
                    <p>لا توجد طلبات إيجار معلقة للاستلام حالياً في هذه الفترة.</p>
                    <Button variant="outline" size="sm" onClick={clearFilters}>إظهار كافة المرتجعات</Button>
                </CardContent>
            </Card>
        ) : (
            <>
                {renderMobileCards()}
                {renderDesktopTable()}
            </>
        )}
    </div>
  );
}

export default function ReturnsPage() {
    return (
        <AppLayout>
            <AuthGuard>
                <ReturnsPageContent />
            </AuthGuard>
        </AppLayout>
    )
}