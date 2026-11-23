'use client';

import React, { useState, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { AppLayout, AuthGuard } from '@/components/app-layout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Filter, HandCoins, User, Calendar, Eye, Phone, DollarSign } from 'lucide-react';
import { useRtdbList } from '@/hooks/use-rtdb';
import type { Order, Customer } from '@/lib/definitions';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePickerDialog } from '@/components/ui/date-picker-dialog';
import { Label } from '@/components/ui/label';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import { OrderDetailsDialog } from '@/components/order-details-dialog';
import { Badge } from '@/components/ui/badge';

function CustomerReceivablesReportPageContent() {
  // الوضع الافتراضي: عرض كافة المستحقات المتراكمة بدون تقييد زمني لضمان عدم إخفاء الديون القديمة
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);

  const { data: orders, isLoading: isLoadingOrders } = useRtdbList<Order>('daily-entries');
  const { data: customers, isLoading: isLoadingCustomers } = useRtdbList<Customer>('customers');

  const isLoading = isLoadingOrders || isLoadingCustomers;

  const receivables = useMemo(() => {
    if (isLoading) return [];

    const start = fromDate ? startOfDay(fromDate) : null;
    const end = toDate ? endOfDay(toDate) : null;

    return orders.filter(order => {
        if (order.status === 'Cancelled' || order.remainingAmount <= 0) return false;
        
        const orderDate = new Date(order.orderDate);
        const dateMatch = (!start || orderDate >= start) && (!end || orderDate <= end);
        return dateMatch;
    }).map(order => {
        const customer = customers.find(c => c.id === order.customerId);
        return {
            ...order,
            customerPhone: customer?.primaryPhone || '-',
        };
    }).sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }, [orders, customers, isLoading, fromDate, toDate]);

  const stats = useMemo(() => {
      const totalReceivable = receivables.reduce((sum, o) => sum + (o.remainingAmount || 0), 0);
      return { count: receivables.length, totalReceivable };
  }, [receivables]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ar-EG', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
  };

  const renderMobileCards = () => (
    <div className="grid gap-4 md:hidden">
      {isLoading && [...Array(3)].map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-24 w-full" />
          </CardHeader>
        </Card>
      ))}

      {!isLoading && receivables.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="h-32 flex items-center justify-center text-muted-foreground text-sm">
            لا توجد مبالغ مستحقة في هذه الفترة.
          </CardContent>
        </Card>
      )}

      {!isLoading && receivables.map((order) => (
        <Card key={order.id} className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <CardTitle className="font-mono text-base text-primary truncate">
                  {order.orderCode}
                </CardTitle>
                <p className="text-sm font-medium flex items-center gap-1.5 truncate">
                  <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {order.customerName}
                </p>
              </div>
              <Badge variant="destructive" className="font-mono font-bold shrink-0">
                {order.remainingAmount.toLocaleString()} ج.م
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm pt-0">
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> الهاتف
              </span>
              <span className="font-mono text-xs" dir="ltr">{order.customerPhone}</span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> تاريخ الطلب
              </span>
              <span className="text-xs font-mono">{formatDate(order.orderDate)}</span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> تاريخ التسليم
              </span>
              <span className="text-xs font-mono">{formatDate(order.deliveryDate)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t pt-3 mt-1">
              <div className="rounded-md bg-muted/50 p-2 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">الإجمالي</p>
                <p className="font-mono text-sm font-semibold">{order.total.toLocaleString()}</p>
              </div>
              <div className="rounded-md bg-green-50 dark:bg-green-950/30 p-2 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">المدفوع</p>
                <p className="font-mono text-sm font-semibold text-green-600">{order.paid.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="pt-0">
            <OrderDetailsDialog orderId={order.id}>
              <Button variant="outline" size="sm" className="w-full gap-1.5">
                <Eye className="h-4 w-4" />
                عرض الطلب
              </Button>
            </OrderDetailsDialog>
          </CardFooter>
        </Card>
      ))}
    </div>
  );

  const renderDesktopTable = () => (
    <Card className="hidden md:block">
      <CardHeader>
        <CardTitle>قائمة الديون المستحقة</CardTitle>
        <CardDescription>عرض تفصيلي للطلبات التي لم يتم سداد قيمتها بالكامل في الفترة المحددة.</CardDescription>
      </CardHeader>
      <CardContent className="p-0 sm:p-6 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center">كود الطلب</TableHead>
              <TableHead className="text-right">العميل</TableHead>
              <TableHead className="text-center">رقم الهاتف</TableHead>
              <TableHead className="text-center">تاريخ الطلب</TableHead>
              <TableHead className="text-center">تاريخ التسليم</TableHead>
              <TableHead className="text-center">إجمالي الطلب</TableHead>
              <TableHead className="text-center">المدفوع</TableHead>
              <TableHead className="text-center">المتبقي (المستحق)</TableHead>
              <TableHead className="text-center">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(9)].map((_, j) => <TableCell key={j}><Skeleton className="h-8 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : receivables.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  لا توجد مبالغ مستحقة في هذه الفترة.
                </TableCell>
              </TableRow>
            ) : (
              receivables.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-center">{order.orderCode}</TableCell>
                  <TableCell className="text-right font-medium">{order.customerName}</TableCell>
                  <TableCell className="text-center font-mono text-xs" dir="ltr">{order.customerPhone}</TableCell>
                  <TableCell className="text-center text-xs">
                      {formatDate(order.orderDate)}
                  </TableCell>
                  <TableCell className="text-center text-xs">
                      {formatDate(order.deliveryDate)}
                  </TableCell>
                  <TableCell className="text-center font-mono">
                      {order.total.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-center font-mono text-green-600">
                      {order.paid.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-center">
                      <Badge variant="destructive" className="font-mono font-bold text-sm">
                          {order.remainingAmount.toLocaleString()} ج.م
                      </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                      <OrderDetailsDialog orderId={order.id}>
                          <Button variant="ghost" size="sm" className="gap-1">
                              <Eye className="h-4 w-4" />
                              عرض الطلب
                          </Button>
                      </OrderDetailsDialog>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <PageHeader title="تقرير مستحقات العملاء" showBackButton />

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
                <Filter className="h-5 w-5"/>
                <CardTitle className="text-lg">فلترة البيانات حسب تاريخ الطلب</CardTitle>
            </div>
            {(fromDate || toDate) && (
                <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => { setFromDate(undefined); setToDate(undefined); }}
                    className="text-xs"
                >
                    عرض كل الديون المتراكمة (إلغاء الفلتر)
                </Button>
            )}
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
                <Label>من تاريخ الطلب (اختياري)</Label>
                 <DatePickerDialog
                    value={fromDate}
                    onValueChange={setFromDate}
                 />
            </div>
             <div className="flex flex-col gap-2">
                <Label>إلى تاريخ الطلب (اختياري)</Label>
                 <DatePickerDialog
                    value={toDate}
                    onValueChange={setToDate}
                    fromDate={fromDate}
                 />
            </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <HandCoins className="h-4 w-4 text-primary shrink-0" />
                    إجمالي المبالغ المستحقة
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-xl sm:text-2xl font-bold font-mono text-primary">
                    {stats.totalReceivable.toLocaleString()} ج.م
                </div>
            </CardContent>
        </Card>
        <Card className="bg-muted/50">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                    عدد الطلبات غير المحصلة
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-xl sm:text-2xl font-bold font-mono">
                    {stats.count}
                </div>
            </CardContent>
        </Card>
      </div>

      <div className="md:hidden space-y-2">
        <h2 className="text-base font-semibold px-1">قائمة الديون المستحقة</h2>
        <p className="text-xs text-muted-foreground px-1">
          الطلبات التي لم يتم سداد قيمتها بالكامل في الفترة المحددة.
        </p>
      </div>

      {renderMobileCards()}
      {renderDesktopTable()}
    </div>
  );
}

export default function CustomerReceivablesReportPage() {
    return (
        <AppLayout>
            <AuthGuard>
                <CustomerReceivablesReportPageContent />
            </AuthGuard>
        </AppLayout>
    )
}
