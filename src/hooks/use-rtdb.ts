'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ref,
  onValue,
  off,
  query,
  limitToLast,
  orderByKey,
} from 'firebase/database';
import { useDatabase } from '@/firebase';
import {
  useSharedRtdb,
  SHARED_PATHS,
  DAILY_ENTRIES_SHARED_WINDOW,
} from '@/providers/rtdb-data-provider';
import { useSharedProducts } from '@/providers/products-data-provider';
import {
  applyDailyEntriesDateLimit,
  stripStockMovementsList,
} from '@/lib/rtdb-utils';

function flattenDirectSnapshot(path: string, val: Record<string, unknown>): unknown[] {
  const listMap = new Map<string, unknown>();

  if (path === 'daily-entries') {
    Object.keys(val).forEach((dateKey) => {
      const dayData = val[dateKey] as { orders?: Record<string, unknown> };
      if (dayData?.orders) {
        Object.keys(dayData.orders).forEach((orderId) => {
          const order = dayData.orders![orderId] as Record<string, unknown>;
          const uniqueKey = `${dateKey}_${orderId}`;
          listMap.set(uniqueKey, {
            ...order,
            id: orderId,
            datePath: dateKey,
            uniqueKey,
          });
        });
      }
    });
  } else {
    Object.keys(val).forEach((key) => {
      listMap.set(key, { ...(val[key] as object), id: key });
    });
  }

  const list = Array.from(listMap.values()) as Array<Record<string, unknown>>;
  list.sort((a, b) => {
    const dateA = String(a.updatedAt || a.orderDate || a.date || a.createdAt || '0');
    const dateB = String(b.updatedAt || b.orderDate || b.date || b.createdAt || '0');
    return dateB > dateA ? 1 : -1;
  });

  return list;
}

function postProcessList<T>(path: string, list: T[], limit?: number): T[] {
  let result = list;

  if (path === 'daily-entries' && limit) {
    result = applyDailyEntriesDateLimit(result as Array<{ datePath?: string }>, limit) as T[];
  }

  if (path === 'products') {
    result = stripStockMovementsList(result as Array<{ stockMovements?: unknown }>) as T[];
  }

  return result;
}

/**
 * Reads RTDB list data with minimal duplicate downloads:
 * - Shared paths → single app-wide listener via RtdbDataProvider
 * - products → single delta-sync listener via ProductsDataProvider
 * - daily-entries with limit > shared window → dedicated limited listener (rare)
 */
export function useRtdbList<T>(path: string, options?: { limit?: number }) {
  const shared = useSharedRtdb(path);
  const sharedProducts = useSharedProducts();
  const isManagedPath = (SHARED_PATHS as readonly string[]).includes(path);
  const isProductsPath = path === 'products';

  const needsExtendedOrdersListener =
    path === 'daily-entries' &&
    !!options?.limit &&
    options.limit > DAILY_ENTRIES_SHARED_WINDOW;

  const [directData, setDirectData] = useState<T[]>([]);
  const [directLoading, setDirectLoading] = useState(true);
  const [directError, setDirectError] = useState<Error | null>(null);
  const dbRTDB = useDatabase();

  useEffect(() => {
    if (!dbRTDB) return;
    if (isProductsPath && sharedProducts) return;
    if (isManagedPath && !needsExtendedOrdersListener) return;

    let isMounted = true;
    const dbRef = ref(dbRTDB, path);
    let syncQuery: ReturnType<typeof query> | ReturnType<typeof ref> = dbRef;

    if (options?.limit && (path === 'products' || path === 'daily-entries')) {
      syncQuery = query(dbRef, orderByKey(), limitToLast(options.limit));
    }

    const handleSnapshot = (snapshot: { val: () => unknown }) => {
      if (!isMounted) return;

      const val = snapshot.val();
      if (!val) {
        setDirectData([]);
        setDirectLoading(false);
        return;
      }

      const list = flattenDirectSnapshot(path, val as Record<string, unknown>);
      setDirectData(postProcessList(path, list as T[], options?.limit));
      setDirectLoading(false);
    };

    const handleError = (err: Error) => {
      if (!isMounted) return;
      console.error(`RTDB Connection Error at ${path}:`, err);
      setDirectError(err);
      setDirectLoading(false);
    };

    onValue(syncQuery, handleSnapshot, handleError);

    return () => {
      isMounted = false;
      off(syncQuery, 'value', handleSnapshot);
    };
  }, [path, dbRTDB, options?.limit, isManagedPath, isProductsPath, needsExtendedOrdersListener, sharedProducts]);

  const sharedData = useMemo(() => {
    if (!isManagedPath || needsExtendedOrdersListener || !shared) return null;
    return postProcessList(path, shared.data as T[], options?.limit);
  }, [isManagedPath, needsExtendedOrdersListener, shared, path, options?.limit]);

  const productsData = useMemo(() => {
    if (!isProductsPath || !sharedProducts) return null;
    return sharedProducts.data as T[];
  }, [isProductsPath, sharedProducts]);

  if (isProductsPath && sharedProducts) {
    return {
      data: productsData ?? [],
      isLoading: sharedProducts.isLoading,
      error: sharedProducts.error,
    };
  }

  if (isManagedPath && !needsExtendedOrdersListener && shared) {
    return {
      data: sharedData ?? [],
      isLoading: shared.isLoading,
      error: shared.error,
    };
  }

  return { data: directData, isLoading: directLoading, error: directError };
}
