'use client';

/**
 * ProductsDataProvider — single delta-sync listener for the products catalog.
 * Hydrates from IndexedDB first, then listens only for updatedAt >= last local update.
 * Strips stockMovements from list payloads to reduce memory usage.
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
import { ref, onValue, off, query, orderByChild, startAt } from 'firebase/database';
import { useDatabase } from '@/firebase';
import { db as localDb } from '@/lib/db';
import type { Product } from '@/lib/definitions';
import { stripEmbeddedStockMovements } from '@/lib/stock-movements';

export interface ProductsPathState {
  data: Product[];
  isLoading: boolean;
  isSyncing: boolean;
  error: Error | null;
}

const defaultState: ProductsPathState = {
  data: [],
  isLoading: true,
  isSyncing: false,
  error: null,
};

const ProductsDataContext = createContext<ProductsPathState | undefined>(undefined);

export function ProductsDataProvider({ children }: { children: ReactNode }) {
  const database = useDatabase();
  const [state, setState] = useState<ProductsPathState>(defaultState);
  const productsRef = useRef<Product[]>([]);
  const hydratedRef = useRef(false);

  const mergeProducts = useCallback((updates: Product[]) => {
    const productMap = new Map<string, Product>();
    productsRef.current.forEach((p) => productMap.set(p.id, p));
    updates.forEach((item) => productMap.set(item.id, item));

    const combined = Array.from(productMap.values()).sort((a, b) =>
      (b.updatedAt || b.createdAt || '') > (a.updatedAt || a.createdAt || '') ? 1 : -1
    );

    productsRef.current = combined;
    setState((prev) => ({ ...prev, data: combined }));
  }, []);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const hydrate = async () => {
      try {
        const cached = await localDb.persistentCache.where('path').equals('products').toArray();
        if (cached.length > 0) {
          const loaded = cached.map((item) => stripEmbeddedStockMovements(item.data as Product));
          productsRef.current = loaded;
          setState((prev) => ({ ...prev, data: loaded, isLoading: true }));
        }
      } catch (e) {
        console.warn('ProductsDataProvider: IndexedDB hydration failed', e);
      }
    };

    hydrate();
  }, []);

  useEffect(() => {
    if (!database) return;

    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    const startSync = async () => {
      const productsDbRef = ref(database, 'products');

      let lastUpdate = '2000-01-01T00:00:00.000Z';
      if (productsRef.current.length > 0) {
        const sorted = [...productsRef.current].sort((a, b) =>
          (b.updatedAt || b.createdAt || '') > (a.updatedAt || a.createdAt || '') ? 1 : -1
        );
        lastUpdate = sorted[0].updatedAt || sorted[0].createdAt || lastUpdate;
      }

      const syncQuery = query(productsDbRef, orderByChild('updatedAt'), startAt(lastUpdate));

      const handleSnapshot = async (snapshot: { exists: () => boolean; val: () => unknown }) => {
        if (!isMounted) return;

        if (!snapshot.exists()) {
          setState((prev) => ({ ...prev, isLoading: false, isSyncing: false }));
          return;
        }

        const newItems = snapshot.val() as Record<string, Product>;
        const updates: Product[] = [];

        for (const id of Object.keys(newItems)) {
          const productData = stripEmbeddedStockMovements({ ...newItems[id], id });
          updates.push(productData);

          await localDb.persistentCache.put({
            key: `products/${id}`,
            path: 'products',
            id,
            data: productData,
            updatedAt: productData.updatedAt || new Date().toISOString(),
          });
        }

        mergeProducts(updates);
        setState((prev) => ({ ...prev, isLoading: false, isSyncing: false, error: null }));
      };

      const handleError = (err: Error) => {
        if (!isMounted) return;
        console.error('ProductsDataProvider: sync error', err);
        setState((prev) => ({ ...prev, isLoading: false, isSyncing: false, error: err }));
      };

      setState((prev) => ({ ...prev, isSyncing: true }));
      onValue(syncQuery, handleSnapshot, handleError);
      unsubscribe = () => off(syncQuery, 'value', handleSnapshot);
    };

    startSync();

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [database, mergeProducts]);

  return (
    <ProductsDataContext.Provider value={state}>
      {children}
    </ProductsDataContext.Provider>
  );
}

export function useSharedProducts(): ProductsPathState | undefined {
  return useContext(ProductsDataContext);
}
