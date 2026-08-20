'use client';

import React, { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { AppLayout, AuthGuard } from '@/components/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArchiveX, Package, Search, Filter, Hash, Store, EyeOff, Loader2, Tags, Ruler, ShoppingBag } from 'lucide-react';
import { useRtdbList } from '@/hooks/use-rtdb';
import type { Product, Branch } from '@/lib/definitions';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useDatabase } from '@/firebase';
import { ref, update } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';
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

function OutOfStockReportContent() {
  const db = useDatabase();
  const { toast } = useToast();
  const { data: products, isLoading: isLoadingProducts } = useRtdbList<Product>('products');
  const { data: branches } = useRtdbList<Branch>('branches');
  const { data: rawProductGroups } = useRtdbList<{name: string}>('productGroups');
  const { data: rawSizes } = useRtdbList<{name: string}>('sizes');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [selectedSize, setSelectedSize] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Ensure unique names for filter options to avoid duplicate key errors
  const productGroups = useMemo(() => 
    Array.from(new Set(rawProductGroups.map(g => g.name).filter(Boolean))).sort()
  , [rawProductGroups]);

  const sizes = useMemo(() => 
    Array.from(new Set(rawSizes.map(s => s.name).filter(Boolean))).sort()
  , [rawSizes]);

  const outOfStockItems = useMemo(() => {
    // عرض فقط المنتجات غير المخفية والتي رصيدها صفر وتطابق الفلاتر
    return products.filter(p => {
        const isNotHidden = !p.isHidden;
        const isOutOfStock = (Number(p.quantityInStock) || 0) <= 0;
        
        const matchesSearch = !searchTerm.trim() || 
            p.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
            p.productCode?.toLowerCase().includes(searchTerm.toLowerCase());
            
        const matchesGroup = selectedGroup === 'all' || p.group === selectedGroup;
        const matchesSize = selectedSize === 'all' || p.size === selectedSize;
        const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;

        return isNotHidden && isOutOfStock && matchesSearch && matchesGroup && matchesSize && matchesCategory;
    }).sort((a, b) => (a.group || '').localeCompare(b.group || ''));
  }, [products, searchTerm, selectedGroup, selectedSize, selectedCategory]);

  const handleHideProduct = async (productId: string, productName: string) => {
    if (!db) return;
    setProcessingId(productId);
    try {
      await update(ref(db, `products/${productId}`), {
        isHidden: true,
        updatedAt: new Date().toISOString()
      });
      toast({
        title: "تم إخفاء الصنف",
        description: `تم إخفاء "${productName}" من البيع والتقارير بنجاح.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "خطأ في الإخفاء",
        description: error.message,
      });
    } finally {
      setProcessingId(null);
    }
  };

  const getBranchName = (branchId: string) => branches.find(b => b.id === branchId)?.name || 'كل الفروع';

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'sale': return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">بيع</Badge>;
      case 'rental': return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">إيجار</Badge>;
      case 'both': return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">بيع/إيجار</Badge>;
      default: return <Badge variant="outline">{category}</Badge>;
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="تقرير الأصناف ذات الرصيد صفر" showBackButton />

      <Card>
          <CardHeader className="pb-3 text-right">
              <div className="flex items-center gap-2 justify-end">
                  <CardTitle className="text-lg">تصفية النتائج</CardTitle>
                  <Filter className="h-5 w-5 text-primary" />
              </div>
              <CardDescription>هذا التقرير يعرض الأصناف النشطة (غير المخفية) التي نفد مخزونها تماماً.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2 text-right">
                  <Label>بحث بالاسم أو الكود</Label>
                  <div className="relative">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        placeholder="ابحث هنا..." 
                        className="pr-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                  </div>
              </div>

              <div className="space-y-2 text-right">
                  <Label className="flex items-center gap-2 justify-end"><ShoppingBag className="h-3 w-3 text-muted-foreground" /> نوع المعاملة</Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger>
                          <SelectValue placeholder="كل الأنواع" />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="all">كل الأنواع</SelectItem>
                          <SelectItem value="sale">بيع فقط</SelectItem>
                          <SelectItem value="rental">إيجار فقط</SelectItem>
                          <SelectItem value="both">بيع وإيجار</SelectItem>
                      </SelectContent>
                  </Select>
              </div>

              <div className="space-y-2 text-right">
                  <Label className="flex items-center gap-2 justify-end"><Tags className="h-3 w-3 text-muted-foreground" /> تصفية بالمجموعة</Label>
                  <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                      <SelectTrigger>
                          <SelectValue placeholder="كل المجموعات" />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="all">كل المجموعات</SelectItem>
                          {productGroups.map(group => (
                              <SelectItem key={`group-${group}`} value={group}>{group}</SelectItem>
                          ))}
                      </SelectContent>
                  </Select>
              </div>

              <div className="space-y-2 text-right">
                  <Label className="flex items-center gap-2 justify-end"><Ruler className="h-3 w-3 text-muted-foreground" /> تصفية بالمقاس</Label>
                  <Select value={selectedSize} onValueChange={setSelectedSize}>
                      <SelectTrigger>
                          <SelectValue placeholder="كل المقاسات" />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="all">كل المقاسات</SelectItem>
                          {sizes.map(size => (
                              <SelectItem key={`size-${size}`} value={size}>{size}</SelectItem>
                          ))}
                      </SelectContent>
                  </Select>
              </div>
          </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ArchiveX className="h-5 w-5 text-destructive" />
            <CardTitle>قائمة النواقص (نفدت الكمية)</CardTitle>
          </div>
          <CardDescription>يتم عرض {outOfStockItems.length} صنف رصيدهم صفر حالياً.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">اسم المنتج</TableHead>
                <TableHead className="text-center">الكود</TableHead>
                <TableHead className="text-center">النوع</TableHead>
                <TableHead className="text-center">المجموعة</TableHead>
                <TableHead className="text-center">المقاس</TableHead>
                <TableHead className="text-center">الفرع</TableHead>
                <TableHead className="text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingProducts ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}><Skeleton className="h-10 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : outOfStockItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    لا توجد أصناف نشطة تطابق البحث ورصيدها صفر حالياً.
                  </TableCell>
                </TableRow>
              ) : (
                outOfStockItems.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-bold text-right">{p.name}</TableCell>
                    <TableCell className="text-center font-mono text-xs">{p.productCode}</TableCell>
                    <TableCell className="text-center">{getCategoryBadge(p.category)}</TableCell>
                    <TableCell className="text-center"><Badge variant="outline">{p.group || 'بدون'}</Badge></TableCell>
                    <TableCell className="text-center">{p.size}</TableCell>
                    <TableCell className="text-center text-xs">
                        <div className="flex items-center justify-center gap-1">
                            <Store className="h-3 w-3 opacity-50"/>
                            {getBranchName(p.branchId)}
                        </div>
                    </TableCell>
                    <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                            <Link href={`/products/${p.id}`}>
                                <Button variant="outline" size="sm">التفاصيل</Button>
                            </Link>
                            
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5">
                                        <EyeOff className="h-4 w-4" />
                                        إخفاء
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent dir="rtl" className="text-right">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>إخفاء الصنف نهائياً؟</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            هل أنت متأكد من رغبتك في إخفاء الصنف <span className="font-bold">"{p.name}"</span>؟
                                            <br />
                                            سيتم استبعاده من قائمة النواقص ولن يظهر في قائمة البيع، ولكن ستظل بياناته محفوظة في السجلات التاريخية.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter className="flex-row-reverse gap-2">
                                        <AlertDialogCancel>تراجع</AlertDialogCancel>
                                        <AlertDialogAction 
                                            className="bg-destructive hover:bg-destructive/90"
                                            onClick={() => handleHideProduct(p.id, p.name)}
                                            disabled={processingId === p.id}
                                        >
                                            {processingId === p.id ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
                                            تأكيد الإخفاء
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
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

export default function OutOfStockReport() {
    return (
        <AppLayout>
            <AuthGuard>
                <OutOfStockReportContent />
            </AuthGuard>
        </AppLayout>
    )
}
