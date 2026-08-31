"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileUp, Loader2, Download, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { useUser } from '@/firebase';
import type { Product } from '@/lib/definitions';
import { parseInventoryExcelRows, type InventoryImportError } from '@/lib/inventory-utils';
import { ScrollArea } from '@/components/ui/scroll-area';

type ImportInventoryDialogProps = {
  trigger: React.ReactNode;
  products: Product[];
  onImportValidated: (entries: { productId: string; quantity: number }[]) => void;
};

export function ImportInventoryDialog({ trigger, products, onImportValidated }: ImportInventoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationErrors, setValidationErrors] = useState<InventoryImportError[]>([]);
  const { toast } = useToast();
  const { appUser } = useUser();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setValidationErrors([]);
  };

  const handleDownloadTemplate = () => {
    const data = [
      ['Product Code', 'QTY'],
      ['90001001', 10],
      ['90001002', 5],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    XLSX.writeFile(wb, 'قالب_جرد_المخزون.xlsx');
  };

  const handleImport = async () => {
    if (!file || !appUser) {
      toast({
        variant: 'destructive',
        title: 'خطأ',
        description: 'الرجاء اختيار ملف وتأكد من تسجيل الدخول.',
      });
      return;
    }

    setIsProcessing(true);
    setValidationErrors([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

        if (rawRows.length === 0) {
          toast({
            variant: 'destructive',
            title: 'ملف فارغ',
            description: 'الملف لا يحتوي على بيانات.',
          });
          setIsProcessing(false);
          return;
        }

        const { validRows, errors } = parseInventoryExcelRows(rawRows);
        const codeToProduct = new Map<string, Product>();

        products.forEach((p) => {
          if (p.productCode) {
            codeToProduct.set(p.productCode.trim().toLowerCase(), p);
          }
        });

        const allErrors = [...errors];
        const entries: { productId: string; quantity: number }[] = [];
        const seenCodes = new Set<string>();

        validRows.forEach((row) => {
          const normalizedCode = row.productCode.toLowerCase();
          if (seenCodes.has(normalizedCode)) {
            allErrors.push({
              rowNumber: row.rowNumber,
              productCode: row.productCode,
              message: 'كود الصنف مكرر في الملف',
            });
            return;
          }
          seenCodes.add(normalizedCode);

          const product = codeToProduct.get(normalizedCode);
          if (!product) {
            allErrors.push({
              rowNumber: row.rowNumber,
              productCode: row.productCode,
              message: 'كود الصنف غير موجود في النظام',
            });
            return;
          }

          entries.push({ productId: product.id, quantity: row.quantity });
        });

        if (allErrors.length > 0) {
          setValidationErrors(allErrors);
          toast({
            variant: 'destructive',
            title: 'فشل التحقق',
            description: `تم العثور على ${allErrors.length} خطأ. راجع التفاصيل أدناه.`,
          });
          setIsProcessing(false);
          return;
        }

        if (entries.length === 0) {
          toast({
            variant: 'destructive',
            title: 'لا توجد بيانات',
            description: 'لم يتم العثور على صفوف صالحة للاستيراد.',
          });
          setIsProcessing(false);
          return;
        }

        onImportValidated(entries);
        toast({
          title: 'تم تحميل البيانات',
          description: `تم استيراد ${entries.length} صنف. راجع الكميات ثم اضغط "تنفيذ الجرد".`,
        });
        setFile(null);
        setOpen(false);
      } catch {
        toast({
          variant: 'destructive',
          title: 'خطأ في قراءة الملف',
          description: 'تأكد من أن الملف بصيغة Excel صحيحة.',
        });
      } finally {
        setIsProcessing(false);
      }
    };

    reader.onerror = () => {
      toast({
        variant: 'destructive',
        title: 'خطأ',
        description: 'فشل قراءة الملف.',
      });
      setIsProcessing(false);
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">استيراد جرد من Excel</DialogTitle>
          <DialogDescription className="text-right">
            ارفع ملف Excel بعمودين: <strong>Product Code</strong> و <strong>QTY</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2 w-full">
            <Download className="h-4 w-4" />
            تحميل قالب Excel
          </Button>

          <div className="space-y-2">
            <Label htmlFor="inventory-file">ملف Excel</Label>
            <Input
              id="inventory-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
            />
            {file && (
              <p className="text-sm text-muted-foreground">{file.name}</p>
            )}
          </div>

          {validationErrors.length > 0 && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
              <div className="flex items-center gap-2 text-destructive font-medium mb-2">
                <AlertTriangle className="h-4 w-4" />
                أخطاء التحقق ({validationErrors.length})
              </div>
              <ScrollArea className="h-32">
                <ul className="text-sm space-y-1">
                  {validationErrors.map((err, i) => (
                    <li key={i} className="text-destructive">
                      صف {err.rowNumber}
                      {err.productCode ? ` (${err.productCode})` : ''}: {err.message}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-start gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">
            إلغاء
          </Button>
          <Button
            onClick={handleImport}
            disabled={!file || isProcessing}
            className="w-full sm:w-auto gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري التحقق...
              </>
            ) : (
              <>
                <FileUp className="h-4 w-4" />
                استيراد وتحميل
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
