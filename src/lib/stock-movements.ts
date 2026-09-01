import { ref, runTransaction, push, set, type Database } from 'firebase/database';
import type { Product, StockMovement } from '@/lib/definitions';

/** Top-level RTDB path: stockMovements/{productId}/{movementId} */
export const STOCK_MOVEMENTS_ROOT = 'stockMovements';

export function getProductStockMovementsPath(productId: string): string {
  return `${STOCK_MOVEMENTS_ROOT}/${productId}`;
}

export function stripEmbeddedStockMovements<T extends { stockMovements?: unknown }>(product: T): T {
  if (!product.stockMovements) return product;
  const { stockMovements: _removed, ...rest } = product;
  return rest as T;
}

export type StockMovementInput = Omit<StockMovement, 'id' | 'date'> & {
  id?: string;
  date?: string;
};

/**
 * Updates product stock fields in a transaction (without embedding movements),
 * then writes the movement record to stockMovements/{productId}/{movementId}.
 */
export async function runProductStockTransaction(
  db: Database,
  productId: string,
  mutate: (product: Product) => StockMovementInput | null | void
): Promise<StockMovement | null> {
  const movementRef = push(ref(db, getProductStockMovementsPath(productId)));
  const movementId = movementRef.key;
  if (!movementId) throw new Error('فشل إنشاء معرف حركة المخزون.');

  let savedMovement: StockMovement | null = null;

  await runTransaction(ref(db, `products/${productId}`), (current) => {
    if (!current) return current;

    if (current.stockMovements) {
      delete current.stockMovements;
    }

    const movementInput = mutate(current as Product);
    if (movementInput) {
      savedMovement = {
        ...movementInput,
        id: movementId,
        date: movementInput.date || new Date().toISOString(),
      };
    }

    return current;
  });

  if (savedMovement) {
    await set(movementRef, savedMovement);
  }

  return savedMovement;
}

export async function saveStockMovement(
  db: Database,
  productId: string,
  movement: StockMovement
): Promise<void> {
  await set(ref(db, `${getProductStockMovementsPath(productId)}/${movement.id}`), movement);
}

export function mergeStockMovements(
  primary: StockMovement[],
  legacy?: Record<string, StockMovement> | null
): StockMovement[] {
  const map = new Map<string, StockMovement>();

  if (legacy) {
    Object.values(legacy).forEach((m) => {
      if (m?.id) map.set(m.id, m);
    });
  }

  primary.forEach((m) => {
    if (m?.id) map.set(m.id, m);
  });

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function flattenStockMovementsSnapshot(val: Record<string, StockMovement> | null): StockMovement[] {
  if (!val) return [];
  return Object.values(val).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}
