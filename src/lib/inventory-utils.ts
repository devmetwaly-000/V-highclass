import { ref, runTransaction, push, type Database } from 'firebase/database';
import type { StockMovement } from '@/lib/definitions';

type InventoryUser = {
  id: string;
  fullName: string;
};

export async function applyInventoryCount(
  db: Database,
  productId: string,
  newQuantity: number,
  appUser: InventoryUser,
  notes?: string
): Promise<void> {
  const productRef = ref(db, `products/${productId}`);

  await runTransaction(productRef, (currentData) => {
    if (currentData) {
      const nowISO = new Date().toISOString();
      const movementRef = push(ref(db, `products/${productId}/stockMovements`));

      const quantityBefore = currentData.quantityInStock || 0;
      const quantityAfter = newQuantity;
      const adjustment = quantityAfter - quantityBefore;

      const newMovement: StockMovement = {
        id: movementRef.key!,
        date: nowISO,
        type: 'inventory',
        quantity: adjustment,
        quantityBefore,
        quantityAfter,
        notes: notes || 'جرد مخزني',
        userId: appUser.id,
        userName: appUser.fullName,
      };

      currentData.quantityInStock = quantityAfter;
      currentData.initialStock = (currentData.initialStock || 0) + adjustment;
      currentData.updatedAt = nowISO;

      if (!currentData.stockMovements) {
        currentData.stockMovements = {};
      }
      currentData.stockMovements[newMovement.id] = newMovement;
    }
    return currentData;
  });
}

export type InventoryImportRow = {
  productCode: string;
  quantity: number;
  rowNumber: number;
};

export type InventoryImportError = {
  rowNumber: number;
  productCode: string;
  message: string;
};

export function parseInventoryExcelRows(
  rawRows: Record<string, unknown>[]
): { validRows: InventoryImportRow[]; errors: InventoryImportError[] } {
  const validRows: InventoryImportRow[] = [];
  const errors: InventoryImportError[] = [];

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const keys = Object.keys(row);
    const codeKey = keys.find(
      (k) =>
        k.toLowerCase().includes('code') ||
        k.toLowerCase().includes('كود') ||
        k === 'Product Code'
    );
    const qtyKey = keys.find(
      (k) =>
        k.toLowerCase() === 'qty' ||
        k.toLowerCase().includes('quantity') ||
        k.includes('كمية') ||
        k === 'QTY'
    );

    const productCode = String(codeKey ? row[codeKey] : '').trim();
    const rawQty = qtyKey ? row[qtyKey] : undefined;

    if (!productCode) {
      errors.push({ rowNumber, productCode: '', message: 'كود الصنف مطلوب' });
      return;
    }

    if (rawQty === undefined || rawQty === null || rawQty === '') {
      errors.push({ rowNumber, productCode, message: 'الكمية مطلوبة' });
      return;
    }

    const quantity = Number(rawQty);
    if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 0) {
      errors.push({
        rowNumber,
        productCode,
        message: 'الكمية يجب أن تكون رقماً صحيحاً موجباً أو صفراً',
      });
      return;
    }

    validRows.push({ productCode, quantity, rowNumber });
  });

  return { validRows, errors };
}
