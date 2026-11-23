'use client';

import { PageHeader } from '@/components/page-header';
import { AppLayout, AuthGuard } from '@/components/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Eye, Filter } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Order, Branch } from '@/lib/definitions';
import { useRtdbList } from '@/hooks/use-rtdb';
import { Skeleton } from '@/components/ui/skeleton';
import { differenceInDays, startOfToday } from 'date-fns';
import { Button } from '@/components/ui/button';
import { OrderDetailsDialog } from '@/components/order-details-dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

function OverdueOrdersPageContent() {
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const { data: orders, isLoading: isLoadingOrders } = useRtdbList<Order>('daily-entries');
  const { data: branches, isLoading: isLoadingBranches } = useRtdbList<Branch>('branches');

  const isLoading = isLoadingOrders || isLoadingBranches;

  const overdueOrders = useMemo(() => {
    if (isLoading) return [];
    const today = startOfToday();
    return orders
      .filter(order => {
        if (order.transactionType !== 'Rental' || order.status !== 'Delivered to Customer' || !order.returnDate) {
          return false;
        }
        if (selectedBranch !== 'all' && order.branchId !== selectedBranch) {
          return false;
        }
        try {
            const returnDate = new Date(order.returnDate);
            return returnDate < today;
        } catch (e) {
            return false;
        }
      })
      .map(order => ({
        ...order,
        daysOverdue: differenceInDays(today, new Date(order.returnDate!)),
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [orders, isLoading, selectedBranch]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('ar-EG', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch (e) {
        return dateString;
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="تقرير الطلبات المتأخرة" showBackButton />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            <CardTitle>فلترة حسب الفرع</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-2">
            <Label>الفرع</Label>
            <Select value={selectedBranch} onValueChange={setSelectedBranch} disabled={isLoadingBranches}>
              <SelectTrigger><SelectValue placeholder="كل الفروع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفروع</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle>الطلبات المتأخرة حاليًا</CardTitle>
          </div>
          <CardDescription>
            قائمة بجميع طلبات الإيجار التي تجاوزت تاريخ الإرجاع المحدد ولم يتم تسجيل استلامها بعد.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>كود الطلب</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>الفرع</TableHead>
                <TableHead className="text-center">تاريخ التسليم</TableHead>
                <TableHead className="text-center">تاريخ الإرجاع</TableHead>
                <TableHead className="text-center">أيام التأخير</TableHead>
                <TableHead className="text-center">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32 mx-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32 mx-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 mx-auto" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8 mx-auto" /></TableCell>
                </TableRow>
              ))}
              {!isLoading && overdueOrders.map((order) => (
                <TableRow key={order.id} className="bg-destructive/5">
                  <TableCell className="font-mono">{order.orderCode}</TableCell>
                  <TableCell>{order.customerName}</TableCell>
                  <TableCell>{order.branchName}</TableCell>
                  <TableCell className="text-center">{formatDate(order.deliveryDate)}</TableCell>
                  <TableCell className="text-center">{formatDate(order.returnDate)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="destructive" className="text-base font-bold">
                        {order.daysOverdue}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <OrderDetailsDialog orderId={order.id}>
                        <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                        </Button>
                    </OrderDetailsDialog>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && overdueOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    لا توجد طلبات متأخرة حاليًا.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function OverdueOrdersPage() {
    return (
        <AppLayout>
            <AuthGuard>
                <OverdueOrdersPageContent />
            </AuthGuard>
        </AppLayout>
    )
}
