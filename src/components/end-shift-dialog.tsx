"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, Calculator, Wallet, ArrowUpCircle, ArrowDownCircle, Lock } from "lucide-react";
import type { Shift, Order, Expense } from "@/lib/definitions";
import { Separator } from "./ui/separator";
import { useDatabase } from "@/firebase";
import { ref, update } from "firebase/database";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";

type EndShiftDialogProps = {
  shift: Shift;
  orders: Order[];
  expenses: Expense[];
  trigger: React.ReactNode;
};

const formatCurrency = (amount: number) => `${Math.round(amount).toLocaleString()} ج.م`;

export function EndShiftDialog({ shift, orders, expenses, trigger }: EndShiftDialogProps) {
  const [open, setOpen] = useState(false);
  const [closingBalance, setClosingBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const db = useDatabase();
  const { toast } = useToast();
  const { permissions } = usePermissions(['shifts:view-details'] as const);

  const canSeeDetails = permissions.canShiftsViewDetails;

  const stats = useMemo(() => {
    let receivedCash = 0;
    let expenseTotal = 0;
    let saleReturnsTotal = 0;
    let salesGross = 0;
    let rentalsGross = 0;

    const shiftStartTime = new Date(shift.startTime);
    const shiftEndTime = shift.endTime ? new Date(shift.endTime) : new Date(8640000000000000);

    orders.forEach(order => {
        if (order.status === 'Cancelled') return;
        const creationDate = new Date(order.createdAt || order.orderDate);
        const orderIsLinked = order.shiftId === shift.id;
        const isLegacyMatch = !order.shiftId && 
                             order.processedByUserId === shift.cashier.id && 
                             creationDate >= shiftStartTime && 
                             creationDate <= shiftEndTime;
        
        if (orderIsLinked || isLegacyMatch) {
            const subtotal = order.items.reduce((acc, item) => acc + (item.priceAtTimeOfOrder * item.quantity), 0);
            if (order.transactionType === 'Sale') salesGross += subtotal;
            else rentalsGross += subtotal;
        }

        if (order.payments) {
            Object.values(order.payments).forEach((p: any) => {
                const pDate = new Date(p.date);
                const paymentIsLinked = p.shiftId === shift.id;
                if (paymentIsLinked || (!p.shiftId && p.userId === shift.cashier.id && pDate >= shiftStartTime && pDate <= shiftEndTime)) {
                    if (p.method !== 'Vodafone Cash' && p.method !== 'InstaPay' && p.method !== 'Visa') {
                        receivedCash += p.amount;
                    }
                }
            });
        } else if (order.paid > 0 && (orderIsLinked || isLegacyMatch)) {
            receivedCash += order.paid;
        }
    });

    expenses.forEach(e => {
        const eDate = new Date(e.date);
        const expenseIsLinked = e.shiftId === shift.id;
        if (expenseIsLinked || (!e.shiftId && e.userId === shift.cashier.id && eDate >= shiftStartTime && eDate <= shiftEndTime)) {
            if (e.category === 'مرتجعات بيع' || e.category === 'مرتجع بيع' || e.category === 'إلغاء طلبات') {
                saleReturnsTotal += e.amount;
            } else {
                expenseTotal += e.amount;
            }
        }
    });

    const cashInDrawer = (Number(shift.openingBalance) || 0) + receivedCash - (expenseTotal + saleReturnsTotal);
    
    return {
        receivedCash,
        expenseTotal,
        saleReturnsTotal,
        cashInDrawer,
        totalRevenue: salesGross + rentalsGross
    };
  }, [shift, orders, expenses]);

  const handleEndShift = async () => {
    setIsLoading(true);
    try {
        const shiftRef = ref(db, `shifts/${shift.id}`);
        await update(shiftRef, {
            endTime: new Date().toISOString(),
            closingBalance: closingBalance,
            cash: stats.receivedCash,
            refunds: stats.expenseTotal + stats.saleReturnsTotal,
            updatedAt: new Date().toISOString(),
        });

        toast({
            title: "تم إنهاء الوردية بنجاح",
            description: `تم إغلاق وردية ${shift.cashier.name} واستلام المبلغ الفعلي.`,
        });
        setOpen(false);
        setClosingBalance(0);
    } catch(error: any) {
        toast({
            variant: "destructive",
            title: "خطأ في إنهاء الوردية",
            description: error.message,
        });
    } finally {
        setIsLoading(false);
    }
  };

  const difference = closingBalance - stats.cashInDrawer;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right">
            <LogOut className="h-5 w-5 text-primary" />
            استلام وإنهاء الوردية
          </DialogTitle>
          <DialogDescription className="text-right">
            {canSeeDetails ? 'راجع ملخص الحركات النقدية الفعلي المسجل في النظام لهذه الوردية.' : 'الرجاء إدخال إجمالي المبلغ النقدي (الكاش) الموجود بالدرج حالياً لإنهاء الوردية.'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {canSeeDetails ? (
            <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
                <div className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground"><Wallet className="h-4 w-4"/> رصيد الافتتاح (البداية)</span>
                    <span className="font-mono font-bold text-blue-600">{formatCurrency(shift.openingBalance || 0)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground"><ArrowUpCircle className="h-4 w-4 text-green-500"/> مقبوضات نقدية (كاش)</span>
                    <span className="font-mono font-bold text-green-600">+{formatCurrency(stats.receivedCash)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground"><ArrowDownCircle className="h-4 w-4 text-destructive"/> مصروفات ومرتجعات</span>
                    <span className="font-mono font-bold text-destructive">-{formatCurrency(stats.expenseTotal + stats.saleReturnsTotal)}</span>
                </div>
                
                <Separator className="my-2" />
                
                <div className="flex justify-between items-center">
                    <span className="font-bold text-base flex items-center gap-2">
                        <Calculator className="h-5 w-5 text-primary" />
                        النقدية المتوقعة بالدرج
                    </span>
                    <span className="font-mono font-black text-xl text-primary">{formatCurrency(stats.cashInDrawer)}</span>
                </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 flex items-center gap-3">
                <Lock className="h-10 w-10 text-primary opacity-40" />
                <div className="space-y-1">
                    <p className="font-bold text-sm">وضع الإغلاق العمامي نشط</p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                        سيقوم النظام بحساب العجز والزيادة تلقائياً وحفظها للمدير. 
                        أدخل فقط ما قمت بعدّه يدوياً في الدرج.
                    </p>
                </div>
            </div>
          )}

          <div className="space-y-2 mt-2">
            <Label htmlFor="closingBalance" className="font-bold text-base">المبلغ الفعلي الموجود بالدرج الآن:</Label>
            <div className="relative">
                <Input
                    id="closingBalance"
                    type="number"
                    value={closingBalance || ''}
                    onChange={(e) => setClosingBalance(parseFloat(e.target.value) || 0)}
                    className="h-14 text-2xl font-mono font-bold text-center"
                    placeholder="0.00"
                    autoFocus
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">ج.م</span>
            </div>
          </div>

          {canSeeDetails && closingBalance > 0 && (
            <div className={cn(
              "p-4 rounded-md text-center font-bold animate-in fade-in zoom-in-95",
              difference !== 0 ? (difference < 0 ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-600') : 'bg-muted text-muted-foreground'
            )}>
              {difference > 0 && `يوجد زيادة في العهدة: ${formatCurrency(difference)}`}
              {difference < 0 && `يوجد عجز في العهدة: ${formatCurrency(Math.abs(difference))}`}
              {difference === 0 && `المبلغ مطابق تماماً للنظام`}
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto" disabled={isLoading}>إلغاء</Button>
          <Button type="button" onClick={handleEndShift} className="w-full sm:w-auto gap-2" disabled={isLoading}>
            {isLoading ? 'جاري الحفظ...' : 'تأكيد الإغلاق والاستلام'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
