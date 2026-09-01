'use client';

/**
 * RtdbDataProvider — Single-listener shared cache for all high-traffic RTDB paths.
 *
 * Problem solved: useRtdbList() creates a new Firebase onValue() listener per
 * component instance. With 20+ components subscribing to 'daily-entries' and
 * 'branches' etc., the app was opening dozens of redundant WebSocket listeners
 * downloading the same data repeatedly.
 *
 * Solution: This provider opens exactly ONE listener per path for the lifetime of
 * the app. All components read from the shared in-memory cache via useSharedRtdb().
 * useRtdbList() is updated to transparently use this cache for known paths.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { ref, onValue, off, query, orderByKey, limitToLast } from 'firebase/database';
import { useDatabase } from '@/firebase';
import { db as localDb } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SharedPathState {
  data: any[];
  isLoading: boolean;
  error: Error | null;
}

// All paths managed by this provider (one listener each)
export const SHARED_PATHS = [
  'branches',
  'users',
  'customers',
  'shifts',
  'expenses',
  'regions',
  'treasuries',
  'productGroups',
  'sizes',
  'suppliers',
  'purchaseOrders',
  'saleReturns',
  'discountRequests',
  'daily-entries',
] as const;

/** Default rolling window for shared daily-entries listener (date keys, not order count). */
export const DAILY_ENTRIES_SHARED_WINDOW = 120;

export type SharedPath = typeof SHARED_PATHS[number];

type SharedDataState = Record<SharedPath, SharedPathState>;

const defaultPathState = (): SharedPathState => ({
  data: [],
  isLoading: true,
  error: null,
});

const buildInitialState = (): SharedDataState =>
  Object.fromEntries(
    SHARED_PATHS.map((p) => [p, defaultPathState()])
  ) as SharedDataState;

// ─── Context ──────────────────────────────────────────────────────────────────

const RtdbDataContext = createContext<SharedDataState | undefined>(undefined);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Flatten a raw Firebase snapshot value into a typed array.
 * Handles the nested daily-entries structure specially.
 */
function flattenSnapshot(path: string, val: Record<string, any>): any[] {
  const list: any[] = [];

  if (path === 'daily-entries') {
    for (const dateKey of Object.keys(val)) {
      const dayData = val[dateKey];
      if (dayData?.orders) {
        for (const orderId of Object.keys(dayData.orders)) {
          const order = dayData.orders[orderId];
          list.push({
            ...order,
            id: orderId,
            datePath: dateKey,
            uniqueKey: `${dateKey}_${orderId}`,
          });
        }
      }
    }
  } else {
    for (const key of Object.keys(val)) {
      list.push({ ...val[key], id: key });
    }
  }

  // Sort descending by most-recent timestamp field
  list.sort((a, b) => {
    const da = a.updatedAt || a.orderDate || a.date || a.createdAt || '0';
    const db = b.updatedAt || b.orderDate || b.date || b.createdAt || '0';
    return db > da ? 1 : -1;
  });

  return list;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function RtdbDataProvider({ children }: { children: ReactNode }) {
  const database = useDatabase();
  const [state, setState] = useState<SharedDataState>(buildInitialState);
  // Track whether we've hydrated daily-entries from IndexedDB already
  const hydratedRef = useRef<Set<string>>(new Set());

  const setPath = useCallback(
    (path: SharedPath, update: Partial<SharedPathState>) => {
      setState((prev) => ({
        ...prev,
        [path]: { ...prev[path], ...update },
      }));
    },
    []
  );

  // ── Hydrate daily-entries from IndexedDB on mount (instant paint) ────────────
  useEffect(() => {
    if (hydratedRef.current.has('daily-entries')) return;
    hydratedRef.current.add('daily-entries');

    const hydrate = async () => {
      try {
        const cached = await localDb.persistentCache
          .where('path')
          .equals('daily-entries')
          .toArray();
        if (cached.length > 0) {
          const items = cached.map((c) => c.data);
          items.sort((a: any, b: any) => {
            const da = a.updatedAt || a.orderDate || a.date || a.createdAt || '0';
            const db = b.updatedAt || b.orderDate || b.date || b.createdAt || '0';
            return db > da ? 1 : -1;
          });
          // Only apply if the live listener hasn't arrived yet
          setState((prev) =>
            prev['daily-entries'].isLoading
              ? { ...prev, 'daily-entries': { data: items, isLoading: true, error: null } }
              : prev
          );
        }
      } catch (e) {
        // Non-fatal: live data will arrive shortly
        console.warn('RtdbDataProvider: IndexedDB hydration failed', e);
      }
    };

    hydrate();
  }, []);

  // ── Open one listener per shared path ────────────────────────────────────────
  useEffect(() => {
    if (!database) return;

    const cleanups: (() => void)[] = [];

    for (const path of SHARED_PATHS) {
      const dbRef = ref(database, path);
      const syncRef =
        path === 'daily-entries'
          ? query(dbRef, orderByKey(), limitToLast(DAILY_ENTRIES_SHARED_WINDOW))
          : dbRef;

      const handleSnapshot = async (snapshot: any) => {
        const val = snapshot.val();
        if (!val) {
          setPath(path, { data: [], isLoading: false, error: null });
          return;
        }

        const list = flattenSnapshot(path, val);
        setPath(path, { data: list, isLoading: false, error: null });

        // Persist daily-entries to IndexedDB for next-launch instant paint
        if (path === 'daily-entries') {
          try {
            // Bulk upsert all orders into persistentCache
            const puts = list.map((order: any) =>
              localDb.persistentCache.put({
                key: `daily-entries/${order.id}`,
                path: 'daily-entries',
                id: order.id,
                data: order,
                updatedAt: order.updatedAt || order.orderDate || new Date().toISOString(),
              })
            );
            await Promise.all(puts);
          } catch (e) {
            console.warn('RtdbDataProvider: IndexedDB write failed', e);
          }
        }
      };

      const handleError = (err: Error) => {
        console.error(`RtdbDataProvider: listener error at ${path}`, err);
        setPath(path, { isLoading: false, error: err });
      };

      onValue(syncRef, handleSnapshot, handleError);

      cleanups.push(() => off(syncRef, 'value', handleSnapshot));
    }

    return () => cleanups.forEach((fn) => fn());
  }, [database, setPath]);

  return (
    <RtdbDataContext.Provider value={state}>
      {children}
    </RtdbDataContext.Provider>
  );
}

// ─── Consumer hook ─────────────────────────────────────────────────────────────

/**
 * Access the shared in-memory RTDB cache for a managed path.
 * Returns undefined if used outside RtdbDataProvider or for an unmanaged path.
 */
export function useSharedRtdb(path: string): SharedPathState | undefined {
  const context = useContext(RtdbDataContext);
  if (!context) return undefined;
  if (!(SHARED_PATHS as readonly string[]).includes(path)) return undefined;
  return context[path as SharedPath];
}
