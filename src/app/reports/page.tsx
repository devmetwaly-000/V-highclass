'use client';

import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
    Undo2,
    ShieldAlert,
    AlertCircle,
    CheckCircle2,
    Layers
} from 'lucide-react';
import Link from 'next/link';
import { AuthLayout } from '@/components/app-layout';
import { useUser } from '@/firebase';
import { useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export type ReportCategory = 'financial' | 'sales' | 'control' | 'inventory' | 'system';

export type ReportItem = {
    title: string;
    description: string;
    icon: any;
    href: string;
    permission: string;
    category: ReportCategory;
    categoryName: string;
    highlightBadge?: string;
    borderClass: string;
    iconClass: string;
    badgeClass: string;
};

const reportTypes: ReportItem[] = [
  // ─── 1. تقارير الرقابة والمشكلات والتنبيهات (أحمر قرمزي) ───
  {
    title: 'تقرير المشكلات والفواتير المعلقة',
    description: 'كشف الفواتير التي سُجل لها مرتجع دفعات وما زالت نشطة وتحتاج تسوية وحل فوري.',
    icon: ShieldAlert,
    href: '/reports/cancelled-orders',
    permission: 'reports:cancelled-orders',
    category: 'control',
    categoryName: 'رقابة ومشكلات',
    highlightBadge: 'فواتير بحاجة لتسوية',
    borderClass: 'border-rose-500/60 hover:border-rose-500 bg-rose-500/[0.04]',
    iconClass: 'bg-rose-500/15 text-rose-500',
    badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 font-bold',
  },
  {
    title: 'الطلبات المتأخرة',
    description: 'عرض طلبات الإيجار التي تجاوزت تاريخ الإرجاع المحدد ولم تُستلم.',
    icon: AlertTriangle,
    href: '/reports/overdue-orders',
    permission: 'reports:overdue-orders',
    category: 'control',
    categoryName: 'رقابة وتنبيهات',
    borderClass: 'border-rose-500/40 hover:border-rose-500 bg-rose-500/[0.02]',
    iconClass: 'bg-rose-500/10 text-rose-500',
    badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  },
  {
    title: 'الطلبات الملغاة',
    description: 'سجل الطلبات التي تم إلغاؤها وأسباب الإلغاء وتفاصيل الاسترداد.',
    icon: XCircle,
    href: '/reports/cancelled-orders',
    permission: 'reports:cancelled-orders',
    category: 'control',
    categoryName: 'رقابة وإلغاءات',
    borderClass: 'border-rose-500/40 hover:border-rose-500 bg-rose-500/[0.02]',
    iconClass: 'bg-rose-500/10 text-rose-500',
    badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  },
  {
    title: 'انحراف الأسعار',
    description: 'تقرير بالطلبات التي تم فيها رفع أو خفض سعر الأصناف عن الكتالوج.',
    icon: ArrowUpRight,
    href: '/reports/price-deviations',
    permission: 'reports:price-deviations',
    category: 'control',
    categoryName: 'رقابة أسعار',
    borderClass: 'border-rose-500/40 hover:border-rose-500 bg-rose-500/[0.02]',
    iconClass: 'bg-rose-500/10 text-rose-500',
    badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  },
  {
    title: 'المرتجعات المستلمة',
    description: 'سجل المرتجعات التي تم استلامها من العملاء وحالتها.',
    icon: Undo2,
    href: '/reports/rental-returns',
    permission: 'reports:rental-returns',
    category: 'control',
    categoryName: 'مرتجعات وفحص',
    borderClass: 'border-rose-500/40 hover:border-rose-500 bg-rose-500/[0.02]',
    iconClass: 'bg-rose-500/10 text-rose-500',
    badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  },
  {
    title: 'أصناف تحتاج صيانة',
    description: 'قائمة بالمنتجات التي تم تأجيرها بكثرة وتحتاج فحصاً وصيانة.',
    icon: Wrench,
    href: '/reports/maintenance-required',
    permission: 'reports:maintenance-required',
    category: 'control',
    categoryName: 'صيانة وفحص',
    borderClass: 'border-rose-500/40 hover:border-rose-500 bg-rose-500/[0.02]',
    iconClass: 'bg-rose-500/10 text-rose-500',
    badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  },

  // ─── 2. التقارير المالية والسيولة (أخضر زمردي) ───
  {
    title: 'السجل المالي للورديات',
    description: 'عرض كافة المعاملات المالية النقدية والمقبوضات وملخصات الكاشير.',
    icon: Banknote,
    href: '/reports/financial-log',
    permission: 'reports:financial-log',
    category: 'financial',
    categoryName: 'مالية وسيولة',
    borderClass: 'border-emerald-500/40 hover:border-emerald-500 bg-emerald-500/[0.02]',
    iconClass: 'bg-emerald-500/10 text-emerald-500',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  {
    title: 'مستحقات العملاء',
    description: 'تقرير بالمبالغ المتبقية والديون المستحقة المتراكمة على العملاء.',
    icon: HandCoins,
    href: '/reports/customer-receivables',
    permission: 'reports:customer-receivables',
    category: 'financial',
    categoryName: 'ديون وآجل',
    borderClass: 'border-emerald-500/40 hover:border-emerald-500 bg-emerald-500/[0.02]',
    iconClass: 'bg-emerald-500/10 text-emerald-500',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  {
    title: 'تقرير الخصومات',
    description: 'عرض وتحليل جميع الخصومات المطبقة على الطلبات.',
    icon: BadgePercent,
    href: '/reports/discounts',
    permission: 'reports:discounts',
    category: 'financial',
    categoryName: 'خصومات',
    borderClass: 'border-emerald-500/40 hover:border-emerald-500 bg-emerald-500/[0.02]',
    iconClass: 'bg-emerald-500/10 text-emerald-500',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  {
    title: 'تكلفة المخزون',
    description: 'عرض وتعديل أسعار التكلفة للمنتجات وحساب قيمة المخزون الإجمالية.',
    icon: CircleDollarSign,
    href: '/inventory-cost',
    permission: 'reports:inventory-cost',
    category: 'financial',
    categoryName: 'تكاليف ومخزون',
    borderClass: 'border-emerald-500/40 hover:border-emerald-500 bg-emerald-500/[0.02]',
    iconClass: 'bg-emerald-500/10 text-emerald-500',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },

  // ─── 3. تقارير أداء المبيعات والفروع (بنفسجي نيلي) ───
  {
    title: 'ملخصات الفروع',
    description: 'تقارير مجمعة لأداء كل فرع وإيرادات البيع والإيجار.',
    icon: Landmark,
    href: '/reports/branch-summary',
    permission: 'reports:branch-summary',
    category: 'sales',
    categoryName: 'أداء فروع',
    borderClass: 'border-indigo-500/40 hover:border-indigo-500 bg-indigo-500/[0.02]',
    iconClass: 'bg-indigo-500/10 text-indigo-500',
    badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  },
  {
    title: 'أداء البائعين',
    description: 'تتبع مبيعات وإيجارات كل بائع وحساب العمولات بعد المرتجعات.',
    icon: UserCheck,
    href: '/reports/seller-performance',
    permission: 'reports:seller-performance',
    category: 'sales',
    categoryName: 'أداء بائعين',
    borderClass: 'border-indigo-500/40 hover:border-indigo-500 bg-indigo-500/[0.02]',
    iconClass: 'bg-indigo-500/10 text-indigo-500',
    badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  },
  {
    title: 'أداء المناطق',
    description: 'تحليل المبيعات والإيرادات والأرباح حسب التوزيع الجغرافي.',
    icon: MapPin,
    href: '/reports/region-performance',
    permission: 'reports:region-performance',
    category: 'sales',
    categoryName: 'توزيع جغرافي',
    borderClass: 'border-indigo-500/40 hover:border-indigo-500 bg-indigo-500/[0.02]',
    iconClass: 'bg-indigo-500/10 text-indigo-500',
    badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  },
  {
    title: 'أداء المنتجات العام',
    description: 'تحليل شامل لمبيعات وإيجارات كل المنتجات والقطع.',
    icon: BarChart3,
    href: '/reports/product-performance',
    permission: 'reports:product-performance',
    category: 'sales',
    categoryName: 'حركة منتجات',
    borderClass: 'border-indigo-500/40 hover:border-indigo-500 bg-indigo-500/[0.02]',
    iconClass: 'bg-indigo-500/10 text-indigo-500',
    badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  },
  {
    title: 'مبيعات حسب الفئة',
    description: 'تحليل المبيعات والإيرادات بناءً على فئات ومجموعات المنتجات.',
    icon: ShoppingCart,
    href: '/reports/sales-by-category',
    permission: 'reports:sales-by-category',
    category: 'sales',
    categoryName: 'فئات أصناف',
    borderClass: 'border-indigo-500/40 hover:border-indigo-500 bg-indigo-500/[0.02]',
    iconClass: 'bg-indigo-500/10 text-indigo-500',
    badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  },

  // ─── 4. تقارير المخزون وحركة الأصناف (عنبري برتقالي) ───
  {
    title: 'الأصناف الأكثر مبيعًا',
    description: 'عرض المنتجات الأعلى من حيث عدد مرات البيع الفعلي.',
    icon: TrendingUp,
    href: '/reports/top-selling-products',
    permission: 'reports:top-selling-products',
    category: 'inventory',
    categoryName: 'مخزون وطلب',
    borderClass: 'border-amber-500/40 hover:border-amber-500 bg-amber-500/[0.02]',
    iconClass: 'bg-amber-500/10 text-amber-500',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  {
    title: 'الأصناف الأكثر إيجارًا',
    description: 'عرض المنتجات والفساتين الأكثر طلباً للتأجير.',
    icon: Repeat,
    href: '/reports/top-rented-products',
    permission: 'reports:top-rented-products',
    category: 'inventory',
    categoryName: 'مخزون وطلب',
    borderClass: 'border-amber-500/40 hover:border-amber-500 bg-amber-500/[0.02]',
    iconClass: 'bg-amber-500/10 text-amber-500',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  {
    title: 'الأصناف الراكدة',
    description: 'المنتجات التي لم يتم بيعها أو تأجيرها لفترة طويلة.',
    icon: TrendingDown,
    href: '/reports/stagnant-products',
    permission: 'reports:stagnant-products',
    category: 'inventory',
    categoryName: 'ركود مخزون',
    borderClass: 'border-amber-500/40 hover:border-amber-500 bg-amber-500/[0.02]',
    iconClass: 'bg-amber-500/10 text-amber-500',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  {
    title: 'الأصناف ذات الرصيد صفر',
    description: 'تقرير بجميع النواقص والأصناف التي نفدت كمياتها من المخزن.',
    icon: ArchiveX,
    href: '/reports/out-of-stock',
    permission: 'reports:inventory-summary',
    category: 'inventory',
    categoryName: 'نواقص',
    borderClass: 'border-amber-500/40 hover:border-amber-500 bg-amber-500/[0.02]',
    iconClass: 'bg-amber-500/10 text-amber-500',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  {
    title: 'حركة مخزون صنف',
    description: 'تتبع تاريخ التغييرات والحركات الواردة والصادرة لمنتج معين.',
    icon: History,
    href: '/reports/inventory-history',
    permission: 'reports:inventory-history',
    category: 'inventory',
    categoryName: 'حركة صنف',
    borderClass: 'border-amber-500/40 hover:border-amber-500 bg-amber-500/[0.02]',
    iconClass: 'bg-amber-500/10 text-amber-500',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  {
    title: 'ملخص المخزون الحالي',
    description: 'نظرة عامة على كميات جميع الأصناف والفساتين في المخزن.',
    icon: Archive,
    href: '/inventory-summary',
    permission: 'reports:inventory-summary',
    category: 'inventory',
    categoryName: 'جرد مخزن',
    borderClass: 'border-amber-500/40 hover:border-amber-500 bg-amber-500/[0.02]',
    iconClass: 'bg-amber-500/10 text-amber-500',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },

  // ─── 5. تقارير النظام والأمان (رمادي أردوازي) ───
  {
    title: 'بيانات دخول المستخدمين',
    description: 'تقرير بأسماء المستخدمين وكلمات السر (للمدير فقط).',
    icon: LockKeyhole,
    href: '/reports/user-credentials',
    permission: 'reports:user-credentials',
    category: 'system',
    categoryName: 'نظام وأمان',
    borderClass: 'border-slate-500/40 hover:border-slate-500 bg-slate-500/[0.02]',
    iconClass: 'bg-slate-500/10 text-slate-500',
    badgeClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
  },
];

const CATEGORY_TABS = [
    { id: 'all', label: 'كافة التقارير', color: 'border-primary' },
    { id: 'control', label: 'الرقابة والمشكلات', countColor: 'text-rose-500', color: 'border-rose-500' },
    { id: 'financial', label: 'المالية والسيولة', countColor: 'text-emerald-500', color: 'border-emerald-500' },
    { id: 'sales', label: 'أداء المبيعات', countColor: 'text-indigo-500', color: 'border-indigo-500' },
    { id: 'inventory', label: 'المخزون والأصناف', countColor: 'text-amber-500', color: 'border-amber-500' },
    { id: 'system', label: 'النظام والأمان', countColor: 'text-slate-500', color: 'border-slate-500' },
];

function ReportsPageContent() {
  const { appUser, isUserLoading } = useUser();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const visibleReports = useMemo(() => {
    if (!appUser) return [];
    const userPermissions = appUser.permissions || [];
    const isAdmin = userPermissions.includes('all') || appUser.username === 'admin' || appUser.role === 'admin';
    
    if (!isAdmin && !userPermissions.includes('reports:view')) {
      return [];
    }
    
    let filtered = reportTypes.filter(report => isAdmin || userPermissions.includes(report.permission));

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(report => report.category === selectedCategory);
    }

    if (!searchTerm.trim()) return filtered;

    const q = searchTerm.toLowerCase().trim();
    return filtered.filter(report => 
        report.title.toLowerCase().includes(q) || 
        report.description.toLowerCase().includes(q) ||
        report.categoryName.toLowerCase().includes(q)
    );
  }, [appUser, searchTerm, selectedCategory]);

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
    <div className="flex flex-col gap-6 md:gap-8">
      <PageHeader title="دليل التقارير والرقابة" showBackButton>
        <div className="relative w-full md:w-80">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
                placeholder="ابحث عن تقرير أو فئة..." 
                className="pr-9 h-10 border-primary/20"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
      </PageHeader>

      {/* شريط تصنيف وتبويب المجموعات بالألوان */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        {CATEGORY_TABS.map((tab) => {
          const isActive = selectedCategory === tab.id;
          return (
            <Button
              key={tab.id}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(tab.id)}
              className={`rounded-full text-xs font-bold shrink-0 transition-all ${
                !isActive ? `hover:${tab.color} border-muted-foreground/20` : ''
              }`}
            >
              {tab.label}
            </Button>
          );
        })}
      </div>

      {visibleReports.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleReports.map((report) => (
            <Link href={report.href} key={report.title} className="flex group">
                <Card className={`hover:shadow-lg transition-all w-full flex flex-col border-2 ${report.borderClass}`}>
                <CardHeader className="flex-grow p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3 mb-2">
                        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-transform group-hover:scale-105 ${report.iconClass}`}>
                            <report.icon className="h-5 w-5" />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 justify-end">
                            {report.highlightBadge && (
                                <Badge variant="destructive" className="animate-pulse text-[10px] px-2 py-0.5">
                                    {report.highlightBadge}
                                </Badge>
                            )}
                            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${report.badgeClass}`}>
                                {report.categoryName}
                            </Badge>
                        </div>
                    </div>
                    <div className="space-y-1 text-right mt-1">
                        <CardTitle className="font-headline text-base font-bold group-hover:text-primary transition-colors">
                            {report.title}
                        </CardTitle>
                        <CardDescription className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
                            {report.description}
                        </CardDescription>
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
                    <p>ليس لديك صلاحية لعرض أي تقارير في هذا التصنيف.</p>
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
