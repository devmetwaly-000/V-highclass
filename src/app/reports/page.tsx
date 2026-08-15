'use client';

import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { 
    BarChart3, 
    UserCheck, 
    Landmark, 
    Banknote, 
    PackageSearch, 
    TrendingUp, 
    TrendingDown, 
    History,
    Wrench,
    Archive,
    ShoppingCart,
    Repeat,
    AlertTriangle,
    BadgePercent,
    CircleDollarSign,
    ArrowUpRight,
    XCircle,
    HandCoins,
    MapPin,
    LockKeyhole,
    ArchiveX,
    Search,
    FileSearch,
    Undo2
} from 'lucide-react';
import Link from 'next/link';
import { AuthLayout } from '@/components/app-layout';
import { useUser } from '@/firebase';
import { useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';

const reportTypes = [
  {
    title: 'ملخصات الفروع',
    description: 'تقارير مجمعة لأداء كل فرع.',
    icon: Landmark,
    href: '/reports/branch-summary',
    permission: 'reports:branch-summary',
  },
  {
    title: 'أداء البائعين',
    description: 'تتبع مبيعات وإيجارات كل بائع.',
    icon: UserCheck,
    href: '/reports/seller-performance',
    permission: 'reports:seller-performance',
  },
  {
    title: 'أداء المناطق',
    description: 'تحليل المبيعات والأرباح حسب التوزيع الجغرافي.',
    icon: MapPin,
    href: '/reports/region-performance',
    permission: 'reports:region-performance',
  },
  {
    title: 'السجل المالي للورديات',
    description: 'عرض كافة المعاملات المالية وملخصات المستخدمين.',
    icon: Banknote,
    href: '/reports/financial-log',
    permission: 'reports:financial-log',
  },
  {
    title: 'مستحقات العملاء',
    description: 'تقرير بالمبالغ المتبقية والديون المستحقة على العملاء.',
    icon: HandCoins,
    href: '/reports/customer-receivables',
    permission: 'reports:customer-receivables',
  },
  {
    title: 'تقرير الخصومات',
    description: 'عرض وتحليل جميع الخصومات المطبقة.',
    icon: BadgePercent,
    href: '/reports/discounts',
    permission: 'reports:discounts',
  },
  {
    title: 'انحراف الأسعار',
    description: 'تقرير بالطلبات التي تم فيها رفع أو خفض سعر الأصناف.',
    icon: ArrowUpRight,
    href: '/reports/price-deviations',
    permission: 'reports:price-deviations',
  },
  {
    title: 'أداء المنتجات العام',
    description: 'تحليل شامل لمبيعات وإيجارات كل المنتجات.',
    icon: BarChart3,
    href: '/reports/product-performance',
    permission: 'reports:product-performance',
  },
  {
    title: 'الأصناف الأكثر مبيعًا',
    description: 'عرض المنتجات الأعلى من حيث عدد مرات البيع.',
    icon: TrendingUp,
    href: '/reports/top-selling-products',
    permission: 'reports:top-selling-products',
  },
   {
    title: 'الأصناف الأكثر إيجارًا',
    description: 'عرض المنتجات الأعلى من حيث عدد مرات الإيجار.',
    icon: Repeat,
    href: '/reports/top-rented-products',
    permission: 'reports:top-rented-products',
  },
  {
    title: 'الأصناف الراكدة',
    description: 'المنتجات التي لم يتم بيعها أو تأجيرها لفترة.',
    icon: TrendingDown,
    href: '/reports/stagnant-products',
    permission: 'reports:stagnant-products',
  },
  {
    title: 'الأصناف ذات الرصيد صفر',
    description: 'تقرير بجميع النواقص والأصناف التي نفدت من المخزن.',
    icon: ArchiveX,
    href: '/reports/out-of-stock',
    permission: 'reports:inventory-summary',
  },
  {
    title: 'الطلبات المتأخرة',
    description: 'عرض طلبات الإيجار التي تجاوزت تاريخ الإرجاع.',
    icon: AlertTriangle,
    href: '/reports/overdue-orders',
    permission: 'reports:overdue-orders',
  },
  {
    title: 'المرتجعات المستلمة',
    description: 'سجل المرتجعات التي تم استلامها من العملاء وحالتها.',
    icon: Undo2,
    href: '/reports/rental-returns',
    permission: 'reports:rental-returns',
  },
  {
    title: 'الطلبات الملغاة',
    description: 'سجل الطلبات التي تم إلغاؤها وأسباب الإلغاء.',
    icon: XCircle,
    href: '/reports/cancelled-orders',
    permission: 'reports:cancelled-orders',
  },
  {
    title: 'حركة مخزون صنف',
    description: 'تتبع تاريخ التغييرات في مخزون منتج معين.',
    icon: History,
    href: '/reports/inventory-history',
    permission: 'reports:inventory-history',
  },
  {
    title: 'أصناف تحتاج صيانة',
    description: 'قائمة بالمنتجات التي تم تأجيرها بكثرة.',
    icon: Wrench,
    href: '/reports/maintenance-required',
    permission: 'reports:maintenance-required',
  },
   {
    title: 'ملخص المخزون الحالي',
    description: 'نظرة عامة على كميات جميع الأصناف في المخزن.',
    icon: Archive,
    href: '/inventory-summary',
    permission: 'reports:inventory-summary',
  },
  {
    title: 'مبيعات حسب الفئة',
    description: 'تحليل المبيعات بناءً على فئات المنتجات.',
    icon: ShoppingCart,
    href: '/reports/sales-by-category',
    permission: 'reports:sales-by-category',
  },
  {
    title: 'تكلفة المخزون',
    description: 'عرض وتعديل أسعار التكلفة للمنتجات وحساب قيمة المخزون.',
    icon: CircleDollarSign,
    href: '/inventory-cost',
    permission: 'reports:inventory-cost',
  },
  {
    title: 'بيانات دخول المستخدمين',
    description: 'تقرير بأسماء المستخدمين وكلمات السر (للمدير فقط).',
    icon: LockKeyhole,
    href: '/reports/user-credentials',
    permission: 'reports:user-credentials',
  },
];

function ReportsPageContent() {
  const { appUser, isUserLoading } = useUser();
  const [searchTerm, setSearchTerm] = useState('');

  const visibleReports = useMemo(() => {
    if (!appUser) return [];
    const userPermissions = appUser.permissions || [];
    const isAdmin = userPermissions.includes('all') || appUser.username === 'admin' || appUser.role === 'admin';
    
    if (!isAdmin && !userPermissions.includes('reports:view')) {
      return [];
    }
    
    const initialVisible = reportTypes.filter(report => isAdmin || userPermissions.includes(report.permission));

    if (!searchTerm.trim()) return initialVisible;

    const q = searchTerm.toLowerCase().trim();
    return initialVisible.filter(report => 
        report.title.toLowerCase().includes(q) || 
        report.description.toLowerCase().includes(q)
    );
  }, [appUser, searchTerm]);

  if (isUserLoading) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="التقارير" showBackButton />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(9)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="التقارير" showBackButton>
        <div className="relative w-full md:w-80">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
                placeholder="ابحث عن تقرير..." 
                className="pr-9 h-10 border-primary/20"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
      </PageHeader>

      {visibleReports.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleReports.map((report) => (
            <Link href={report.href} key={report.title} className="flex">
                <Card className="hover:bg-accent/10 hover:shadow-md transition-all w-full flex flex-col border-primary/20">
                <CardHeader className="flex-grow">
                    <div className="flex items-start gap-4">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                        <report.icon className="h-6 w-6" />
                    </div>
                    <div className="space-y-1 text-right">
                        <CardTitle className="font-headline text-lg">
                        {report.title}
                        </CardTitle>
                        <CardDescription>{report.description}</CardDescription>
                    </div>
                    </div>
                </CardHeader>
                </Card>
            </Link>
            ))}
        </div>
      ) : (
        <Card className="border-dashed">
            <CardContent className="h-64 flex flex-col items-center justify-center text-muted-foreground gap-3">
                {searchTerm ? (
                    <>
                        <FileSearch className="h-12 w-12 opacity-10" />
                        <p className="font-medium">لم يتم العثور على تقارير تطابق "{searchTerm}"</p>
                    </>
                ) : (
                    <p>ليس لديك صلاحية لعرض أي تقارير.</p>
                )}
            </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ReportsPage() {
    return (
        <AuthLayout>
            <ReportsPageContent />
        </AuthLayout>
    )
}
