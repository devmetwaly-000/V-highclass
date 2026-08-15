'use client';

import { AppLayout, AuthGuard } from '@/components/app-layout';
import { HiClassLogo } from '@/components/icons';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/hooks/use-settings';

function HomePageContent() {
    const { appUser } = useUser();
    const { settings } = useSettings();

    return (
        <div
            className="relative flex flex-1 items-center justify-center min-h-[calc(100vh-4rem)] -mx-4 -mb-4 md:-mx-8 md:-mb-8 px-4"
            style={{
                backgroundImage: 'url(/bg-brand.svg)',
                backgroundSize: settings.bgImageSize ?? 'cover',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center center',
                backgroundColor: '#0d0d0d',
            }}
        >
            <div
                className="absolute inset-0 pointer-events-none"
                style={{ backgroundColor: `rgba(0,0,0,${((settings.bgImageOpacity ?? 40) / 100).toFixed(2)})` }}
            />
            <Card className="relative z-10 w-full max-w-lg text-center border-none shadow-none bg-transparent">
                <CardHeader>
                    <HiClassLogo className="mx-auto h-24 w-auto" />
                    <CardTitle className="mt-6 text-3xl font-headline text-amber-300">
                        أهلاً بك، {appUser?.fullName}!
                    </CardTitle>
                    <CardDescription className="text-base text-amber-100/80">
                        لقد تم تسجيل دخولك بنجاح.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-amber-100/60">
                       يمكنك البدء بالتنقل بين أقسام البرنامج من القائمة.
                    </p>
                    <div className="flex gap-4 justify-center">
                        <Link href="/orders">
                           <Button className="mt-6">عرض الطلبات</Button>
                        </Link>
                         <Link href="/products">
                           <Button variant="outline" className="mt-6">عرض المنتجات</Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default function HomePage() {
    return (
        <AppLayout>
            <AuthGuard>
                <HomePageContent />
            </AuthGuard>
        </AppLayout>
    );
}
