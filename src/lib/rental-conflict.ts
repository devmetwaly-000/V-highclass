/**
 * rental-conflict.ts
 * ─────────────────────────────────────────────────────────────────
 * منطق التحقق من تعارض الحجز لطلبات الإيجار.
 *
 * القاعدة:
 *   الطلب الجديد يتعارض مع طلب قائم إذا كان هناك تداخل بين فترتين:
 *
 *   فترة الطلب الجديد  : [newDelivery .. newReturn]
 *   فترة الطلب القائم  : [existDelivery .. existReturn]
 *
 *   التداخل يحدث إذا: newDelivery <= existReturn && newReturn >= existDelivery
 *
 *   أي أن الطلب الجديد مسموح فقط إذا:
 *   - تاريخ إرجاعه ≤ يوم قبل تسليم الطلب القائم  (ينتهي قبل بداية القائم)
 *   - تاريخ تسليمه ≥ يوم بعد إرجاع الطلب القائم (يبدأ بعد نهاية القائم)
 * ─────────────────────────────────────────────────────────────────
 */

import { startOfDay } from 'date-fns';
import type { Order } from '@/lib/definitions';

export interface ConflictResult {
  /** هل يوجد تعارض؟ */
  hasConflict: boolean;
  /** الطلبات المتعارضة */
  conflictingOrders: ConflictingOrder[];
}

export interface ConflictingOrder {
  orderCode: string;
  customerName: string;
  deliveryDate: string;
  returnDate: string;
  productName: string;
}

/**
 * التحقق مما إذا كانت فترتين تتداخلان.
 * كلا الطرفين شاملان (inclusive).
 */
function periodsOverlap(
  newStart: Date,
  newEnd: Date,
  existStart: Date,
  existEnd: Date,
): boolean {
  return newStart <= existEnd && newEnd >= existStart;
}

/**
 * checkRentalConflict
 *
 * @param productId     معرّف المنتج المراد فحصه
 * @param newDelivery   تاريخ تسليم الطلب الجديد
 * @param newReturn     تاريخ إرجاع الطلب الجديد
 * @param allOrders     كل الطلبات من قاعدة البيانات
 * @param excludeOrderId معرّف الطلب الحالي عند التعديل (لاستثنائه من الفحص)
 */
export function checkRentalConflict(
  productId: string,
  newDelivery: Date,
  newReturn: Date,
  allOrders: Order[],
  excludeOrderId?: string,
): ConflictResult {
  const newStart = startOfDay(newDelivery);
  const newEnd   = startOfDay(newReturn);

  const conflictingOrders: ConflictingOrder[] = [];

  for (const order of allOrders) {
    // استثناء الطلب الحالي في وضع التعديل
    if (excludeOrderId && order.id === excludeOrderId) continue;

    // تجاهل الطلبات الملغية أو المُرتجعة
    if (order.status === 'Cancelled' || order.status === 'Returned') continue;

    // فحص فقط طلبات الإيجار
    if (order.transactionType !== 'Rental') continue;

    // يجب أن يكون للطلب تاريخ تسليم وإرجاع
    if (!order.deliveryDate || !order.returnDate) continue;

    // فحص إذا كانت هذه القطعة موجودة في الطلب
    const itemInOrder = order.items?.find(i => i.productId === productId);
    if (!itemInOrder) continue;

    // التحقق من نوع الصنف (إيجار)
    const itemType = itemInOrder.itemTransactionType || order.transactionType;
    if (itemType !== 'Rental') continue;

    const existStart = startOfDay(new Date(order.deliveryDate));
    const existEnd   = startOfDay(new Date(order.returnDate));

    if (periodsOverlap(newStart, newEnd, existStart, existEnd)) {
      conflictingOrders.push({
        orderCode:    order.orderCode,
        customerName: order.customerName,
        deliveryDate: order.deliveryDate,
        returnDate:   order.returnDate,
        productName:  itemInOrder.productName,
      });
    }
  }

  return {
    hasConflict: conflictingOrders.length > 0,
    conflictingOrders,
  };
}

/**
 * isProductAvailableForPeriod
 * نسخة مبسطة تُعيد true إذا كان المنتج متاحاً في الفترة المطلوبة.
 */
export function isProductAvailableForPeriod(
  productId: string,
  deliveryDate: Date,
  returnDate: Date,
  allOrders: Order[],
  excludeOrderId?: string,
): boolean {
  return !checkRentalConflict(
    productId,
    deliveryDate,
    returnDate,
    allOrders,
    excludeOrderId,
  ).hasConflict;
}
