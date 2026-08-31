"use client";

import { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  FileUp,
  Loader2,
  Search,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import { AppLayout, AuthGuard } from '@/components/app-layout';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { useRtdbList } from '@/hooks/use-rtdb';
import { usePermissions } from '@/hooks/use-permissions';
import { useDatabase, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/lib/definitions';
import { applyInventoryCount } from '@/lib/inventory-utils';
import { ImportInventoryDialog } from '@/components/import-inventory-dialog';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const ITEMS_PER_PAGE = 50;

function ProductInventoryPageContent() {
  const db = useDatabase();
  const { appUser } = useUser();
  const { toast } = useToast();
  const { permissions, isLoading: isLoadingPermissions } = usePermissions([
    'products:view',
    'products:add-stock',
    'products:import',
  ] as const);

  const { data: products, isLoading: loadingProducts } = useRtdbList<Product>('products');
  const { data: rawProductGroups } = useRtdbList<{ name: string }>('productGroups');

  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newQuantities, setNewQuantities] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const productGroups = useMemo(
    () => Array.from(new Set(rawProductGroups.map((g) => g.name).filter(Boolean))).sort(),
    [rawProductGroups]
  );

  const filteredProducts = useMemo(() => {
    let filtered = products.filter((p) => !p.isHidden);

    if (groupFilter !== 'all') {
      filtered = filtered.filter((p) => p.group === groupFilter);
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter((p) => p.category === typeFilter);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.productCode || '').toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [products, groupFilter, typeFilter, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [groupFilter, typeFilter, searchTerm]);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);

  const filteredIds = useMemo(() => filteredProducts.map((p) => p.id), [filteredProducts]);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someFilteredSelected = filteredIds.some((id) => selectedIds.has(id));

  const toggleProduct = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const handleQtyChange = (productId: string, value: string) => {
    setNewQuantities((prev) => ({ ...prev, [productId]: value }));
    if (value !== '') {
      setSelectedIds((prev) => new Set(prev).add(productId));
    }
  };

  const handleExcelImport = (entries: { productId: string; quantity: number }[]) => {
    const qtyUpdates: Record<string, string> = {};
    const ids = new Set<string>();
    entries.forEach(({ productId, quantity }) => {
      qtyUpdates[productId] = String(quantity);
      ids.add(productId);
    });
    setNewQuantities((prev) => ({ ...prev, ...qtyUpdates }));
    setSelectedIds((prev) => new Set([...prev, ...ids]));
  };

  const pendingUpdates = useMemo(() => {
    return Array.from(selectedIds)
      .map((id) => {
        const product = products.find((p) => p.id === id);
        if (!product) return null;
        const raw = newQuantities[id];
        if (raw === undefined || raw === '') return null;
        const qty = parseInt(raw, 10);
        if (!Number.isFinite(qty) || qty < 0) return null;
        if (qty === (product.quantityInStock || 0)) return null;
        return { product, newQty: qty };
      })
      .filter(Boolean) as { product: Product; newQty: number }[];
  }, [selectedIds, newQuantities, products]);

  const handleSubmit = async () => {
    if (!db || !appUser) {
      toast({ variant: 'destructive', title: 'خطأ', description: 'لم يتم العثور على المستخدم.' });
      return;
    }

    if (pendingUpdates.length === 0) {
      toast({
        variant: 'destructive',
        title: 'لا توجد تغييرات',
        description: 'اختر أصنافاً وأدخل كميات جديدة مختلفة عن الرصيد الحالي.',
      });
      return;
    }

    const invalid = Array.from(selectedIds).filter((id) => {
      const raw = newQuantities[id];
      if (raw === undefined || raw === '') return true;
      const qty = parseInt(raw, 10);
      return !Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty);
    });

    if (invalid.length > 0) {
      toast({
        variant: 'destructive',
        title: 'كميات غير صالحة',
        description: 'تأكد من إدخال أرقام صحيحة موجبة أو صفر لجميع الأصناف المحددة.',
      });
      return;
    }

    setIsSubmitting(true);
    let successCount = 0;
    const failed: string[] = [];

    for (const { product, newQty } of pendingUpdates) {
      try {
        await applyInventoryCount(db, product.id, newQty, appUser);
        successCount++;
      } catch {
        failed.push(product.name);
      }
    }

    if (successCount > 0) {
      toast({
        title: 'تم تنفيذ الجرد',
        description: `تم تحديث ${successCount} صنف بنجاح.`,
      });
      setSelectedIds(new Set());
      setNewQuantities({});
    }

    if (failed.length > 0) {
      toast({
        variant: 'destructive',
        title: 'فشل جزئي',
        description: `فشل تحديث: ${failed.slice(0, 3).join('، ')}${failed.length > 3 ? '...' : ''}`,
      });
    }

    setIsSubmitting(false);
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'sale':
        return <Badge variant="outline" className="bg-purple-50 border-purple-200 text-purple-700">بيع</Badge>;
      case 'rental':
        return <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700">إيجار</Badge>;
      case 'both':
        return <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700">بيع وإيجار</Badge>;
      default:
        return <Badge variant="outline">{category}</Badge>;
    }
  };

  const isLoading = loadingProducts || isLoadingPermissions;

  if (!isLoading && !permissions.canProductsView) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="جرد المخزون" showBackButton />
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm p-8">
          <div className="flex flex-col items-center gap-1 text-center">
            <ShieldAlert className="h-12 w-12 text-destructive" />
            <h3 className="text-2xl font-bold tracking-tight">غير مصرح لك</h3>
            <p className="text-sm text-muted-foreground">ليس لديك الصلاحية لعرض هذه الصفحة.</p>
            <Link href="/products">
              <Button className="mt-4">العودة إلى المنتجات</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="جرد المخزون" showBackButton>
        <div className="flex flex-wrap gap-2">
          {permissions.canProductsImport && (
            <ImportInventoryDialog
              products={products}
              onImportValidated={handleExcelImport}
              trigger={
                <Button variant="outline" size="sm" className="gap-1">
                  <FileUp className="h-4 w-4" />
                  استيراد Excel
                </Button>
              }
            />
          )}
          {permissions.canProductsAddStock && (
            <Button
              size="sm"
              className="gap-1"
              onClick={handleSubmit}
              disabled={isSubmitting || pendingUpdates.length === 0}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ClipboardList className="h-4 w-4" />
              )}
              تنفيذ الجرد ({pendingUpdates.length})
            </Button>
          )}
        </div>
      </PageHeader>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">فلترة الأصناف</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="search">بحث</Label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="اسم الصنف أو الكود..."
                className="pr-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="group">المجموعة</Label>
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger id="group">
                <SelectValue placeholder="كل المجموعات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المجموعات</SelectItem>
                {productGroups.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">النوع</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger id="type">
                <SelectValue placeholder="كل الأنواع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                <SelectItem value="sale">بيع</SelectItem>
                <SelectItem value="rental">إيجار</SelectItem>
                <SelectItem value="both">بيع وإيجار</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              onClick={toggleSelectAllFiltered}
              disabled={filteredProducts.length === 0}
            >
              {allFilteredSelected ? 'إلغاء تحديد الكل' : `تحديد الكل (${filteredProducts.length})`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleSelectAllFiltered}
                    aria-label="تحديد الكل"
                  />
                </TableHead>
                <TableHead>الكود</TableHead>
                <TableHead>اسم الصنف</TableHead>
                <TableHead>المجموعة</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead className="text-center">الرصيد الحالي</TableHead>
                <TableHead className="text-center w-28">الكمية الجديدة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-6 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : paginatedProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    لا توجد أصناف مطابقة للفلتر
                  </TableCell>
                </TableRow>
              ) : (
                paginatedProducts.map((product) => {
                  const isSelected = selectedIds.has(product.id);
                  const rawQty = newQuantities[product.id] ?? '';
                  const parsedQty = rawQty !== '' ? parseInt(rawQty, 10) : null;
                  const hasChange =
                    parsedQty !== null &&
                    Number.isFinite(parsedQty) &&
                    parsedQty !== (product.quantityInStock || 0);

                  return (
                    <TableRow
                      key={product.id}
                      className={cn(isSelected && 'bg-primary/5')}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleProduct(product.id)}
                          aria-label={`تحديد ${product.name}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{product.productCode}</TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.group || '-'}</TableCell>
                      <TableCell>{getCategoryBadge(product.category)}</TableCell>
                      <TableCell className="text-center font-bold">
                        {product.quantityInStock ?? 0}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          className={cn(
                            'text-center h-8',
                            hasChange && 'border-primary ring-1 ring-primary/30'
                          )}
                          placeholder="—"
                          value={rawQty}
                          onChange={(e) => handleQtyChange(product.id, e.target.value)}
                          disabled={!permissions.canProductsAddStock}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="px-4 text-sm text-muted-foreground">
                صفحة {currentPage} من {totalPages} ({filteredProducts.length} صنف)
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {permissions.canProductsAddStock && pendingUpdates.length > 0 && (
        <div className="sticky bottom-4 flex justify-center">
          <Button
            size="lg"
            className="gap-2 shadow-lg"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ClipboardList className="h-5 w-5" />
            )}
            تنفيذ الجرد — {pendingUpdates.length} صنف
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ProductInventoryPage() {
  return (
    <AppLayout>
      <AuthGuard>
        <ProductInventoryPageContent />
      </AuthGuard>
    </AppLayout>
  );
}
