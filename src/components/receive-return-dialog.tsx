"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, AlertTriangle, UserCheck, Package, Undo2, ArrowLeftRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Order, Product, StockMovement, User as AppUser, OrderItem } from "@/lib/definitions";
import { useDatabase, useUser } from "@/firebase";
import { ref, update, push, runTransaction } from "firebase/database";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useRtdbList } from "@/hooks/use-rtdb";
import { Separator } from "./ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type ReceiveReturnDialogProps = {
  order: Order;
  trigger: React.ReactNode;
};

export function ReceiveReturnDialog({ order, trigger }: ReceiveReturnDialogProps) {
  const [open, setOpen] = useState(false);
  const [condition, setCondition] = useState<"good" | "damaged">("good");
  const [inspectorId, setInspectorId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // تتبع الكميات التي يتم إرجاعها الآن
  const [returningQuantities, setReturningQuantities] = useState<Record<string, number>>({});

  const { appUser } = useUser();
  const { data: users } = useRtdbList<AppUser>('users');
  const db = useDatabase();
  const { toast } = useToast();

  // تصفية الأصناف المؤجرة فقط
  const rentalItems = useMemo(() => {
      return order.items.filter(item => (item.itemTransactionType || order.transactionType) === 'Rental');
  }, [order.items, order.transactionType]);

  useEffect(() => {
    if (open) {
      if (appUser && !inspectorId) setInspectorId(appUser.id);
      
      // تهيئة الكميات بـ 0 لفرض الإدخال اليدوي ومنع الاستلام الكامل بالخطأ
      const initial: Record<string, number> = {};
      rentalItems.forEach(item => {
          initial[item.productId] = 0;
      });
      setReturningQuantities(initial);
    }
  }, [open, appUser, inspectorId, rentalItems]);

  const handleQtyChange = (productId: string, val: string) => {
      const num = parseInt(val) || 0;
      const item = rentalItems.find(i => i.productId === productId);
      if (!item) return;
      
      const left = item.quantity - (item.returnedQuantity || 0);
      const safeVal = Math.max(0, Math.min(num, left));
      
      setReturningQuantities(prev => ({ ...prev, [productId]: safeVal }));
  };

  const handleConfirm = async () => {
    if (!db || !order.id || !appUser || !inspectorId) return;

    const selectedInspector = users.find(u => u.id === inspectorId);
    if (!selectedInspector) {
        toast({ variant: 'destructive', title: 'خطأ في اختيار الموظف' });
        return;
    }

    const totalToReturn = Object.values(returningQuantities).reduce((a, b) => a + b, 0);
    if (totalToReturn === 0) {
        toast({ variant: 'destructive', title: 'خطأ في الكمية', description: 'يجب اختيار قطعة واحدة على الأقل للاستلام.' });
        return;
    }

    setIsLoading(true);
    try {
      const datePath = order.datePath || format(new Date(order.orderDate), 'yyyy-MM-dd');
      const nowISO = new Date().toISOString();
      const timestamp = format(new Date(), 'dd/MM/yyyy hh:mm a');
      
      // إنشاء نسخة جديدة من الأصناف وتحديث الكميات المرتجعة
      const updatedItems = order.items.map(item => {
        const isRental = (item.itemTransactionType || order.transactionType) === 'Rental';
        if (!isRental) return item;

        const qtyToReturnNow = returningQuantities[item.productId] || 0;
        const alreadyReturned = item.returnedQuantity || 0;
        
        return {
            ...item,
            returnedQuantity: alreadyReturned + qtyToReturnNow
        };
      });

      // التحقق هل تم إرجاع كافة الأصناف المؤجرة؟
      const allRentalsReturned = updatedItems.every(item => {
          const isRental = (item.itemTransactionType || order.transactionType) === 'Rental';
          if (!isRental) return true;
          return (item.returnedQuantity || 0) >= item.quantity;
      });

      // معالجة حركة المخزون للأصناف المستلمة "الآن" فقط
      for (const item of order.items) {
          const qtyToReturnNow = returningQuantities[item.productId] || 0;
          if (qtyToReturnNow > 0) {
              const productRef = ref(db, `products/${item.productId}`);
              await runTransaction(productRef, (currentProduct: Product) => {
                  if (currentProduct) {
                      const quantityBefore = currentProduct.quantityInStock || 0;
                      currentProduct.quantityInStock = quantityBefore + qtyToReturnNow;
                      currentProduct.quantityRented = Math.max(0, (currentProduct.quantityRented || 0) - qtyToReturnNow);

                      const movementRef = push(ref(db, `products/${item.productId}/stockMovements`));
                      const newMovement: StockMovement = {
                          id: movementRef.key!,
                          date: nowISO,
                          type: 'rental_in',
                          quantity: qtyToReturnNow,
                          quantityBefore: quantityBefore,
                          quantityAfter: currentProduct.quantityInStock,
                          notes: `إرجاع ${qtyToReturnNow} قطعة من طلب ${order.orderCode} (الحالة: ${condition === 'good' ? 'جيد' : 'تالف'})`,
                          orderCode: order.orderCode,
                          userId: appUser.id,
                          userName: appUser.fullName,
                      };
                      if (!currentProduct.stockMovements) currentProduct.stockMovements = {};
                      currentProduct.stockMovements[newMovement.id] = newMovement;
                      currentProduct.updatedAt = nowISO;
                  }
                  return currentProduct;
              });
          }
      }

      // تحضير سجل الملاحظات
      const conditionText = condition === "good" ? "جيد" : "تالف";
      const itemsSummary = Object.entries(returningQuantities)
        .filter(([_, q]) => q > 0)
        .map(([pid, q]) => {
            const name = rentalItems.find(i => i.productId === pid)?.productName || 'صنف';
            return `${q} من ${name}`;
        }).join('، ');

      const logEntry = `\n[استلام مرتجع] [${timestamp}] بواسطة ${selectedInspector.fullName}:\n- الأصناف المستلمة حالياً: ${itemsSummary}\n- حالة المنتج: ${conditionText}\n- ملاحظات الفحص: ${notes || "لا يوجد"}`;

      // التحديث النهائي للطلب
      const finalStatus = allRentalsReturned ? 'Returned' : order.status;
      const finalReturnStatus = allRentalsReturned ? 'fully_returned' : 'partially_returned';

      const updates: any = {
        status: finalStatus,
        returnStatus: finalReturnStatus,
        returnedAt: nowISO,
        returnedToEmployeeId: selectedInspector.id,
        returnedToEmployeeName: selectedInspector.fullName,
        returnCondition: condition,
        items: updatedItems,
        notes: (order.notes || "") + logEntry,
        updatedAt: nowISO,
      };

      await update(ref(db, `daily-entries/${datePath}/orders/${order.id}`), updates);

      toast({
        title: allRentalsReturned ? "تم اكتمال إرجاع الطلب" : "تم الاستلام الجزئي",
        description: allRentalsReturned 
            ? `تم إرجاع كافة الأصناف لطلب ${order.orderCode} بنجاح.` 
            : `تم استلام ${totalToReturn} قطعة، وبانتظار المتبقي.`
      });
      
      setOpen(false);
      setNotes("");
      setCondition("good");
    } catch (error: any) {
      console.error("Return Process Error:", error);
      toast({ variant: "destructive", title: "خطأ في التحديث", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right">
            <Undo2 className="h-5 w-5 text-primary" />
            استلام وفحص مرتجع - {order.orderCode}
          </DialogTitle>
          <DialogDescription className="text-right">
            حدد الكميات التي يتم استلامها "الآن" من العميل {order.customerName}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="rounded-lg border overflow-hidden">
             <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="text-right text-xs">الصنف المؤجر</TableHead>
                        <TableHead className="text-center text-xs">الإجمالي</TableHead>
                        <TableHead className="text-center text-xs">مستلم سابقاً</TableHead>
                        <TableHead className="text-center text-xs w-[100px]">يتم استلامه الآن</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rentalItems.map((item) => {
                        const left = item.quantity - (item.returnedQuantity || 0);
                        return (
                            <TableRow key={item.productId}>
                                <TableCell className="text-right py-2">
                                    <p className="font-bold text-xs">{item.productName}</p>
                                    <p className="text-[10px] text-muted-foreground font-mono">{item.productCode}</p>
                                </TableCell>
                                <TableCell className="text-center font-mono">{item.quantity}</TableCell>
                                <TableCell className="text-center font-mono text-green-600 font-bold">{item.returnedQuantity || 0}</TableCell>
                                <TableCell className="text-center">
                                    {left > 0 ? (
                                        <Input 
                                            type="number" 
                                            min={0} 
                                            max={left} 
                                            value={returningQuantities[item.productId] ?? 0}
                                            onChange={(e) => handleQtyChange(item.productId, e.target.value)}
                                            className="h-8 text-center font-bold font-mono border-primary/40 focus-visible:ring-primary"
                                        />
                                    ) : (
                                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">مكتمل</Badge>
                                    )}
                                </TableCell>
                            </TableRow>
                        )
                    })}
                    {rentalItems.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                                لا توجد أصناف مؤجرة في هذه الفاتورة.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
             </Table>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 font-bold"><UserCheck className="h-4 w-4 text-primary" /> الموظف المستلم</Label>
                <Select value={inspectorId} onValueChange={setInspectorId}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="اختر الموظف..." /></SelectTrigger>
                    <SelectContent>
                        {users.filter(u => u.isActive).map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="font-bold">حالة الأصناف المستلمة الآن</Label>
                <RadioGroup value={condition} onValueChange={(v) => setCondition(v as any)} className="grid grid-cols-2 gap-2">
                  <Label htmlFor="cond-good" className={cn("flex flex-col items-center justify-center p-2 rounded-md border-2 cursor-pointer hover:bg-accent", condition === 'good' ? "border-primary bg-primary/5" : "border-muted")}>
                    <RadioGroupItem value="good" id="cond-good" className="sr-only" />
                    <CheckCircle2 className={cn("h-4 w-4 mb-1", condition === 'good' ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-xs font-bold">جيد</span>
                  </Label>
                  <Label htmlFor="cond-damaged" className={cn("flex flex-col items-center justify-center p-2 rounded-md border-2 cursor-pointer hover:bg-accent", condition === 'damaged' ? "border-destructive bg-destructive/5" : "border-muted")}>
                    <RadioGroupItem value="damaged" id="cond-damaged" className="sr-only" />
                    <AlertTriangle className={cn("h-4 w-4 mb-1", condition === 'damaged' ? "text-destructive" : "text-muted-foreground")} />
                    <span className="text-xs font-bold">تالف</span>
                  </Label>
                </RadioGroup>
              </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="receive-notes" className="text-xs">ملاحظات الفحص / تفاصيل التلف</Label>
            <Textarea
              id="receive-notes"
              placeholder="أدخل أي ملاحظات هامة عن حالة المنتج المستلم..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading} className="flex-1 h-11">إلغاء</Button>
          <Button 
            onClick={handleConfirm} 
            disabled={isLoading || !inspectorId || rentalItems.length === 0}
            className="flex-1 h-11 gap-2 bg-green-600 hover:bg-green-700"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            تأكيد الاستلام والتحديث
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
