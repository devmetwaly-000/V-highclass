import type { Order, Shift, Expense } from '@/lib/definitions';

export type BreakdownItem = {
    id: string;
    label: string;
    amount: number;
    subLabel?: string;
    date?: string;
    method?: string;
};

/**
 * دالة الحساب الموحدة لكافة شاشات النظام
 */
export function calculateShiftStats(shift: Shift, allOrders: Order[], allExpenses: Expense[]) {
    let salesGross = 0;
    let rentalsGross = 0;
    let receivedCash = 0;
    let receivedVodafone = 0;
    let receivedInstaPay = 0;
    let receivedVisa = 0;
    let discounts = 0;
    let expenseTotal = 0;
    let saleReturnsTotal = 0;
    let txCount = 0;

    const salesList: BreakdownItem[] = [];
    const rentalsList: BreakdownItem[] = [];
    const paymentsList: BreakdownItem[] = [];
    const discountsList: BreakdownItem[] = [];
    const expensesList: BreakdownItem[] = [];
    const returnsList: BreakdownItem[] = [];

    const shiftStartTime = new Date(shift.startTime);
    const shiftEndTime = shift.endTime ? new Date(shift.endTime) : new Date(8640000000000000);

    allOrders.forEach(order => {
        if (order.status === 'Cancelled') return;
        
        const orderIsLinked = order.shiftId === shift.id;
        const creationDate = new Date(order.createdAt || order.orderDate);
        const isLegacyMatch = !order.shiftId && 
                             order.processedByUserId === shift.cashier.id && 
                             creationDate >= shiftStartTime && 
                             creationDate <= shiftEndTime;

        if (orderIsLinked || isLegacyMatch) {
            txCount++;
            const netTotal = Number(order.total) || 0;
            const discount = Number(order.discountAmount) || 0;
            const gross = netTotal + discount;
            const items = Array.isArray(order.items) ? order.items : [];
            const itemsSummary = items.map(i => i.productName).join(' + ');

            const breakdownItem = {
                id: `${order.id}-gross`,
                label: `فاتورة ${order.orderCode} - ${order.customerName}`,
                amount: gross,
                subLabel: itemsSummary || 'بدون أصناف',
                date: order.orderDate
            };

            if (order.transactionType === 'Sale') {
                salesGross += gross;
                salesList.push(breakdownItem);
            } else {
                rentalsGross += gross;
                rentalsList.push(breakdownItem);
            }

            if (discount > 0) {
                discounts += discount;
                discountsList.push({
                    id: `d-${order.id}`,
                    label: `خصم فاتورة ${order.orderCode}`,
                    amount: discount,
                    subLabel: order.customerName,
                    date: order.discountAppliedDate || order.orderDate
                });
            }
        }

        if (order.payments) {
            Object.values(order.payments).forEach((p: any) => {
                if (!p) return;
                const pDate = new Date(p.date);
                const paymentIsLinked = p.shiftId === shift.id;
                const isLegacyPMatch = !p.shiftId && 
                                     p.userId === shift.cashier.id && 
                                     pDate >= shiftStartTime && 
                                     pDate <= shiftEndTime;

                if (paymentIsLinked || isLegacyPMatch) {
                    txCount++;
                    const amt = Number(p.amount) || 0;
                    if (p.method === 'Vodafone Cash') receivedVodafone += amt;
                    else if (p.method === 'InstaPay') receivedInstaPay += amt;
                    else if (p.method === 'Visa') receivedVisa += amt;
                    else receivedCash += amt;

                    paymentsList.push({
                        id: `${order.id}-${p.id}-pay`,
                        label: `تحصيل فاتورة ${order.orderCode}`,
                        amount: amt,
                        method: p.method,
                        subLabel: order.customerName,
                        date: p.date
                    });
                }
            });
        } else if (order.paid > 0 && (orderIsLinked || isLegacyMatch)) {
            const amt = Number(order.paid);
            receivedCash += amt;
            paymentsList.push({
                id: `${order.id}-initial-pay`,
                label: `تحصيل فاتورة ${order.orderCode}`,
                amount: amt,
                method: 'Cash',
                subLabel: order.customerName,
                date: (order.createdAt || order.orderDate) as string
            });
        }
    });

    allExpenses.forEach(e => {
        // إذا كان المصروف مسدداً من خزينة رئيسية فلا يخصم من نقدية درج الوردية
        if (e.treasuryId) return;

        const eDate = new Date(e.date);
        const expenseIsLinked = e.shiftId === shift.id;
        const isLegacyEMatch = !e.shiftId && 
                              e.userId === shift.cashier.id && 
                              eDate >= shiftStartTime && 
                              eDate <= shiftEndTime;

        if (expenseIsLinked || isLegacyEMatch) {
            txCount++;
            const amt = Number(e.amount);
            const breakdownItem = {
                id: `exp-${e.id}`,
                label: e.description,
                amount: amt,
                subLabel: e.category,
                date: e.date
            };

            if (e.category === 'مرتجعات بيع' || e.category === 'مرتجع بيع' || e.category === 'إلغاء طلبات') {
                saleReturnsTotal += amt;
                returnsList.push(breakdownItem);
            } else {
                expenseTotal += amt;
                expensesList.push(breakdownItem);
            }
        }
    });

    const totalReceived = receivedCash + receivedVodafone + receivedInstaPay + receivedVisa;

    return { 
        salesGross, rentalsGross, receivedCash, receivedVodafone,
        receivedInstaPay, receivedVisa, totalReceived, discounts, 
        expenseTotal, saleReturnsTotal, txCount,
        totalRevenue: salesGross + rentalsGross - discounts,
        cashInDrawer: (Number(shift.openingBalance) || 0) + receivedCash - (expenseTotal + saleReturnsTotal),
        salesList, rentalsList, paymentsList, discountsList, expensesList, returnsList
    };
}
