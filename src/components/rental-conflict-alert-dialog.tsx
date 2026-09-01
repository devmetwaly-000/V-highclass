'use client';

import React from 'react';
import { CalendarX2, History } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ProductAvailabilityDialog } from '@/components/product-availability-dialog';
import type { ConflictResult } from '@/lib/rental-conflict';

export type ConflictingOrderItem = {
  id: string;
  productId: string;
  productName: string;
  conflict: ConflictResult;
};

type RentalConflictAlertDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflictingItems: ConflictingOrderItem[];
};

const formatDate = (dateString: string) =>
  format(new Date(dateString), 'd MMM yyyy', { locale: ar });

export function RentalConflictAlertDialog({
  open,
  onOpenChange,
  conflictingItems,
}: RentalConflictAlertDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg" dir="rtl">
        <AlertDialogHeader className="text-right">
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <CalendarX2 className="h-5 w-5 shrink-0" />
            تعارض في الحجز
          </AlertDialogTitle>
          <AlertDialogDescription className="text-right text-base text-foreground/90">
            Item already booked for this timeframe.
            <span className="block mt-1 text-sm text-muted-foreground">
              لا يمكن تأكيد الطلب حتى يتم تغيير الأصناف أو تواريخ التسليم والإرجاع.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-[50vh] overflow-y-auto space-y-3 py-2">
          {conflictingItems.map(({ id, productId, productName, conflict }) => {
            const booking = conflict.conflictingOrders[0];
            return (
              <div
                key={id}
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2"
              >
                <p className="font-semibold text-sm">{productName}</p>
                {booking && (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>فاتورة: <span className="font-mono">{booking.orderCode}</span> — {booking.customerName}</p>
                    <p>
                      من {formatDate(booking.deliveryDate)} إلى {formatDate(booking.returnDate)}
                    </p>
                  </div>
                )}
                <ProductAvailabilityDialog
                  productId={productId}
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                    >
                      <History className="h-3 w-3" />
                      View Booking History
                    </Button>
                  }
                />
              </div>
            );
          })}
        </div>

        <AlertDialogFooter className="sm:justify-start">
          <AlertDialogCancel className="w-full sm:w-auto">حسناً، سأعدّل الطلب</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
