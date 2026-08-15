
'use client';

import React, { useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { AppLayout, AuthGuard } from '@/components/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LockKeyhole, User, ShieldAlert, AlertCircle } from 'lucide-react';
import { useRtdbList } from '@/hooks/use-rtdb';
import type { User as UserType } from '@/lib/definitions';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

function UserCredentialsReportPageContent() {
  const { data: users, isLoading } = useRtdbList<UserType>('users');
  const { appUser } = useUser();

  const isAuthorized = useMemo(() => {
    return appUser?.username === 'admin' || appUser?.role === 'admin' || appUser?.permissions?.includes('all');
  }, [appUser]);

  // تصفية المستخدمين لاستبعاد مدير النظام (System Administrator)
  const displayUsers = useMemo(() => {
    return users.filter(user => user.username !== 'admin');
  }, [users]);

  if (!isLoading && !isAuthorized) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="بيانات دخول المستخدمين" showBackButton />
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="p-12 text-center flex flex-col items-center gap-4">
            <ShieldAlert className="h-16 w-16 text-destructive opacity-40" />
            <div className="space-y-1">
              <h3 className="text-xl font-bold">غير مصرح لك</h3>
              <p className="text-muted-foreground">هذا التقرير مخصص للمدير فقط لاحتوائه على معلومات حساسة.</p>
            </div>
            <Link href="/reports">
              <Button variant="outline">العودة للتقارير</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="تقرير بيانات دخول المستخدمين" showBackButton />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-primary" />
            <CardTitle>سجل بيانات الدخول</CardTitle>
          </div>
          <CardDescription>قائمة بأسماء المستخدمين وكلمات المرور الخاصة بكافة الموظفين المسجلين في النظام.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الاسم الكامل</TableHead>
                <TableHead className="text-center">اسم المستخدم</TableHead>
                <TableHead className="text-center">كلمة المرور</TableHead>
                <TableHead className="text-center">الدور</TableHead>
                <TableHead className="text-center">الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16 mx-auto rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : displayUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    لا يوجد مستخدمون آخرون لعرض بياناتهم.
                  </TableCell>
                </TableRow>
              ) : (
                displayUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-bold text-right">
                        <div className="flex items-center gap-2">
                            <User className="h-3 w-3 text-muted-foreground" />
                            {user.fullName}
                        </div>
                    </TableCell>
                    <TableCell className="text-center font-mono font-bold text-primary">{user.username}</TableCell>
                    <TableCell className="text-center font-mono text-xs bg-muted/30 select-all" title="اضغط ثلاث مرات للنسخ">
                        {user.password || '********'}
                    </TableCell>
                    <TableCell className="text-center capitalize text-xs">
                        {user.role === 'admin' ? 'مدير' : user.role === 'cashier' ? 'كاشير' : 'بائع'}
                    </TableCell>
                    <TableCell className="text-center">
                        {user.isActive ? (
                            <Badge className="bg-green-500 text-white text-[10px]">نشط</Badge>
                        ) : (
                            <Badge variant="destructive" className="text-[10px]">معطل</Badge>
                        )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div className="text-xs text-amber-800 leading-relaxed">
              <p className="font-bold mb-1 text-sm">تنبيه أمني:</p>
              يُرجى الحفاظ على سرية هذه المعلومات وعدم مشاركتها مع غير المصرح لهم. يُفضل دائماً توجيه الموظفين لتغيير كلمات مرورهم بشكل دوري من خلال شاشة "تعديل كلمة المرور" الخاصة بكل مستخدم.
          </div>
      </div>
    </div>
  );
}

export default function UserCredentialsReportPage() {
  return (
    <AppLayout>
      <AuthGuard>
        <UserCredentialsReportPageContent />
      </AuthGuard>
    </AppLayout>
  );
}
