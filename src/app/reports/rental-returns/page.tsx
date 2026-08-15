'use client';

import React, { useState, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { AppLayout, AuthGuard } from '@/components/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Filter, Undo2, UserCheck, Calendar, Eye, FileText, CheckCircle2 } from 'lucide-react';
import { useRtdbList } from '@/hooks/use-rtdb';
import type { Order } from '@/lib/definitions';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePickerDialog } from '@/components/ui/date-picker-dialog';
import { Label } from '@/components/ui/label';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import { OrderDetailsDialog } from '@/components/order-details-dialog';
import { cn } from '@/lib/utils';

function RentalReturnsReportPageContent() {
  const [fromDate, setFromDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [toDate, setToDate] = useState<Date | undefined>(new Date());

  const { data: orders, isLoading } = useRtdbList<Order>('daily-entries');

  const returnedOrders = useMemo(() => {
    if (isLoading) return [];

    const start = fromDate ? startOfDay(fromDate) : null;
    const end = toDate ? endOfDay(toDate) : null;

    return orders.filter(order => {
        if (order.status !== 'Returned') return false;
        if (order.transactionType !== 'Rental') return false;
        
        const returnDateStr = order.returnedAt || order.orderDate;
        const actualReturnDate = new Date(returnDateStr);
        
        const dateMatch = (!start || actualReturnDate >= start) && (!end || actualReturnDate <= end);
        return dateMatch;
    }).sort((a, b) => {
        const dateA = new Date(a.returnedAt || a.orderDate).getTime();
        const dateB = new Date(b.returnedAt || b.orderDate).getTime();
        return dateB - dateA;
    });
  }, [orders, isLoading, fromDate, toDate]);

  const stats = useMemo(() => {
      return { count: returnedOrders.length };
  }, [returnedOrders]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ar-EG', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="تقرير المرتجعات المستلمة" showBackButton />

      <Card>
        <CardHeader>
            <div className="flex items-center gap-2">
                <Filter className="h-5 w-5"/>
                <CardTitle>فلترة البيانات</CardTitle>
            </div>
            <CardDescription>عرض فواتير الإيجار التي تم استلامها وفحصها خلال الفترة المحددة.</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex flex-col gap-2">
                <Label>من تاريخ الاستلام</Label>
                 <DatePickerDialog
                    value={fromDate}
                    onValueChange={setFromDate}
                 />
            </div>
             <div className="flex flex-col gap-2">
                <Label>إلى تاريخ الاستلام</Label>
                 <DatePickerDialog
                    value={toDate}
                    onValueChange={setToDate}
                    fromDate={fromDate}
                 />
            </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-green-500/5 border-green-500/10 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    إجمالي المرتجعات المستلمة
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold font-mono text-green-600">
                    {stats.count} فاتورة
                </div>
            </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>سجل المرتجعات</CardTitle>
          <CardDescription>قائمة بالطلبات التي تم إرجاعها للمحل وحالة كل منها.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">كود الطلب</TableHead>
                <TableHead className="text-right">العميل</TableHead>
                <TableHead className="text-center">تاريخ الاستلام</TableHead>
                <TableHead className="text-center">الموظف المستلم</TableHead>
                <TableHead className="text-center">حالة الصنف</TableHead>
                <TableHead className="text-center">عرض</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : returnedOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    لا توجد مرتجعات مستلمة في هذه الفترة.
                  </TableCell>
                </TableRow>
              ) : (
                returnedOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-right">{order.orderCode}</TableCell>
                    <TableCell className="text-right font-medium">{order.customerName}</TableCell>
                    <TableCell className="text-center text-xs">
                        {formatDate(order.returnedAt || order.orderDate)}
                    </TableCell>
                    <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                            <UserCheck className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs">{order.returnedToEmployeeName || '-'}</span>
                        </div>
                    </TableCell>
                    <TableCell className="text-center">
                        {order.returnCondition === 'good' ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">جيد</Badge>
                        ) : order.returnCondition === 'damaged' ? (
                            <Badge variant="destructive" className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200">تالف</Badge>
                        ) : (
                            <Badge variant="outline">غير محدد</Badge>
                        )}
                    </TableCell>
                    <TableCell className="text-center">
                        <OrderDetailsDialog orderId={order.id}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Eye className="h-4 w-4" />
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
    </div>
  );
}

export default function RentalReturnsReportPage() {
  return (
    <AppLayout>
      <AuthGuard>
        <RentalReturnsReportPageContent />
      </AuthGuard>
    </AppLayout>
  );
}
