/** @deprecated Use stripEmbeddedStockMovements from @/lib/stock-movements */
export { stripEmbeddedStockMovements as stripStockMovements } from '@/lib/stock-movements';

export function stripStockMovementsList<T extends { stockMovements?: unknown }>(items: T[]): T[] {
  return items.map((item) => {
    if (!item.stockMovements) return item;
    const { stockMovements: _removed, ...rest } = item;
    return rest as T;
  });
}

/** Keep only orders within the last N daily-entry date keys. */
export function applyDailyEntriesDateLimit<T extends { datePath?: string }>(
  orders: T[],
  limit: number
): T[] {
  if (!limit || limit <= 0) return orders;

  const datePaths = Array.from(
    new Set(orders.map((o) => o.datePath).filter(Boolean) as string[])
  ).sort();

  const allowedDates = new Set(datePaths.slice(Math.max(0, datePaths.length - limit)));
  return orders.filter((o) => o.datePath && allowedDates.has(o.datePath));
}
