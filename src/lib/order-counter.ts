import { ref, runTransaction, get, set, type Database } from 'firebase/database';
import type { BranchOrderCounter } from '@/lib/definitions';

export const DEFAULT_ORDER_COUNTER_START = 70000001;

/** RTDB path: counters/orders/{branchId} — Branch → Counter → Orders */
export function getBranchOrderCounterPath(branchId: string): string {
  return `counters/orders/${branchId}`;
}

export function isBranchOrderCounter(data: unknown): data is BranchOrderCounter {
  if (!data || typeof data !== 'object') return false;
  const counter = data as BranchOrderCounter;
  return typeof counter.branchId === 'string' && typeof counter.value === 'number';
}

export function getNextOrderNumberFromCounter(counter?: BranchOrderCounter | null): number {
  if (!counter || typeof counter.value !== 'number') return DEFAULT_ORDER_COUNTER_START;
  return counter.value + 1;
}

/**
 * Seeds a branch counter from existing orders when missing (one-time per branch).
 * Does not read or write the legacy global counters/orders node.
 */
export async function ensureBranchOrderCounter(
  db: Database,
  branchId: string,
  existingBranchOrders?: { orderCode?: string }[]
): Promise<void> {
  const counterRef = ref(db, getBranchOrderCounterPath(branchId));

  let floor = DEFAULT_ORDER_COUNTER_START - 1;
  if (existingBranchOrders?.length) {
    for (const order of existingBranchOrders) {
      const code = parseInt(order.orderCode || '', 10);
      if (!isNaN(code) && code > floor) floor = code;
    }
  }

  await runTransaction(counterRef, (currentData) => {
    if (currentData && isBranchOrderCounter(currentData)) return;
    return {
      branchId,
      name: 'orders',
      value: floor,
      updatedAt: new Date().toISOString(),
    } satisfies BranchOrderCounter;
  });
}

/**
 * Atomically increments the branch order counter and returns the new order code.
 * Each branch has its own counter — concurrent orders across branches do not conflict.
 */
export async function getNextOrderCode(
  db: Database,
  branchId: string,
  existingBranchOrders?: { orderCode?: string }[]
): Promise<string> {
  if (!branchId) {
    throw new Error('معرف الفرع مطلوب لتوليد رقم الطلب.');
  }

  await ensureBranchOrderCounter(db, branchId, existingBranchOrders);

  const counterRef = ref(db, getBranchOrderCounterPath(branchId));
  const result = await runTransaction(counterRef, (currentData) => {
    if (!currentData || !isBranchOrderCounter(currentData)) {
      return {
        branchId,
        name: 'orders',
        value: DEFAULT_ORDER_COUNTER_START,
        updatedAt: new Date().toISOString(),
      } satisfies BranchOrderCounter;
    }

    currentData.value = (currentData.value || DEFAULT_ORDER_COUNTER_START - 1) + 1;
    currentData.updatedAt = new Date().toISOString();
    return currentData;
  });

  if (!result.committed || !result.snapshot.exists()) {
    throw new Error('فشل النظام في توليد رقم فاتورة جديد.');
  }

  const value = result.snapshot.val()?.value;
  if (typeof value !== 'number') {
    throw new Error('فشل النظام في قراءة عداد الطلبات.');
  }

  return value.toString();
}

export async function initializeBranchOrderCounter(
  db: Database,
  branchId: string
): Promise<void> {
  const counterRef = ref(db, getBranchOrderCounterPath(branchId));
  const snap = await get(counterRef);
  if (snap.exists()) return;

  const counter: BranchOrderCounter = {
    branchId,
    name: 'orders',
    value: DEFAULT_ORDER_COUNTER_START - 1,
    updatedAt: new Date().toISOString(),
  };

  await set(counterRef, counter);
}
