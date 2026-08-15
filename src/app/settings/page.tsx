
'use client';

import React, { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { LayoutGrid, List, Printer, Scissors, Tags, PanelRight, Rows3, Database, CaseUpper, Shield, PackageX, SortAsc, SortDesc, EyeOff, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { AppLayout, AuthGuard } from '@/components/app-layout';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useSettings, type AppSettings } from '@/hooks/use-settings';
import { Switch } from '@/components/ui/switch';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';

function SettingsPageContent() {
    const { appUser, isUserLoading } = useUser();
    const router = useRouter();
    const { settings, isLoading, updateSettings } = useSettings();
    const [isMounted, setIsMounted] = useState(false);
    const { toast } = useToast();
    
    const [localSettings, setLocalSettings] = useState<Partial<AppSettings>>(settings);

    useEffect(() => {
        setIsMounted(true);
        // Sync local state with provider state when it changes
        setLocalSettings(settings);
    }, [settings]);
    
    const handleInputChange = (key: keyof AppSettings, value: any) => {
        setLocalSettings(prev => ({...prev, [key]: value}));
    };

    const handleSave = async () => {
        try {
            await updateSettings(localSettings);
            toast({
                title: "تم حفظ الإعدادات",
                description: "تم تحديث إعداداتك في قاعدة البيانات بنجاح.",
            });
            // Optional: Reload if a critical layout setting changed
            if (settings.navigationLayout !== localSettings.navigationLayout) {
                 setTimeout(() => window.location.reload(), 500);
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: "خطأ في الحفظ",
                description: "لم يتم حفظ الإعدادات: " + error.message,
            });
        }
    };
    
    const isDataLoading = !isMounted || isUserLoading || isLoading;

    if (isDataLoading) {
        return (
            <div className="flex flex-col gap-8">
              <PageHeader title="الإعدادات" showBackButton />
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <Skeleton className="h-7 w-1/3" />
                    <Skeleton className="h-4 w-2/3 mt-1" />
                  </CardHeader>
                  <CardContent className="grid gap-8">
                    <div className="space-y-4">
                       <Skeleton className="h-5 w-1/4" />
                       <div className="grid max-w-md grid-cols-2 gap-4">
                            <Skeleton className="h-24 w-full" />
                            <Skeleton className="h-24 w-full" />
                       </div>
                    </div>
                     <div className="space-y-4">
                       <Skeleton className="h-5 w-1/4" />
                       <div className="grid max-w-md gap-4">
                            <Skeleton className="h-10 w-full" />
                       </div>
                    </div>
                    <div className="space-y-4">
                       <Skeleton className="h-5 w-1/4" />
                       <div className="grid max-w-md grid-cols-2 gap-4">
                            <Skeleton className="h-24 w-full" />
                            <Skeleton className="h-24 w-full" />
                       </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <Skeleton className="h-7 w-1/3" />
                        <Skeleton className="h-4 w-2/3 mt-1" />
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                    </CardContent>
                </Card>
              </div>
            </div>
        );
    }
    
    if (!appUser || appUser.username !== 'admin') {
      return (
        <div className="flex flex-col gap-8">
            <PageHeader title="غير مصرح لك" showBackButton />
            <Card>
                <CardContent className="p-8 text-center text-muted-foreground flex flex-col items-center gap-4">
                    <Shield className="h-12 w-12 text-destructive" />
                    <p className="font-semibold">هذه الصفحة متاحة للمدير (admin) فقط.</p>
                    <Button onClick={() => router.push('/home')} className="mt-4">العودة إلى الرئيسية</Button>
                </CardContent>
            </Card>
        </div>
      );
    }


  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="الإعدادات" showBackButton>
        <Button onClick={handleSave}>حفظ الإعدادات</Button>
      </PageHeader>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>الإعدادات العامة والتخطيط</CardTitle>
            <CardDescription>
              تحكم في كيفية عرض العناصر وتخطيط الواجهة في التطبيق.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-8">
             <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <CaseUpper className="h-4 w-4 text-muted-foreground" />
                    <Label>اسم التطبيق</Label>
                </div>
                <Input
                    value={localSettings.appName}
                    onChange={(e) => handleInputChange('appName', e.target.value)}
                    placeholder="اكتب اسم التطبيق هنا..."
                    className="max-w-md"
                />
             </div>
            
            <Separator/>

             <div className="space-y-4">
              <div className="flex items-center gap-2">
                  <PanelRight className="h-4 w-4 text-muted-foreground" />
                  <Label>تخطيط القائمة الرئيسية</Label>
              </div>
               <RadioGroup
                value={localSettings.navigationLayout}
                onValueChange={(value) => handleInputChange('navigationLayout', value)}
                className="grid max-w-md grid-cols-2 gap-4"
              >
                <div>
                  <RadioGroupItem value="sidebar" id="sidebar" className="peer sr-only" />
                  <Label
                    htmlFor="sidebar"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                  >
                    <PanelRight className="mb-3 h-6 w-6" />
                    شريط جانبي
                  </Label>
                </div>
                <div>
                  <RadioGroupItem
                    value="topnav"
                    id="topnav"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="topnav"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                  >
                    <Rows3 className="mb-3 h-6 w-6" />
                    قائمة علوية
                  </Label>
                </div>
              </RadioGroup>
            </div>
            
            <Separator/>

            <div className="space-y-4">
               <div className="flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                  <Label>طريقة عرض المنتجات</Label>
                </div>
              <RadioGroup
                value={localSettings.productView}
                onValueChange={(value) => handleInputChange('productView', value)}
                className="grid max-w-md grid-cols-2 gap-4"
              >
                <div>
                  <RadioGroupItem value="grid" id="grid" className="peer sr-only" />
                  <Label
                    htmlFor="grid"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                  >
                    <LayoutGrid className="mb-3 h-6 w-6" />
                    شبكة
                  </Label>
                </div>
                <div>
                  <RadioGroupItem
                    value="table"
                    id="table"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="table"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                  >
                    <List className="mb-3 h-6 w-6" />
                    جدول
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <Separator/>

            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <Label>عرض وترتيب المنتجات</Label>
                </div>
                <div className="grid md:grid-cols-2 gap-6 pt-2">
                    <div className="space-y-3">
                        <Label className="text-xs text-muted-foreground">ترتيب المنتجات (حسب الأحدث)</Label>
                        <RadioGroup
                            value={localSettings.product_sortOrder}
                            onValueChange={(value) => handleInputChange('product_sortOrder', value)}
                            className="grid grid-cols-2 gap-4"
                        >
                            <div>
                                <RadioGroupItem value="desc" id="sort-desc" className="peer sr-only" />
                                <Label
                                    htmlFor="sort-desc"
                                    className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                                >
                                    <SortDesc className="mb-2 h-5 w-5" />
                                    تنازلي (الأحدث أولاً)
                                </Label>
                            </div>
                            <div>
                                <RadioGroupItem value="asc" id="sort-asc" className="peer sr-only" />
                                <Label
                                    htmlFor="sort-asc"
                                    className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                                >
                                    <SortAsc className="mb-2 h-5 w-5" />
                                    تصاعدي (الأقدم أولاً)
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse border p-4 rounded-lg self-end">
                        <Switch 
                            id="hideOutOfStock" 
                            checked={localSettings.product_hideOutOfStock} 
                            onCheckedChange={(checked) => handleInputChange('product_hideOutOfStock', checked)} 
                        />
                        <div className="grid gap-1.5 leading-none">
                            <Label htmlFor="hideOutOfStock" className="flex items-center gap-2">
                                <EyeOff className="h-4 w-4" />
                                إخفاء الأصناف غير المتوفرة
                            </Label>
                            <p className="text-xs text-muted-foreground">عدم عرض المنتجات التي رصيدها صفر في شاشة المنتجات.</p>
                        </div>
                    </div>
                </div>
            </div>

             <Separator/>

            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <Label>تفعيل الميزات</Label>
                </div>
                <div className="grid sm:grid-cols-2 gap-4 pt-2">
                    <div className="flex items-center space-x-2 space-x-reverse border p-4 rounded-lg">
                        <Switch 
                            id="enableTailor" 
                            checked={localSettings.feature_enableTailorWorkflow} 
                            onCheckedChange={(checked) => handleInputChange('feature_enableTailorWorkflow', checked)} 
                        />
                        <div className="grid gap-1.5 leading-none">
                            <Label htmlFor="enableTailor" className="flex items-center gap-2">
                                <Scissors className="h-4 w-4" />
                                تفعيل متابعة الخياط
                            </Label>
                            <p className="text-xs text-muted-foreground">تفعيل خطوات التجهيز ووصل استلام الخياط.</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse border p-4 rounded-lg">
                        <Switch 
                            id="preventNegative" 
                            checked={localSettings.sale_preventNegativeStock} 
                            onCheckedChange={(checked) => handleInputChange('sale_preventNegativeStock', checked)} 
                        />
                        <div className="grid gap-1.5 leading-none">
                            <Label htmlFor="preventNegative" className="flex items-center gap-2">
                                <PackageX className="h-4 w-4" />
                                منع البيع بدون رصيد
                            </Label>
                            <p className="text-xs text-muted-foreground">منع إتمام طلبات البيع إذا كانت الكمية المتوفرة صفر.</p>
                        </div>
                    </div>
                </div>
            </div>

            <Separator/>

            {/* ── خلفية صفحات تسجيل الدخول والرئيسية ────────────────────── */}
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                <Label>خلفية صفحات تسجيل الدخول والرئيسية</Label>
              </div>

              {/* حجم الصورة */}
              <div className="space-y-3">
                <Label className="text-xs text-muted-foreground">حجم الصورة</Label>
                <RadioGroup
                  value={localSettings.bgImageSize ?? 'cover'}
                  onValueChange={(v) => handleInputChange('bgImageSize', v)}
                  className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3"
                >
                  {([
                    { value: 'cover',   label: 'تغطية كاملة' },
                    { value: 'contain', label: 'احتواء' },
                    { value: '50%',     label: '50%' },
                    { value: '75%',     label: '75%' },
                    { value: '100%',    label: '100%' },
                    { value: '150%',    label: '150%' },
                    { value: '200%',    label: '200%' },
                  ] as const).map(opt => (
                    <div key={opt.value}>
                      <RadioGroupItem value={opt.value} id={`bg-size-${opt.value}`} className="peer sr-only" />
                      <Label
                        htmlFor={`bg-size-${opt.value}`}
                        className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 text-xs text-center cursor-pointer hover:bg-accent peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                      >
                        {opt.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {/* شفافية الطبقة الداكنة */}
              <div className="space-y-3 max-w-sm">
                <div className="flex justify-between items-center">
                  <Label className="text-xs text-muted-foreground">تعتيم الخلفية</Label>
                  <span className="text-xs font-mono text-muted-foreground">
                    {localSettings.bgImageOpacity ?? 40}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={90}
                  step={5}
                  value={localSettings.bgImageOpacity ?? 40}
                  onChange={(e) => handleInputChange('bgImageOpacity', Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>شفاف</span>
                  <span>معتم</span>
                </div>
              </div>

              {/* معاينة مصغرة */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">معاينة</Label>
                <div
                  className="relative rounded-lg overflow-hidden border h-28 w-48"
                  style={{
                    backgroundImage: 'url(/bg-brand.svg)',
                    backgroundSize: localSettings.bgImageSize ?? 'cover',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    backgroundColor: '#0d0d0d',
                  }}
                >
                  <div
                    className="absolute inset-0"
                    style={{ backgroundColor: `rgba(0,0,0,${((localSettings.bgImageOpacity ?? 40) / 100).toFixed(2)})` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white text-xs font-bold opacity-80">معاينة</span>
                  </div>
                </div>
              </div>
            </div>

          </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>الإعدادات المتقدمة</CardTitle>
                <CardDescription>
                    قم بتخصيص تصميم الإيصالات والملصقات وإدارة قاعدة البيانات.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Link href="/settings/tailor-receipt" className="flex">
                  <div className="flex items-center justify-between rounded-lg border p-4 w-full hover:bg-accent hover:text-accent-foreground transition-colors">
                      <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                              <Scissors className="h-5 w-5" />
                          </div>
                          <div>
                              <p className="font-medium">وصل الخياط</p>
                              <p className="text-sm text-muted-foreground">تخصيص شكل الوصل</p>
                          </div>
                      </div>
                  </div>
                </Link>
                 <Link href="/settings/cashier-receipt" className="flex">
                  <div className="flex items-center justify-between rounded-lg border p-4 w-full hover:bg-accent hover:text-accent-foreground transition-colors">
                      <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                              <Printer className="h-5 w-5" />
                          </div>
                          <div>
                              <p className="font-medium">إيصال الكاشير</p>
                              <p className="text-sm text-muted-foreground">تخصيص شكل الإيصال</p>
                          </div>
                      </div>
                  </div>
                </Link>
                 <Link href="/settings/label-print" className="flex">
                   <div className="flex items-center justify-between rounded-lg border p-4 w-full hover:bg-accent hover:text-accent-foreground transition-colors">
                      <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                              <Tags className="h-5 w-5" />
                          </div>
                          <div>
                              <p className="font-medium">طباعة الملصقات</p>
                              <p className="text-sm text-muted-foreground">تصميم ملصق المنتج</p>
                          </div>
                      </div>
                  </div>
                </Link>
                <Link href="/settings/database" className="flex">
                    <div className="flex items-center justify-between rounded-lg border p-4 w-full hover:bg-accent hover:text-accent-foreground transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                                <Database className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="font-medium">إدارة البيانات</p>
                                <p className="text-sm text-muted-foreground">نسخ وحذف البيانات</p>
                            </div>
                        </div>
                    </div>
                </Link>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SettingsPage() {
    return (
        <AppLayout>
            <AuthGuard>
                <SettingsPageContent />
            </AuthGuard>
        </AppLayout>
    )
}
