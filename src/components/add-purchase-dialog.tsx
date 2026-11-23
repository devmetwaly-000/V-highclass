
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePickerDialog } from './ui/date-picker-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useRtdbList } from '@/hooks/use-rtdb';
import type { Supplier, Product, PurchaseOrder, Counter, Treasury } from '@/lib/definitions';
import { useDatabase, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { ref, set, push, get, runTransaction, update } from 'firebase/database';
import { runProductStockTransaction } from '@/lib/stock-movements';
import { PlusCircle, Trash2, Landmark, Wallet, AlertTriangle } from 'lucide-react';
import { ProductCombobox } from './product-combobox';
import { AddProductDialog } from './add-product-dialog';
import { format } from 'date-fns';
import { AddSupplierDialog } from './add-supplier-dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type PurchaseItem = {
    id: string; // Unique ID for React key
    productId?: string;
    productName: string;
    quantity: number;
    costPrice: number;
    totalCost: number;
    isNew: boolean;
};

type AddPurchaseDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    purchaseOrder?: PurchaseOrder;
};

export function AddPurchaseDialog({ open, onOpenChange, purchaseOrder }: AddPurchaseDialogProps) {
    const isViewMode = !!purchaseOrder;
    const { appUser } = useUser();
    const db = useDatabase();
    const { toast } = useToast();
    
    const [supplierId, setSupplierId] = useState<string | undefined>();
    const [purchaseDate, setPurchaseDate] = useState<Date | undefined>(new Date());
    const [items, setItems] = useState<PurchaseItem[]>([]);
    const [notes, setNotes] = useState('');
    const [showAddProduct, setShowAddProduct] = useState(false);
    const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
    const [treasuryId, setTreasuryId] = useState<string>('');

    const { data: suppliers, isLoading: suppliersLoading } = useRtdbList<Supplier>('suppliers');
    const { data: products, isLoading: productsLoading } = useRtdbList<Product>('products');
    const { data: counters, isLoading: countersLoading } = useRtdbList<Counter>('counters');
    const { data: treasuries, isLoading: treasuriesLoading } = useRtdbList<Treasury>('treasuries');

    useEffect(() => {
        if (open) {
            if (isViewMode && purchaseOrder) {
                setSupplierId(purchaseOrder.supplierId);
                setPurchaseDate(new Date(purchaseOrder.purchaseDate));
                setItems(purchaseOrder.items.map(item => ({
                    id: item.productId,
                    productId: item.productId,
                    productName: products.find(p => p.id === item.productId)?.name || 'منتج غير معروف',
                    quantity: item.quantity,
                    costPrice: item.costPrice,
                    totalCost: item.quantity * item.costPrice,
                    isNew: false
                })));
                setNotes(purchaseOrder.notes || '');
                setTreasuryId(purchaseOrder.treasuryId || '');
            } else {
                setSupplierId(undefined);
                setPurchaseDate(new Date());
                setItems([]);
                setNotes('');
                if (treasuries.length > 0) {
                    setTreasuryId(treasuries[0].id);
                } else {
                    setTreasuryId('');
                }
            }
        }
    }, [open, purchaseOrder, isViewMode, products, treasuries]);

    useEffect(() => {
        if (!isViewMode && treasuries.length > 0 && !treasuryId) {
            setTreasuryId(treasuries[0].id);
        }
    }, [treasuries, isViewMode, treasuryId]);

    const selectedTreasury = useMemo(() => {
        return treasuries.find(t => t.id === treasuryId);
    }, [treasuries, treasuryId]);
    
    const getNextPurchaseCode = useCallback(async () => {
        if (countersLoading) return '';
        const counterRef = ref(db, 'counters/purchaseOrders');
        let nextCode = '';

        try {
            const { committed, snapshot } = await runTransaction(counterRef, (currentData) => {
                if (currentData === null) {
                    return { name: 'purchaseOrders', prefix: 'P', value: 10001 };
                }
                currentData.value++;
                return currentData;
            });

            if (committed && snapshot && snapshot.exists()) {
                const counter = snapshot.val();
                nextCode = `${counter.prefix}${counter.value}`;
            } else {
                 const snapshot = await get(counterRef);
                if(snapshot.exists()){
                    const counter = snapshot.val();
                    nextCode = `${counter.prefix}${(counter.value + (committed ? 0 : 1))}`;
                } else {
                     throw new Error("Could not read counter after transaction abort.");
                }
            }
        } catch (error) {
            console.error("Transaction failed: ", error);
            toast({
                title: "فشل إنشاء كود الفاتورة",
                description: "لم يتمكن من الحصول على كود جديد من قاعدة البيانات.",
                variant: "destructive"
            });
        }
        return nextCode;
    }, [db, countersLoading, toast]);


    const handleProductSelect = (itemId: string, productId: string) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        setItems(prevItems => prevItems.map(item => 
            item.id === itemId ? {
                ...item,
                productId: product.id,
                productName: `${product.name} - ${product.size}`,
                costPrice: Number(product.price) / 2, // default cost price
                totalCost: (Number(product.price) / 2) * item.quantity,
                isNew: false,
            } : item
        ));
    };

    const handleItemChange = (itemId: string, field: keyof PurchaseItem, value: any) => {
        setItems(prevItems => {
            const newItems = prevItems.map(item => {
                if (item.id === itemId) {
                    const updatedItem = { ...item, [field]: value };
                    if (field === 'quantity' || field === 'costPrice') {
                        updatedItem.totalCost = (updatedItem.quantity || 0) * (updatedItem.costPrice || 0);
                    }
                    return updatedItem;
                }
                return item;
            });
            return newItems;
        });
    };

    const addItem = () => {
        setItems(prev => [...prev, {
            id: Date.now().toString(),
            productName: 'منتج جديد',
            quantity: 1,
            costPrice: 0,
            totalCost: 0,
            isNew: true,
        }]);
    };

    const removeItem = (id: string) => {
        setItems(prev => prev.filter(item => item.id !== id));
    };

    const totalCost = useMemo(() => items.reduce((sum, item) => sum + item.totalCost, 0), [items]);

    const handleSave = async () => {
        if (!supplierId || !purchaseDate || items.length === 0 || items.some(i => !i.productId)) {
            toast({ variant: 'destructive', title: 'بيانات غير كاملة', description: "الرجاء التأكد من اختيار المورد وتاريخ الفاتورة وجميع الأصناف." });
            return;
        }

        if (!treasuryId) {
            toast({ variant: 'destructive', title: 'بيانات غير كاملة', description: "الرجاء تحديد الخزينة التي سيتم صرف قيمة الفاتورة منها." });
            return;
        }

        const selectedTreasury = treasuries.find(t => t.id === treasuryId);
        if (!selectedTreasury) {
            toast({ variant: 'destructive', title: 'خطأ', description: "الخزينة المحددة غير موجودة." });
            return;
        }

        if (!appUser) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'المستخدم غير معروف.' });
            return;
        }
        
        const purchaseOrderCode = await getNextPurchaseCode();
        if (!purchaseOrderCode) return;

        // Process stock updates
        for (const item of items) {
            if (!item.productId) continue;

            await runProductStockTransaction(db, item.productId, (currentProduct) => {
                const quantityBefore = currentProduct.quantityInStock || 0;
                currentProduct.quantityInStock = quantityBefore + item.quantity;

                return {
                    date: new Date().toISOString(),
                    type: 'addition',
                    quantity: item.quantity,
                    quantityBefore,
                    quantityAfter: currentProduct.quantityInStock,
                    notes: `فاتورة شراء ${purchaseOrderCode}`,
                    userId: appUser.id,
                    userName: appUser.fullName,
                };
            });
        }
        
        const nowISO = new Date().toISOString();

        // الخصم المباشر من رصيد الخزينة وتسجيل حركة الصرف بداخلها
        const treasuryRef = ref(db, `treasuries/${treasuryId}`);
        const txRef = push(ref(db, `treasuries/${treasuryId}/transactions`));
        const txId = txRef.key!;

        await runTransaction(treasuryRef, (t: Treasury) => {
            if (t) {
                t.balance = (t.balance || 0) - totalCost;
                t.updatedAt = nowISO;
                if (!t.transactions) t.transactions = {};
                t.transactions[txId] = {
                    id: txId,
                    type: 'expense',
                    amount: -totalCost,
                    description: `فاتورة مشتريات ${purchaseOrderCode} - مورد: ${suppliers.find(s => s.id === supplierId)?.name || ''}`,
                    date: nowISO,
                    userId: appUser.id,
                    userName: appUser.fullName,
                    notes: notes || undefined
                };
            }
            return t;
        });

        // تسجيل المصروف في جدول المصروفات العام مرتبطاً بالخزينة (مستثنى من نقدية الوردية)
        const expenseRef = push(ref(db, 'expenses'));
        const expenseId = expenseRef.key!;
        await set(expenseRef, {
            id: expenseId,
            amount: totalCost,
            category: 'مشتريات وبضاعة',
            description: `فاتورة مشتريات ${purchaseOrderCode} - مورد: ${suppliers.find(s => s.id === supplierId)?.name || ''}`,
            date: format(purchaseDate, 'yyyy-MM-dd'),
            treasuryId: treasuryId,
            userId: appUser.id,
            userName: appUser.fullName,
            notes: `تم الصرف من خزينة: ${selectedTreasury.name}`,
            createdAt: nowISO,
            updatedAt: nowISO
        });

        const purchaseData = {
            purchaseOrderCode,
            supplierId,
            supplierName: suppliers.find(s => s.id === supplierId)?.name || '',
            purchaseDate: format(purchaseDate, 'yyyy-MM-dd'),
            items: items.map(({ id, productName, isNew, totalCost, ...rest }) => rest),
            totalCost,
            treasuryId,
            treasuryName: selectedTreasury.name,
            expenseId,
            notes,
            createdAt: nowISO,
            userId: appUser.id,
            userName: appUser.fullName
        };

        const newPurchaseRef = push(ref(db, 'purchaseOrders'));
        const newId = newPurchaseRef.key;
        if (!newId) throw new Error("Failed to create purchase order ID.");
        
        await set(newPurchaseRef, { ...purchaseData, id: newId });
        
        toast({ 
            title: "تم حفظ فاتورة الشراء بنجاح",
            description: `تم خصم ${totalCost.toLocaleString()} ج.م من خزينة (${selectedTreasury.name}) بنجاح.` 
        });
        onOpenChange(false);
    };

    return (
        <>
            <AddSupplierDialog 
                open={isAddSupplierOpen} 
                onOpenChange={setIsAddSupplierOpen}
                onSupplierCreated={setSupplierId}
            />
            <AddProductDialog open={showAddProduct} onOpenChange={setShowAddProduct} />
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{isViewMode ? `عرض فاتورة شراء ${purchaseOrder?.purchaseOrderCode}` : 'إضافة فاتورة شراء جديدة'}</DialogTitle>
                        <DialogDescription>{isViewMode ? `تفاصيل الفاتورة المستلمة من المورد.` : 'سجل فاتورة شراء جديدة وأضف الأصناف للمخزون.'}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-4 max-h-[70vh] overflow-y-auto pr-4 pl-1">
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="supplier">المورد</Label>
                                <div className="flex gap-2">
                                    <Select value={supplierId} onValueChange={setSupplierId} disabled={suppliersLoading || isViewMode}>
                                        <SelectTrigger id="supplier">
                                            <SelectValue placeholder="اختر المورد" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                     {!isViewMode && (
                                        <Button type="button" variant="outline" size="icon" onClick={() => setIsAddSupplierOpen(true)}>
                                            <PlusCircle className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="purchaseDate">تاريخ الفاتورة</Label>
                                <DatePickerDialog value={purchaseDate} onValueChange={setPurchaseDate} disabled={isViewMode} />
                            </div>
                        </div>

                        {/* جهة صرف المبلغ النهائي (الخزينة) */}
                        <div className="rounded-lg border p-3.5 bg-muted/20 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <Landmark className="h-4 w-4 text-primary shrink-0" />
                                    <div>
                                        <Label htmlFor="treasury" className="font-bold text-xs sm:text-sm">جهة صرف المبلغ النهائي (الخزينة)</Label>
                                        <p className="text-[11px] text-muted-foreground">يتم صرف قيمة المشتريات بالكامل من الخزينة الرئيسية المختارة وليس من الوردية</p>
                                    </div>
                                </div>
                                {selectedTreasury && (
                                    <Badge variant="outline" className="font-mono text-xs gap-1.5 px-2.5 py-1 bg-background self-start sm:self-auto shrink-0">
                                        <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                                        الرصيد الحالي: <span className="font-bold text-primary">{Math.round(selectedTreasury.balance || 0).toLocaleString()} ج.م</span>
                                    </Badge>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <Select 
                                    value={treasuryId} 
                                    onValueChange={setTreasuryId} 
                                    disabled={treasuriesLoading || isViewMode}
                                >
                                    <SelectTrigger id="treasury" className="w-full bg-background">
                                        <SelectValue placeholder="اختر الخزينة التي سيتم الصرف منها..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {treasuries.map(t => (
                                            <SelectItem key={t.id} value={t.id} className="py-2">
                                                <div className="flex items-center justify-between gap-4 w-full">
                                                    <span className="font-semibold">{t.name}</span>
                                                    <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                                        الرصيد: {Math.round(t.balance || 0).toLocaleString()} ج.م
                                                    </span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {selectedTreasury && totalCost > 0 && !isViewMode && (
                                <div className={cn(
                                    "p-2.5 rounded-md text-xs flex items-center justify-between border",
                                    selectedTreasury.balance >= totalCost 
                                        ? "bg-green-500/10 border-green-500/30 text-green-800 dark:text-green-300"
                                        : "bg-destructive/10 border-destructive/30 text-[#CD5C5C] font-bold"
                                )}>
                                    <div className="flex items-center gap-2">
                                        {selectedTreasury.balance < totalCost && <AlertTriangle className="h-4 w-4 shrink-0" />}
                                        <span>
                                            {selectedTreasury.balance >= totalCost 
                                                ? `سيتم خصم ${totalCost.toLocaleString()} ج.م من (${selectedTreasury.name}) - الرصيد بعد الخصم: ${(selectedTreasury.balance - totalCost).toLocaleString()} ج.م`
                                                : `تنبيه: رصيد الخزينة (${Math.round(selectedTreasury.balance).toLocaleString()} ج.م) أقل من قيمة الفاتورة (${totalCost.toLocaleString()} ج.م).`}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {isViewMode && purchaseOrder?.treasuryName && (
                                <div className="text-xs text-muted-foreground">
                                    تم صرف هذه الفاتورة من خزينة: <strong className="text-foreground">{purchaseOrder.treasuryName}</strong>
                                </div>
                            )}
                        </div>
                        
                        <div className="space-y-4">
                            <Label className="font-semibold">الأصناف</Label>
                            <div className="space-y-4 rounded-md border p-4">
                                {items.map(item => (
                                    <div key={item.id} className="grid grid-cols-12 gap-2 items-end">
                                        <div className="col-span-12 md:col-span-6 space-y-1">
                                            <Label className="text-xs">الصنف</Label>
                                            <ProductCombobox
                                                products={products}
                                                value={item.productId || ''}
                                                onChange={(productId) => handleProductSelect(item.id, productId)}
                                                disabled={productsLoading || isViewMode}
                                                placeholder="ابحث أو اختر منتج..."
                                            />
                                        </div>
                                        <div className="col-span-4 md:col-span-2 space-y-1">
                                            <Label className="text-xs">الكمية</Label>
                                            <Input type="number" value={item.quantity} onChange={e => handleItemChange(item.id, 'quantity', parseInt(e.target.value) || 0)} disabled={isViewMode} />
                                        </div>
                                        <div className="col-span-4 md:col-span-2 space-y-1">
                                            <Label className="text-xs">سعر التكلفة</Label>
                                            <Input type="number" value={item.costPrice} onChange={e => handleItemChange(item.id, 'costPrice', parseFloat(e.target.value) || 0)} disabled={isViewMode} />
                                        </div>
                                        <div className="col-span-3 md:col-span-1 space-y-1">
                                            <Label className="text-xs">الإجمالي</Label>
                                            <Input value={item.totalCost.toLocaleString()} readOnly className="bg-muted border-none" />
                                        </div>
                                        {!isViewMode && (
                                            <div className="col-span-1 flex items-center h-full">
                                                <Button variant="destructive" size="icon" onClick={() => removeItem(item.id)}><Trash2 className="h-4 w-4"/></Button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {!isViewMode && (
                                    <div className="flex gap-2">
                                        <Button variant="outline" onClick={addItem} className="gap-1 mt-4">
                                            <PlusCircle className="h-4 w-4" />
                                            إضافة صنف
                                        </Button>
                                        <Button variant="secondary" onClick={() => setShowAddProduct(true)} className="gap-1 mt-4">
                                            <PlusCircle className="h-4 w-4" />
                                            إنشاء صنف جديد
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="notes">ملاحظات</Label>
                                <Input id="notes" value={notes} onChange={e => setNotes(e.target.value)} disabled={isViewMode} />
                            </div>
                            <div className="space-y-2">
                                <Label>الإجمالي النهائي للفاتورة</Label>
                                <Input value={`${totalCost.toLocaleString()} ج.م`} readOnly className="bg-muted text-lg font-bold text-primary" />
                            </div>
                        </div>

                    </div>
                    {!isViewMode && (
                        <DialogFooter>
                            <Button onClick={handleSave}>حفظ الفاتورة</Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
