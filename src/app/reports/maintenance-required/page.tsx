
'use client';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Product, Branch } from '@/lib/definitions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wrench } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { useRtdbList } from '@/hooks/use-rtdb';
import { Skeleton } from '@/components/ui/skeleton';
import { AppLayout } from '@/components/app-layout';

const MAINTENANCE_THRESHOLD = 5; // Default threshold

function MaintenanceRequiredPageContent() {
    const [threshold, setThreshold] = useState(MAINTENANCE_THRESHOLD);
    const [selectedBranch, setSelectedBranch] = useState<string>('all');
    const { data: products, isLoading: loadingProducts } = useRtdbList<Product>('products');
    const { data: branches, isLoading: loadingBranches } = useRtdbList<Branch>('branches');
    const isLoading = loadingProducts || loadingBranches;

    const productsNeedingMaintenance = useMemo(() => {
        if (isLoading) return [];
        return [...products]
            .filter(p => {
                if (p.category !== 'rental' || (p.rentalCount || 0) < threshold) return false;
                if (selectedBranch !== 'all' && p.branchId && p.branchId !== selectedBranch) return false;
                return true;
            })
            .sort((a, b) => (b.rentalCount || 0) - (a.rentalCount || 0));
    }, [products, threshold, isLoading, selectedBranch]);


  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="تقرير أصناف تحتاج صيانة" showBackButton />

      <Card>
        <CardHeader>
             <div className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-primary" />
                <CardTitle>أصناف تحتاج صيانة</CardTitle>
            </div>
            <CardDescription>
                قائمة بالمنتجات التي تم تأجيرها عددًا محددًا من المرات وقد تحتاج إلى فحص أو صيانة.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mb-6">
                <div>
                    <Label>الفرع</Label>
                    <Select value={selectedBranch} onValueChange={setSelectedBranch} disabled={loadingBranches}>
                        <SelectTrigger className="mt-2"><SelectValue placeholder="كل الفروع" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">كل الفروع</SelectItem>
                            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label htmlFor="threshold">مرات الإيجار الأكثر من:</Label>
                    <Input 
                        id="threshold" 
                        type="number" 
                        value={threshold}
                        onChange={(e) => setThreshold(parseInt(e.target.value) || 0)}
                        className="mt-2"
                    />
                </div>
            </div>
             <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المنتج</TableHead>
                <TableHead className="text-center">كود المنتج</TableHead>
                <TableHead className="text-center">عدد مرات الإيجار</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24 mx-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 mx-auto" /></TableCell>
                </TableRow>
              ))}
              {!isLoading && productsNeedingMaintenance.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Link href={`/products/${product.id}`} className="font-medium hover:underline">
                        {product.name} - {product.size}
                    </Link>
                  </TableCell>
                  <TableCell className="text-center font-mono">{product.productCode}</TableCell>
                  <TableCell className="text-center font-mono font-bold text-lg text-destructive">{product.rentalCount}</TableCell>
                </TableRow>
              ))}
               {!isLoading && productsNeedingMaintenance.length === 0 && (
                <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                        لا توجد أصناف تحتاج صيانة حسب الحد المحدد.
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

export default function MaintenanceRequiredPage() {
    return (
        <AppLayout>
            <MaintenanceRequiredPageContent />
        </AppLayout>
    )
}

    