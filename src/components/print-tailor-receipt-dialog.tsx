
"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import type { Order, OrderItem } from '@/lib/definitions';
import { useSettings } from '@/hooks/use-settings';
import { cn } from '@/lib/utils';
import { Printer, Scissors, AlertTriangle, CheckCircle2, ListChecks } from 'lucide-react';

const DottedSeparator = () => (
    <div style={{
        borderBottom: '1.5px dashed #000',
        margin: '10px 0',
        transform: 'scaleY(0.5)',
    }}></div>
);

/**
 * مكون الوصل الفردي لصنف واحد
 */
const SingleItemTailorReceipt = ({ order, item, settings }: { order: Order, item: OrderItem, settings: any }) => {
    return (
        <div className="tailor-receipt-page" style={{ 
            width: '72mm', 
            margin: '0 auto', 
            backgroundColor: 'white', 
            color: 'black', 
            padding: '3mm',
            boxSizing: 'border-box',
            pageBreakAfter: 'always'
        }}>
            <div className="text-center mb-2">
                {settings.tailor_showShopName && <h2 className="text-xl font-bold font-headline -mt-2">{settings.tailor_shopName}</h2>}
                {settings.tailor_showContact && <p className="text-sm mt-1">{settings.tailor_contactInfo}</p>}
                <p className="text-[10px] font-bold mt-1 border border-black p-1 rounded-sm">وصل تجهيز صنف</p>
            </div>

            <DottedSeparator />

            <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between"><span>رقم الطلب:</span> <span className="font-bold">{order.orderCode}</span></div>
                <div className="flex justify-between"><span>التاريخ:</span> <span>{new Date(order.orderDate).toLocaleDateString('ar-EG')}</span></div>
                <div className="flex justify-between"><span>العميل:</span> <span className="font-bold">{order.customerName}</span></div>
                {order.deliveryDate && <div className="flex justify-between"><span>موعد التسليم:</span> <span className="font-bold">{new Date(order.deliveryDate).toLocaleDateString('ar-EG')}</span></div>}
            </div>
            
            <DottedSeparator />

            <div className="mb-4">
                <h3 className="font-bold text-base mb-2 underline">بيانات الصنف والتعديلات:</h3>
                <div className="bg-gray-50 p-2 border border-black mb-2">
                    <p className="font-bold text-sm">{item.productName}</p>
                    <p className="text-[10px] font-mono text-gray-600">كود: {item.productCode}</p>
                </div>

                {item.measurements && (
                    <div className="mb-2">
                        <p className="text-[10px] font-bold">القياسات:</p>
                        <p className="text-sm p-1 border border-dashed border-gray-400">{item.measurements}</p>
                    </div>
                )}

                {item.tailorNotes && (
                    <div>
                        <p className="text-[10px] font-bold">التعديلات المطلوبة:</p>
                        <div className="border border-black p-2 text-base font-medium leading-relaxed whitespace-pre-wrap mt-1">
                           {item.tailorNotes}
                        </div>
                    </div>
                )}
            </div>
            
            <DottedSeparator />
            <p className="text-center whitespace-pre-wrap text-[9px] font-medium leading-tight">{settings.tailor_disclaimer}</p>

            <div style={{ borderTop: '1px solid #000', marginTop: '10px', paddingTop: '5px', textAlign: 'center', fontSize: '9px' }}>
                www.codlink.online
            </div>
        </div>
    );
};

type PrintTailorReceiptDialogProps = {
    order: Order;
    trigger: React.ReactNode;
}

export function PrintTailorReceiptDialog({ order, trigger }: PrintTailorReceiptDialogProps) {
    const [open, setOpen] = useState(false);
    const { settings, isLoading: isLoadingSettings } = useSettings();
    const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
    const printContainerRef = useRef<HTMLDivElement>(null);

    // تصفية الأصناف التي لها ملاحظات أو قياسات فقط
    const eligibleItems = useMemo(() => {
        return order.items
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => item.tailorNotes || item.measurements);
    }, [order.items]);

    // تحديد الكل تلقائياً عند الفتح
    useEffect(() => {
        if (open) {
            setSelectedIndices(eligibleItems.map(ei => ei.index));
        }
    }, [open, eligibleItems]);

    const toggleItem = (index: number) => {
        setSelectedIndices(prev => 
            prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
        );
    };

    const toggleAll = () => {
        if (selectedIndices.length === eligibleItems.length) {
            setSelectedIndices([]);
        } else {
            setSelectedIndices(eligibleItems.map(ei => ei.index));
        }
    };

    const handlePrint = () => {
        const content = printContainerRef.current?.innerHTML;
        if (!content || selectedIndices.length === 0) return;

        const printWindow = window.open('', '', 'height=800,width=400');
        if (printWindow) {
            printWindow.document.write('<html><head><title>Print Tailor Receipts</title>');
            printWindow.document.write('<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet" />');
            printWindow.document.write(`
                <style>
                    @page { size: 72mm auto; margin: 0; }
                    body { 
                        font-family: "Tajawal", sans-serif; 
                        direction: rtl;
                        margin: 0;
                        padding: 0;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    * { box-sizing: border-box; }
                    .tailor-receipt-page {
                        page-break-after: always;
                    }
                    .tailor-receipt-page:last-child {
                        page-break-after: auto;
                    }
                    h2, h3, p, span, div { margin: 0; padding: 0; }
                    .font-bold { font-weight: 700; }
                    .text-center { text-align: center; }
                    .text-right { text-align: right; }
                    .flex { display: flex; }
                    .justify-between { justify-content: space-between; }
                    .border { border: 1px solid #000; }
                    .whitespace-pre-wrap { white-space: pre-wrap; }
                </style>
            `);
            printWindow.document.write('</head><body>');
            printWindow.document.write(content);
            printWindow.document.write('</body></html>');
            printWindow.document.close();
            printWindow.focus();
            
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 250);
        }
    };

    if (isLoadingSettings) return <>{trigger}</>;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger}
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg text-right" dir="rtl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-right">
                        <Scissors className="h-5 w-5 text-primary" />
                        طباعة أوصال الخياط
                    </DialogTitle>
                    <DialogDescription className="text-right">
                        حدد الأصناف التي ترغب في طباعة وصل تعديلات منفصل لها. سيتم إنشاء وصل مستقل لكل قطعة مختارة.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    {eligibleItems.length > 0 ? (
                        <>
                            <div className="flex items-center justify-between px-2 mb-2">
                                <Label className="text-xs font-bold text-muted-foreground">قائمة الأصناف (التي لها تعديلات أو قياسات):</Label>
                                <Button variant="ghost" size="sm" onClick={toggleAll} className="h-7 text-[10px] gap-1">
                                    <ListChecks className="h-3 w-3" />
                                    {selectedIndices.length === eligibleItems.length ? "إلغاء تحديد الكل" : "تحديد الكل"}
                                </Button>
                            </div>
                            <div className="grid gap-2 max-h-[40vh] overflow-y-auto pr-1">
                                {eligibleItems.map(({ item, index }) => (
                                    <div 
                                        key={index} 
                                        className={cn(
                                            "flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50",
                                            selectedIndices.includes(index) ? "border-primary bg-primary/5" : "bg-card"
                                        )}
                                        onClick={() => toggleItem(index)}
                                    >
                                        <Checkbox 
                                            id={`item-${index}`} 
                                            checked={selectedIndices.includes(index)} 
                                            onCheckedChange={() => toggleItem(index)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <div className="flex-grow space-y-1">
                                            <div className="flex justify-between items-center">
                                                <Label htmlFor={`item-${index}`} className="font-bold cursor-pointer text-sm">{item.productName}</Label>
                                                <Badge variant="outline" className="font-mono text-[10px]">{item.productCode}</Badge>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground line-clamp-1">
                                                {item.tailorNotes || "قياسات فقط"}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="p-8 text-center text-muted-foreground border-2 border-dashed rounded-xl flex flex-col items-center gap-3">
                            <AlertTriangle className="h-10 w-10 opacity-20" />
                            <p>لا توجد أصناف في هذه الفاتورة تحتوي على ملاحظات خياط أو قياسات.</p>
                        </div>
                    )}
                </div>

                {/* حاوية مخفية للطباعة */}
                <div className="hidden">
                    <div ref={printContainerRef}>
                        {eligibleItems
                            .filter(ei => selectedIndices.includes(ei.index))
                            .map(({ item }, i) => (
                                <SingleItemTailorReceipt key={i} order={order} item={item} settings={settings} />
                            ))
                        }
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">إلغاء</Button>
                    <Button 
                        onClick={handlePrint} 
                        disabled={selectedIndices.length === 0} 
                        className="flex-1 gap-2 bg-primary text-primary-foreground h-11 font-bold"
                    >
                        <Printer className="h-5 w-5" />
                        طباعة ({selectedIndices.length}) وصل
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
