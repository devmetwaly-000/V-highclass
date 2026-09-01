'use client';

import { useEffect, useMemo, useState } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { useDatabase } from '@/firebase';
import type { StockMovement } from '@/lib/definitions';
import {
  flattenStockMovementsSnapshot,
  getProductStockMovementsPath,
  mergeStockMovements,
} from '@/lib/stock-movements';

/**
 * Lazy-loads stock movements for a single product from stockMovements/{productId}.
 * Merges legacy embedded movements (products/{id}/stockMovements) when present.
 */
export function useProductStockMovements(
  productId: string | undefined,
  legacyMovements?: Record<string, StockMovement> | null
) {
  const db = useDatabase();
  const [remoteMovements, setRemoteMovements] = useState<StockMovement[]>([]);
  const [isLoading, setIsLoading] = useState(!!productId);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!db || !productId) {
      setRemoteMovements([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const movementsRef = ref(db, getProductStockMovementsPath(productId));

    const handleSnapshot = (snapshot: { val: () => unknown }) => {
      const val = snapshot.val() as Record<string, StockMovement> | null;
      setRemoteMovements(flattenStockMovementsSnapshot(val));
      setIsLoading(false);
      setError(null);
    };

    const handleError = (err: Error) => {
      console.error(`Stock movements listener error for ${productId}:`, err);
      setError(err);
      setIsLoading(false);
    };

    onValue(movementsRef, handleSnapshot, handleError);

    return () => off(movementsRef, 'value', handleSnapshot);
  }, [db, productId]);

  const stockMovements = useMemo(
    () => mergeStockMovements(remoteMovements, legacyMovements),
    [remoteMovements, legacyMovements]
  );

  return { stockMovements, isLoading, error };
}
