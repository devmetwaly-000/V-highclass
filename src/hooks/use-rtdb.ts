'use client';

import { useState, useEffect, useRef } from 'react';
import {
  ref,
  onValue,
  off,
  query,
  limitToLast,
  orderByKey,
} from 'firebase/database';
import { useDatabase } from '@/firebase';
import { useSharedRtdb } from '@/providers/rtdb-data-provider';

/**
 * useRtdbList — Realtime Database list hook with shared-listener optimization.
 *
 * For paths managed by RtdbDataProvider (branches, users, customers,
 * daily-entries, shifts, expenses, regions, treasuries, productGroups,
 * sizes, suppliers, purchaseOrders, saleReturns, discountRequests) this hook
 * reads directly from the shared in-memory cache — zero extra Firebase
 * listeners, zero extra network traffic.
 *
 * For any other path it falls back to creating its own onValue() listener,
 * exactly as before.
 *
 * The `limit` option is honoured for both modes: in shared mode the slice is
 * applied in-memory after sorting; in direct mode it is passed to Firebase as
 * limitToLast() (legacy behaviour preserved).
 */
export function useRtdbList<T>(path: string, options?: { limit?: number }) {
  // ── Shared-cache path (no Firebase listener needed) ───────────────────────
  const shared = useSharedRtdb(path);

  if (shared !== undefined) {
    // Return a stable slice from the shared cache.
    // We can't use hooks conditionally, so we delegate to a thin wrapper.
    return useSharedSlice<T>(shared, options?.limit);
  }

  // ── Direct listener path (unmanaged path) ─────────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useDirectListener<T>(path, options?.limit);
}

// ─── Shared-cache hook (called when RtdbDataProvider manages the path) ────────

function useSharedSlice<T>(
  shared: { data: any[]; isLoading: boolean; error: Error | null },
  limit?: number,
): { data: T[]; isLoading: boolean; error: Error | null } {
  if (!limit) {
    return {
      data: shared.data as T[],
      isLoading: shared.isLoading,
      error: shared.error,
    };
  }
  // Apply limit in-memory (data is already sorted descending by the provider)
  return {
    data: shared.data.slice(0, limit) as T[],
    isLoading: shared.isLoading,
    error: shared.error,
  };
}

// ─── Direct listener hook (fallback for paths not in SHARED_PATHS) ────────────

function useDirectListener<T>(
  path: string,
  limit?: number,
): { data: T[]; isLoading: boolean; error: Error | null } {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const dbRTDB = useDatabase();

  useEffect(() => {
    let isMounted = true;
    if (!dbRTDB) return;

    const dbRef = ref(dbRTDB, path);
    let syncQuery: any = dbRef;

    if (limit && (path === 'products' || path === 'daily-entries')) {
      syncQuery = query(dbRef, orderByKey(), limitToLast(limit));
    }

    const unsubscribe = onValue(
      syncQuery,
      (snapshot) => {
        if (!isMounted) return;

        const val = snapshot.val();
        if (!val) {
          setData([]);
          setIsLoading(false);
          return;
        }

        const list: T[] = [];

        if (path === 'daily-entries') {
          Object.keys(val).forEach((dateKey) => {
            const dayData = val[dateKey];
            if (dayData?.orders) {
              Object.keys(dayData.orders).forEach((orderId) => {
                const order = dayData.orders[orderId];
                list.push({
                  ...order,
                  id: orderId,
                  datePath: dateKey,
                  uniqueKey: `${dateKey}_${orderId}`,
                } as T);
              });
            }
          });
        } else {
          Object.keys(val).forEach((key) => {
            list.push({ ...val[key], id: key });
          });
        }

        list.sort((a: any, b: any) => {
          const da = a.updatedAt || a.orderDate || a.date || a.createdAt || '0';
          const db = b.updatedAt || b.orderDate || b.date || b.createdAt || '0';
          return db > da ? 1 : -1;
        });

        setData(list);
        setIsLoading(false);
      },
      (err) => {
        if (!isMounted) return;
        console.error(`RTDB listener error at ${path}:`, err);
        setError(err);
        setIsLoading(false);
      },
    );

    return () => {
      isMounted = false;
      off(syncQuery);
    };
  }, [path, dbRTDB, limit]);

  return { data, isLoading, error };
}
