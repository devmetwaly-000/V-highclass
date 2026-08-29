'use client';

import React, { useState, useEffect, useMemo, useTransition } from 'react';
import {
  PlusCircle,
  ArrowUpDown,
  Filter,
  Eye,
  XCircle,
  Package,
  Search,
  Loader2,
  CheckCircle2,
  Truck,
  Scissors,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { Order, Branch } from '@/lib/definitions';
import { useUser } from '@/firebase';
import { useRtdbList } from '@/hooks/use-rtdb';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { NewOrderDialog } from '@/components/new-order-dialog';
import { AuthLayout, AuthGuard } from '@/components/app-layout';
import { OrderDetailsDialog } from '@/components/order-details-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { DatePickerDialog } from '@/components/ui/date-picker-dialog';
import { startOfDay, endOfDay, subDays, startOfToday } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { OrderItemsPreviewDialog } from '@/components/order-items-preview-dialog';
import { cn } from '@/lib/utils';
import { CountdownBanner } from '@/components/countdown-banner';

const ITEMS_PER_PAGE = 50;
const MAX_SYNC_DAYS = 500; // تم زيادة الحد لضمان ظهور كافة الطلبات التاريخية

function formatDate(dateString?: string | Date) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('ar-EG', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

const isOrderEffectivelyCompleted = (order: Order) => {
    return (order.status === 'Delivered to Customer' && order.transactionType === 'Sale') ||
           order.status === 'Returned' ||
           order.returnStatus === 'fully_returned';
}

function OrdersPageContent() {
  const { appUser } = useUser();
  const { permissions, isLoading: isLoadingPermissions } = usePermissions(['orders:add'] as const);
  const [currentPage, setCurrentPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  const isSuperAdmin = useMemo(() => {
      if (!appUser) return false;
      return appUser.permissions.includes('all') || appUser.role === 'admin' || appUser.username === 'admin';
  }, [appUser]);

  // فلاتر الواجهة
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [transactionType, setTransactionType] = useState('all');
  const [status, setStatus] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'date' | 'code'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined); // جعلها فارغة افتراضياً لعرض "الكل"
  const [toDate, setToDate] = useState<Date | undefined>(undefined);
  const [hideCompleted, setHideCompleted] = useState(true);
  const [isAddOrderOpen, setIsAddOrderOpen] = useState(false);

  // جلب البيانات
  const { data: allOrders, isLoading: isLoadingOrders, error: ordersError } = useRtdbList<Order>('daily-entries', {
      limit: MAX_SYNC_DAYS
  });
  
  const { data: branches, isLoading: isLoadingBranches } = useRtdbList<Branch>('branches');

  const isLoading = isLoadingOrders || isLoadingBranches || !appUser || isLoadingPermissions;

  useEffect(() => {
    if (appUser && !isSuperAdmin) {
        setBranchFilter(appUser.branchId || 'all');
    }
  }, [appUser, isSuperAdmin]);

  // تحديث نص البحث بشكل مؤجل
  useEffect(() => {
    const handler = setTimeout(() => {
        startTransition(() => {
            setSearchTerm(searchInput);
            setCurrentPage(1);
        });
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  const filteredOrders = useMemo(() => {
    if (isLoading) return [];
    
    const start = fromDate ? startOfDay(fromDate) : null;
    const end = toDate ? endOfDay(toDate) : null;

    let result = allOrders.filter(order => {
      // 1. تصفية الفرع (الأولوية لفرع الموظف)
      if (!isSuperAdmin && appUser?.branchId && appUser.branchId !== 'all') {
        if (order.branchId !== appUser.branchId) return false;
      } else if (branchFilter !== 'all' && order.branchId !== branchFilter) {
        return false;
      }

      // 2. تصفية التاريخ
      const orderDate = new Date(order.orderDate || order.createdAt || 0);
      const dateMatch = (!start || orderDate >= start) && (!end || orderDate <= end);
      if (!dateMatch) return false;

      // 3. تصفية النص
      const query = searchTerm.toLowerCase().trim();
      if (query) {
          const searchMatch = 
            (order.orderCode || "").toString().toLowerCase().includes(query) ||
            (order.customerName || "").toLowerCase().includes(query) ||
            (order.customerPhone || "").toLowerCase().includes(query) ||
            order.items?.some(item => item.productName.toLowerCase().includes(query));
          if (!searchMatch) return false;
      }

      // 4. تصفية النوع والحالة
      if (transactionType !== 'all' && order.transactionType !== transactionType) return false;
      
      if (status === 'overdue') {
        const today = startOfToday();
        const isRental = order.transactionType === 'Rental';
        const isDelivered = order.status === 'Delivered to Customer';
        let isDateOverdue = false;
        if (order.returnDate) {
            try {
                const returnDateObj = new Date(order.returnDate);
                isDateOverdue = returnDateObj < today;
            } catch (e) {
                isDateOverdue = false;
            }
        }
        if (!(isRental && isDelivered && isDateOverdue)) return false;
      } else if (status !== 'all' && order.status !== status) {
        return false;
      }

      // 5. إخفاء المكتمل
      if (hideCompleted) {
          if (isOrderEffectivelyCompleted(order) && order.status !== 'Cancelled') return false;
      }

      return true;
    });

    // الترتيب
    result.sort((a, b) => {
        if (sortBy === 'code') {
            const codeA = parseInt(a.orderCode) || 0;
            const codeB = parseInt(b.orderCode) || 0;
            return sortDir === 'desc' ? codeB - codeA : codeA - codeB;
        } else {
            const dateA = new Date(a.orderDate || a.createdAt || 0).getTime();
            const dateB = new Date(b.orderDate || b.createdAt || 0).getTime();
            return sortDir === 'desc' ? dateB - dateA : dateA - dateB;
        }
    });

    return result;
  }, [allOrders, searchTerm, transactionType, status, branchFilter, appUser, isLoading, fromDate, toDate, hideCompleted, isSuperAdmin, sortBy, sortDir]);

  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);

  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredOrders.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredOrders, currentPage]);

  const getStatusComponent = (order: Order) => {
    if (order.status === 'Cancelled') {
        return <Badge variant="destructive" className="gap-1.5 bg-red-600"><XCircle className="h-3.5 w-3.5" />ملغي</Badge>;
    }

    if (order.returnStatus === 'fully_returned' || order.returnStatus === 'partially_returned') {
        return (
          <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300 gap-1.5">
            {order.returnStatus === 'fully_returned' ? 'تم إرجاع كلي' : 'تم إرجاع جزئي'}
          </Badge>
        );
    }
      
    if (isOrderEffectivelyCompleted(order)) {
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />مكتمل</Badge>;
    }

    switch (order.status) {
      case 'Delivered to Customer':
        return <Badge className="bg-blue-500 hover:bg-blue-600 text-white gap-2"><Truck className="h-4 w-4" /><span>تم التسليم</span></Badge>;
      case 'Ready for Pickup':
        return <Badge className="bg-yellow-500 text-black">جاهز للتسليم</Badge>;
      case 'Returned from Tailor':
        return <Badge className="bg-purple-500 text-white gap-1.5"><Scissors className="h-3.5 w-3.5"/>من الخياط</Badge>;
      case 'Pending':
        return <Badge variant="secondary">قيد الانتظار</Badge>;
      default:
        return <Badge variant="outline">{order.status || 'غير معروف'}</Badge>;
    }
  };

  if (ordersError) return <div className="p-8 text-destructive text-center font-bold">خطأ في الاتصال بقاعدة البيانات: {ordersError.message}</div>;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="إدارة الطلبات" showBackButton>
        {permissions.canOrdersAdd && (
          <NewOrderDialog 
            open={isAddOrderOpen}
            onOpenChange={setIsAddOrderOpen}
            trigger={<Button size="sm" className="gap-1"><PlusCircle className="h-4 w-4" />إضافة طلب جديد</Button>} 
          />
        )}
      </PageHeader>

      <CountdownBanner />

      <Card className="border-primary/20 shadow-sm">
        <CardHeader className="pb-3">
             <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">تصفية وبحث شامل</CardTitle>
              </div>
              {(isLoading || isPending) && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            </div>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
               <div className="flex flex-col gap-2 col-span-full">
                <Label htmlFor="search" className="font-bold">بحث سريع</Label>
                <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="search"
                        placeholder="رقم الفاتورة، العميل، الهاتف، أو اسم المنتج..."
                        className="pr-9 h-11 border-primary/30 focus-visible:ring-primary"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                </div>
              </div>
               <div className="flex flex-col gap-2">
                  <Label className="text-xs">من تاريخ</Label>
                  <DatePickerDialog value={fromDate} onValueChange={setFromDate} />
              </div>
               <div className="flex flex-col gap-2">
                  <Label className="text-xs">إلى تاريخ</Label>
                  <DatePickerDialog value={toDate} onValueChange={setToDate} fromDate={fromDate} />
              </div>
               <div className="flex flex-col gap-2">
                <Label htmlFor="type" className="text-xs">نوع المعاملة</Label>
                 <Select value={transactionType} onValueChange={setTransactionType}>
                  <SelectTrigger id="type"><SelectValue placeholder="الكل" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأنواع</SelectItem>
                    <SelectItem value="Rental">إيجار</SelectItem>
                    <SelectItem value="Sale">بيع</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="status" className="text-xs">الحالة</Label>
                 <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="status"><SelectValue placeholder="الكل" /></SelectTrigger>
                  <SelectContent>
                     <SelectItem value="all">كل الحالات</SelectItem>
                     <SelectItem value="Pending">قيد الانتظار</SelectItem>
                     <SelectItem value="Ready for Pickup">جاهز للتسليم</SelectItem>
                     <SelectItem value="Delivered to Customer">تم التسليم</SelectItem>
                     <SelectItem value="overdue" className="text-destructive font-bold">متأخر</SelectItem>
                     <SelectItem value="Returned">تم الإرجاع</SelectItem>
                     <SelectItem value="Cancelled">ملغي</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isSuperAdmin && (
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs">تصفية بالفرع</Label>
                    <Select value={branchFilter} onValueChange={setBranchFilter}>
                        <SelectTrigger><SelectValue placeholder="كل الفروع" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">كل الفروع</SelectItem>
                            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                  </div>
              )}

              <div className="flex flex-col gap-2">
                <Label className="flex items-center gap-1.5 text-xs"><ArrowUpDown className="h-3 w-3" /> ترتيب حسب</Label>
                 <Select 
                    value={`${sortBy}-${sortDir}`} 
                    onValueChange={(val) => {
                        const [newSort, newDir] = val.split('-') as [any, any];
                        setSortBy(newSort);
                        setSortDir(newDir);
                    }}
                >
                  <SelectTrigger>
                      <SelectValue placeholder="الترتيب" />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value="date-desc">التاريخ (الأحدث أولاً)</SelectItem>
                     <SelectItem value="date-asc">التاريخ (الأقدم أولاً)</SelectItem>
                     <SelectItem value="code-desc">رقم الطلب (الأكبر أولاً)</SelectItem>
                     <SelectItem value="code-asc">رقم الطلب (الأصغر أولاً)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 md:col-span-1">
                <div className="flex items-center space-x-2 space-x-reverse rounded-md border p-3 flex-1 bg-muted/10 h-10">
                  <Checkbox id="hide-completed" checked={hideCompleted} onCheckedChange={(checked) => setHideCompleted(!!checked)} />
                  <Label htmlFor="hide-completed" className="font-normal cursor-pointer text-xs">إخفاء المكتمل</Label>
                </div>
              </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : filteredOrders.length === 0 ? (
           <Card className="border-dashed h-64 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <Package className="h-12 w-12 opacity-10" />
                <p>لا توجد طلبات تطابق الفلتر أو لا يوجد صلاحية للفرع.</p>
                <Button variant="outline" size="sm" onClick={() => { setSearchInput(''); setFromDate(undefined); setToDate(undefined); setHideCompleted(false); setStatus('all'); }}>عرض كافة الطلبات المتاحة</Button>
            </Card>
        ) : (
             <div className="flex flex-col gap-6">
                <div className="text-xs text-muted-foreground font-medium pr-2">
                    تم العثور على <span className="text-primary font-bold">{filteredOrders.length}</span> طلب.
                </div>
                
                <Card className={cn("hidden md:block transition-opacity duration-200", isPending && "opacity-50")}>
                    <CardContent className="p-0 overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-center w-[120px]">كود الطلب</TableHead>
                                    <TableHead className="text-center w-[80px]">الأصناف</TableHead>
                                    <TableHead className="text-right">العميل</TableHead>
                                    <TableHead className="text-center">الفرع</TableHead>
                                    <TableHead className="text-center">التاريخ</TableHead>
                                    <TableHead className="text-center">إجمالي الصافي</TableHead>
                                    <TableHead className="text-center">المسدد</TableHead>
                                    <TableHead className="text-center">المتبقي</TableHead>
                                    <TableHead className="text-center">الحالة</TableHead>
                                    <TableHead className="text-center">إجراءات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedOrders.map((order) => (
                                    <TableRow key={order.uniqueKey || order.id} className={cn(order.status === 'Cancelled' && "bg-destructive/5 opacity-80", "hover:bg-muted/30")}>
                                        <TableCell className="text-center font-mono font-bold text-primary">{order.orderCode}</TableCell>
                                        <TableCell className="text-center"><OrderItemsPreviewDialog items={order.items || []} /></TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="font-medium text-sm">{order.customerName}</span>
                                                {order.customerPhone && <span dir="ltr" className="text-[10px] text-muted-foreground font-mono">{order.customerPhone}</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center text-[10px]">{order.branchName}</TableCell>
                                        <TableCell className="text-center text-[10px] font-mono whitespace-nowrap">{formatDate(order.orderDate)}</TableCell>
                                        <TableCell className="text-center font-mono font-bold">{Math.round(order.total).toLocaleString()}</TableCell>
                                        <TableCell className="text-center font-mono text-green-600">{Math.round(order.paid).toLocaleString()}</TableCell>
                                        <TableCell className={cn("text-center font-mono font-black", order.remainingAmount > 0 ? "text-destructive" : "text-green-600")}>
                                            {Math.round(order.remainingAmount).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-center">{getStatusComponent(order)}</TableCell>
                                        <TableCell className="text-center">
                                            <OrderDetailsDialog orderId={order.id} order={order}><Button variant="outline" size="sm" className="h-8 gap-1"><Eye className="h-3.5 w-3.5" />عرض</Button></OrderDetailsDialog>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <div className={cn("grid gap-4 md:hidden transition-opacity duration-200", isPending && "opacity-50")}>
                    {paginatedOrders.map((order) => (
                        <Card key={order.uniqueKey || order.id} className="overflow-hidden">
                            <CardHeader className="p-4 pb-2 bg-muted/20">
                                <div className="flex items-center justify-between">
                                    <span className="font-mono font-bold text-primary">{order.orderCode}</span>
                                    <div className="flex flex-col items-end">
                                        <span className="font-bold text-lg">{Math.round(order.total).toLocaleString()} ج.م</span>
                                        <span className="text-[10px] text-muted-foreground">{order.branchName}</span>
                                    </div>
                                </div>
                                <p className="text-sm font-bold text-right mt-1">{order.customerName}</p>
                            </CardHeader>
                            <CardContent className="p-4 pt-4 flex justify-between items-center">
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-3">
                                        <OrderItemsPreviewDialog items={order.items || []} />
                                        <span className="text-[9px] text-muted-foreground font-mono">{formatDate(order.orderDate)}</span>
                                    </div>
                                    <div className="flex gap-2 text-[10px]">
                                        <span className="text-green-600 font-bold">المسدد: {Math.round(order.paid)}</span>
                                        <span className={cn("font-black", order.remainingAmount > 0 ? "text-destructive" : "text-green-600")}>المتبقي: {Math.round(order.remainingAmount)}</span>
                                    </div>
                                </div>
                                {getStatusComponent(order)}
                            </CardContent>
                            <CardFooter className="p-2 pt-0">
                                <OrderDetailsDialog orderId={order.id} order={order}><Button variant="ghost" size="sm" className="w-full text-xs h-9 border-t rounded-none">عرض كامل التفاصيل</Button></OrderDetailsDialog>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
                
                {totalPages > 1 && (
                    <div className="py-4 border-t">
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        disabled={currentPage <= 1} 
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        className="gap-1 px-3"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                        السابق
                                    </Button>
                                </PaginationItem>
                                <PaginationItem>
                                    <span className="px-4 py-2 font-mono text-sm font-bold bg-muted rounded-md border">
                                        صفحة {currentPage} من {totalPages}
                                    </span>
                                </PaginationItem>
                                <PaginationItem>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        disabled={currentPage >= totalPages} 
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        className="gap-1 px-3"
                                    >
                                        التالي
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    </div>
                )}
             </div>
        )
      }
    </div>
  );
}

export default function OrdersPage() {
    return (
        <AuthLayout>
            <AuthGuard>
                <OrdersPageContent />
            </AuthGuard>
        </AuthLayout>
    )
}
