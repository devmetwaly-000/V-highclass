'use client';

import React, { useState, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { AppLayout, AuthGuard } from '@/components/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Filter, 
  XCircle, 
  User, 
  Calendar, 
  Eye, 
  FileText, 
  AlertTriangle, 
  Wrench, 
  Layers,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { useRtdbList } from '@/hooks/use-rtdb';
import type { Order, Expense } from '@/lib/definitions';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePickerDialog } from '@/components/ui/date-picker-dialog';
import { Label } from '@/components/ui/label';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import { OrderDetailsDialog } from '@/components/order-details-dialog';
import { 
  ResolveCancelledOrderDialog, 
  type UnsettledOrderCase 
} from '@/components/resolve-cancelled-order-dialog';
import { cn } from '@/lib/utils';

function CancelledOrdersReportPageContent() {
  const [fromDate, setFromDate] = useState<Date | undefined>(subDays(new Date(), 90));
  const [toDate, setToDate] = useState<Date | undefined>(new Date());

  const { data: orders, isLoading: isLoadingOrders } = useRtdbList<Order>('daily-entries');
  const { data: expenses, isLoading: isLoadingExpenses } = useRtdbList<Expense>('expenses');

  const isLoading = isLoadingOrders || isLoadingExpenses;

  // 1. استخراج الحالات المعلقة (فواتير سُجل لها مرتجع بالمصروفات وما زالت نشطة)
  const unsettledCases = useMemo<UnsettledOrderCase[]>(() => {
    if (isLoading || !orders || !expenses) return [];

    const map = new Map<string, UnsettledOrderCase>();

    expenses.forEach((e) => {
      const isCancellationExpense =
        e.category === 'إلغاء طلبات' ||
        (e.description && (e.description.includes('إلغاء طلب') || e.description.includes('رد مبلغ')));

      if (!isCancellationExpense) return;

      const desc = e.description || '';
      // استخراج كود الطلب من الوصف أو مطابقة الكود
      const match = desc.match(/\d{8}/);
      const code = match ? match[0] : null;

      if (!code) return;

      const matchingOrder = orders.find(
        (o) => String(o.orderCode) === code || (o.id && desc.includes(o.id))
      );

      // الحالة المعلقة: يوجد سند مرتجع ولكن حالة الفاتورة ليست Cancelled
      if (matchingOrder && matchingOrder.status !== 'Cancelled') {
        const orderKey = matchingOrder.id || code;
        if (!map.has(orderKey)) {
          map.set(orderKey, {
            order: matchingOrder,
            matchingExpenses: [],
            totalRefunded: 0,
          });
        }
        const entry = map.get(orderKey)!;
        entry.matchingExpenses.push(e);
        entry.totalRefunded += Number(e.amount) || 0;
      }
    });

    return Array.from(map.values()).sort(
      (a, b) => (parseInt(b.order.orderCode) || 0) - (parseInt(a.order.orderCode) || 0)
    );
  }, [orders, expenses, isLoading]);

  // 2. الطلبات الملغاة نظامياً (status === 'Cancelled')
  const cancelledOrders = useMemo(() => {
    if (isLoading) return [];

    const start = fromDate ? startOfDay(fromDate) : null;
    const end = toDate ? endOfDay(toDate) : null;

    return orders
      .filter((order) => {
        if (order.status !== 'Cancelled') return false;

        const cancelDateStr = order.cancelledAt || order.orderDate;
        const cancelDate = new Date(cancelDateStr);

        const dateMatch = (!start || cancelDate >= start) && (!end || cancelDate <= end);
        return dateMatch;
      })
      .sort((a, b) => {
        const dateA = new Date(a.cancelledAt || a.orderDate).getTime();
        const dateB = new Date(b.cancelledAt || b.orderDate).getTime();
        return dateB - dateA;
      });
  }, [orders, isLoading, fromDate, toDate]);

  const stats = useMemo(() => {
    const totalAmount = cancelledOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalUnsettledRefunded = unsettledCases.reduce((sum, c) => sum + c.totalRefunded, 0);
    const totalUnsettledInvoices = unsettledCases.reduce((sum, c) => sum + (c.order.total || 0), 0);
    return {
      count: cancelledOrders.length,
      totalAmount,
      unsettledCount: unsettledCases.length,
      totalUnsettledRefunded,
      totalUnsettledInvoices,
    };
  }, [cancelledOrders, unsettledCases]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ar-EG', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatShortDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ar-EG', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="تقرير وإدارة الطلبات الملغاة" showBackButton />

      {/* تنبيه بارز في حال وجود فواتير معلقة بحاجة لتسوية */}
      {unsettledCases.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/70 shadow-sm">
          <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-full bg-amber-100 text-amber-800 shrink-0 mt-0.5">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1 text-right">
                <h3 className="font-bold text-amber-950 text-base flex items-center gap-2">
                  تنبيه: تم رصد {unsettledCases.length} فواتير بحاجة لتسوية الإلغاء
                  <Badge variant="destructive" className="font-mono text-xs">
                    مهم
                  </Badge>
                </h3>
                <p className="text-xs text-amber-900 leading-relaxed max-w-3xl">
                  هذه الفواتير تم صرف مبالغ مرتجعات دفعات لها ومسجلة في المصروفات والورديات بقيمة{' '}
                  <span className="font-bold font-mono">
                    {stats.totalUnsettledRefunded.toLocaleString()} ج.م
                  </span>
                  ، لكن الفواتير لا تزال نشطة في النظام بقيمة إجمالية{' '}
                  <span className="font-bold font-mono">
                    {stats.totalUnsettledInvoices.toLocaleString()} ج.م
                  </span>
                  . يمكنك الضغط على زر &quot;حل المشكلة&quot; أمام كل فاتورة لمعاينتها وتسويتها.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* بطاقات الإحصائيات */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-muted/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              فواتير تحتاج تسوية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-amber-700">
              {isLoading ? <Skeleton className="h-8 w-16" /> : stats.unsettledCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">سُجل مرتجع دفعتها ولم تُلغَ</p>
          </CardContent>
        </Card>

        <Card className="bg-muted/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4 text-[#CD5C5C]" />
              مرتجعات مدفوعة معلقة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-[#CD5C5C]">
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                `${stats.totalUnsettledRefunded.toLocaleString()} ج.م`
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">مبالغ خرجت من الخزينة/الورديات</p>
          </CardContent>
        </Card>

        <Card className="bg-muted/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
              <XCircle className="h-4 w-4 text-red-500" />
              الطلبات الملغاة نظامياً
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">
              {isLoading ? <Skeleton className="h-8 w-16" /> : stats.count}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">ملغاة ومستبعدة من المبيعات</p>
          </CardContent>
        </Card>

        <Card className="bg-muted/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              إجمالي الملغي نظامياً
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-primary">
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                `${stats.totalAmount.toLocaleString()} ج.م`
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">قيمة العقود الملغاة بالكامل</p>
          </CardContent>
        </Card>
      </div>

      {/* التبويبات الرئيسية للتقرير */}
      <Tabs defaultValue={unsettledCases.length > 0 ? 'unsettled' : 'regular'} dir="rtl">
        <TabsList className="grid w-full grid-cols-2 max-w-md h-11">
          <TabsTrigger value="unsettled" className="gap-2 text-xs sm:text-sm font-bold">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            فواتير بحاجة لتسوية ({unsettledCases.length})
          </TabsTrigger>
          <TabsTrigger value="regular" className="gap-2 text-xs sm:text-sm font-bold">
            <XCircle className="h-4 w-4 text-red-500" />
            الطلبات الملغاة نظامياً ({cancelledOrders.length})
          </TabsTrigger>
        </TabsList>

        {/* ─── التبويب الأول: الفواتير المعلقة ─── */}
        <TabsContent value="unsettled" className="space-y-4 pt-2">
          <Card>
            <CardHeader className="pb-3 text-right">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Wrench className="h-5 w-5 text-primary" />
                سجل الفواتير التي تم رد دفعتها ولم تُلغَ في النظام
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                قائمة الفواتير المحصورة التي تم رصد مصروف رد مبلغ لها مع بقاء حالة الفاتورة نشطة. انقر على زر &quot;حل المشكلة&quot; لمعاينة الإجراء قبل تنفيذه.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center font-bold">كود الطلب</TableHead>
                    <TableHead className="text-right font-bold">العميل</TableHead>
                    <TableHead className="text-center font-bold">الفرع</TableHead>
                    <TableHead className="text-center font-bold">تاريخ الطلب</TableHead>
                    <TableHead className="text-center font-bold">إجمالي الفاتورة</TableHead>
                    <TableHead className="text-center font-bold">المسدد بالطلب</TableHead>
                    <TableHead className="text-center font-bold">مرتجع الدفعة المصروف</TableHead>
                    <TableHead className="text-center font-bold">الحالة الحالية</TableHead>
                    <TableHead className="text-center font-bold">الإجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    [...Array(4)].map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={9}>
                          <Skeleton className="h-10 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : unsettledCases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <CheckCircle2 className="h-8 w-8 text-green-500" />
                          <span className="font-bold text-sm">ممتاز! لا توجد أي فواتير معلقة حالياً.</span>
                          <span className="text-xs">كافة عمليات الإلغاء مكتملة ومطابقة مالياً.</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    unsettledCases.map((caseItem) => {
                      const { order, matchingExpenses, totalRefunded } = caseItem;
                      const hasDuplicates = matchingExpenses.length > 1;

                      return (
                        <TableRow key={order.id} className="hover:bg-muted/40 transition-colors">
                          <TableCell className="text-center font-mono font-bold text-primary">
                            #{order.orderCode}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col">
                              <span className="font-bold text-xs sm:text-sm">{order.customerName}</span>
                              {order.customerPhone && (
                                <span dir="ltr" className="text-[10px] text-muted-foreground font-mono">
                                  {order.customerPhone}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-xs">
                            {order.branchName || 'غير محدد'}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs">
                            {formatShortDate(order.orderDate)}
                          </TableCell>
                          <TableCell className="text-center font-mono font-bold text-xs">
                            {(order.total || 0).toLocaleString()} ج.م
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs text-green-700 font-bold">
                            {(order.paid || 0).toLocaleString()} ج.م
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center">
                              <span className="font-mono font-bold text-xs text-[#CD5C5C]">
                                {totalRefunded.toLocaleString()} ج.م
                              </span>
                              {hasDuplicates && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-amber-100 text-amber-900 border-amber-300 gap-0.5 mt-0.5">
                                  <Layers className="h-2.5 w-2.5" />
                                  مكرر ({matchingExpenses.length})
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className="text-[10px]">
                              {order.status || 'غير معروف'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              {/* زر حل المشكلة مع النافذة المنبثقة */}
                              <ResolveCancelledOrderDialog orderCase={caseItem} />
                              {/* زر عرض تفاصيل الفاتورة */}
                              <OrderDetailsDialog orderId={order.id} order={order}>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </OrderDetailsDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── التبويب الثاني: الطلبات الملغاة نظامياً ─── */}
        <TabsContent value="regular" className="space-y-4 pt-2">
          {/* فلترة التاريخ */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <CardTitle className="text-sm font-bold">فلترة الفترة الزمنية للإلغاء</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex flex-col gap-2">
                <Label className="text-xs">من تاريخ الإلغاء</Label>
                <DatePickerDialog value={fromDate} onValueChange={setFromDate} />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs">إلى تاريخ الإلغاء</Label>
                <DatePickerDialog value={toDate} onValueChange={setToDate} fromDate={fromDate} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 text-right">
              <CardTitle className="text-base sm:text-lg">سجل الإلغاءات النظامية</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                عرض تفصيلي للطلبات التي تم إلغاؤها بشكل مكتمل ومستبعدة من إيرادات النظام.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">كود الطلب</TableHead>
                    <TableHead className="text-right">العميل</TableHead>
                    <TableHead className="text-center">تاريخ الإلغاء</TableHead>
                    <TableHead className="text-center">بواسطة</TableHead>
                    <TableHead className="text-center">المبلغ الملغي</TableHead>
                    <TableHead className="text-center">عرض</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    [...Array(5)].map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={6}>
                          <Skeleton className="h-8 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : cancelledOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        لا توجد طلبات ملغاة في هذه الفترة.
                      </TableCell>
                    </TableRow>
                  ) : (
                    cancelledOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono text-right font-bold">
                          #{order.orderCode}
                        </TableCell>
                        <TableCell className="text-right">{order.customerName}</TableCell>
                        <TableCell className="text-center text-xs">
                          {formatDate(order.cancelledAt || order.orderDate)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs">
                              {order.cancelledByUserName || order.processedByUserName || 'نظام'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono font-bold text-[#CD5C5C]">
                          {(order.total || 0).toLocaleString()} ج.م
                        </TableCell>
                        <TableCell className="text-center">
                          <OrderDetailsDialog orderId={order.id} order={order}>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function CancelledOrdersReportPage() {
  return (
    <AppLayout>
      <AuthGuard>
        <CancelledOrdersReportPageContent />
      </AuthGuard>
    </AppLayout>
  );
}
