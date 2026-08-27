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
import { FileUp, Loader2, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { useDatabase, useUser } from '@/firebase';
import { ref, push, set, update } from 'firebase/database';
import type { Customer, Region } from '@/lib/definitions';
import { useRtdbList } from '@/hooks/use-rtdb';

const NAME_KEYS = ['الاسم', 'اسم العميل', 'name', 'Name'];
const PRIMARY_PHONE_KEYS = ['الهاتف الأساسي', 'الهاتف', 'رقم الهاتف', 'primaryPhone', 'phone'];
const SECONDARY_PHONE_KEYS = ['الهاتف الثانوي', 'هاتف آخر', 'secondaryPhone'];
const REGION_KEYS = ['المنطقة', 'region', 'Region'];

function cellValue(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const val = row[key];
    if (val === undefined || val === null || val === '') continue;
    if (typeof val === 'number' && Number.isFinite(val)) {
      return Math.trunc(val).toString();
    }
    const asString = String(val).trim();
    if (!asString) continue;
    if (/e/i.test(asString) && Number.isFinite(Number(asString))) {
      return Math.trunc(Number(asString)).toString();
    }
    return asString;
  }
  return '';
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-().]/g, '');
}

export function ImportCustomersDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const { toast } = useToast();
  const db = useDatabase();
  const { appUser } = useUser();
  const { data: existingCustomers, isLoading: customersLoading } = useRtdbList<Customer>('customers');
  const { data: existingRegions, isLoading: regionsLoading } = useRtdbList<Region>('regions');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFile(event.target.files[0]);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setFile(null);
      setIsImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = ['الاسم', 'الهاتف الأساسي', 'الهاتف الثانوي', 'المنطقة'];
    const data = [
      headers,
      ['أحمد محمد', '01012345678', '01112345678', 'المعادي'],
      ['سارة علي', '01234567890', '', 'المهندسين'],
      ['محمود حسن', '01555555555', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);

    const range = XLSX.utils.decode_range(ws['!ref']!);
    for (let R = 1; R <= range.e.r; ++R) {
      for (const C of [1, 2]) {
        const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
        if (ws[cellAddr]) {
          ws[cellAddr].t = 's';
          ws[cellAddr].z = '@';
          ws[cellAddr].v = String(ws[cellAddr].v);
        }
      }
    }

    ws['!cols'] = [
      { wch: 22 },
      { wch: 18 },
      { wch: 18 },
      { wch: 16 },
    ];

    const instructions = [
      ['العمود', 'مطلوب؟', 'الوصف'],
      ['الاسم', 'نعم', 'اسم العميل كما سيظهر في النظام'],
      ['الهاتف الأساسي', 'نعم', 'رقم الهاتف الأساسي. اكتبه كنص حتى لا يحذف Excel الصفر في البداية'],
      ['الهاتف الثانوي', 'لا', 'رقم هاتف إضافي إن وجد'],
      ['المنطقة', 'لا', 'اسم المنطقة. إذا لم تكن موجودة سيتم إنشاؤها تلقائياً'],
    ];
    const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions);
    instructionsSheet['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 70 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'العملاء');
    XLSX.utils.book_append_sheet(wb, instructionsSheet, 'تعليمات');
    XLSX.writeFile(wb, 'قالب_استيراد_العملاء.xlsx');
  };

  const handleImport = async () => {
    if (!file || !db || !appUser) {
      toast({ variant: 'destructive', title: 'خطأ', description: 'الرجاء اختيار ملف وتأكد من تسجيل الدخول.' });
      return;
    }

    if (customersLoading || regionsLoading) {
      toast({ variant: 'destructive', title: 'البيانات لم تكتمل بعد', description: 'انتظر اكتمال تحميل العملاء والمناطق ثم أعد المحاولة.' });
      return;
    }

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames.includes('العملاء')
          ? 'العملاء'
          : workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, {
          defval: '',
          raw: false,
        });

        if (json.length === 0) {
          toast({ variant: 'destructive', title: 'ملف فارغ', description: 'الملف الذي اخترته لا يحتوي على بيانات.' });
          setIsImporting(false);
          return;
        }

        const regionByName = new Map<string, Region>();
        existingRegions.forEach((region) => {
          if (region.name) {
            regionByName.set(region.name.trim().toLowerCase(), region);
          }
        });

        const existingPhones = new Set(
          existingCustomers
            .map((c) => normalizePhone(c.primaryPhone || ''))
            .filter(Boolean)
        );

        const customerUpdates: Record<string, Customer> = {};
        let importedCount = 0;
        const importErrors: string[] = [];
        let rowIndex = 1;

        for (const row of json) {
          rowIndex++;
          const currentRowErrors: string[] = [];

          const name = cellValue(row, NAME_KEYS);
          const primaryPhone = normalizePhone(cellValue(row, PRIMARY_PHONE_KEYS));
          const secondaryPhone = normalizePhone(cellValue(row, SECONDARY_PHONE_KEYS));
          const regionName = cellValue(row, REGION_KEYS);

          if (!name && !primaryPhone && !secondaryPhone && !regionName) {
            continue;
          }

          if (!name) currentRowErrors.push('الاسم مفقود');
          if (!primaryPhone) currentRowErrors.push('الهاتف الأساسي مفقود');

          if (primaryPhone && existingPhones.has(primaryPhone)) {
            currentRowErrors.push(`رقم الهاتف "${primaryPhone}" موجود مسبقاً`);
          }

          if (currentRowErrors.length > 0) {
            importErrors.push(`- الصف ${rowIndex}: ${currentRowErrors.join('، ')}`);
            continue;
          }

          let regionId: string | undefined;
          let resolvedRegionName: string | undefined;

          if (regionName) {
            const cached = regionByName.get(regionName.toLowerCase());
            if (cached) {
              regionId = cached.id;
              resolvedRegionName = cached.name;
            } else {
              const newRegionRef = push(ref(db, 'regions'));
              const newRegionId = newRegionRef.key!;
              const newRegion: Region = {
                id: newRegionId,
                name: regionName,
                createdAt: new Date().toISOString(),
              };
              await set(newRegionRef, newRegion);
              regionByName.set(regionName.toLowerCase(), newRegion);
              regionId = newRegionId;
              resolvedRegionName = regionName;
            }
          }

          const newCustomerRef = push(ref(db, 'customers'));
          const newCustomerId = newCustomerRef.key!;

          const customerData: Customer = {
            id: newCustomerId,
            name,
            primaryPhone,
            ...(secondaryPhone ? { secondaryPhone } : {}),
            ...(regionId ? { regionId } : {}),
            ...(resolvedRegionName ? { regionName: resolvedRegionName } : {}),
          };

          customerUpdates[`customers/${newCustomerId}`] = customerData;
          existingPhones.add(primaryPhone);
          importedCount++;
        }

        if (importedCount > 0) {
          await update(ref(db), customerUpdates);
        }

        const skippedRowCount = importErrors.length;
        if (skippedRowCount > 0) {
          toast({
            variant: importedCount > 0 ? 'default' : 'destructive',
            title: importedCount > 0
              ? `تم استيراد ${importedCount} عميل مع تخطي ${skippedRowCount} صف`
              : `فشل استيراد ${skippedRowCount} صف`,
            description: (
              <div className="text-right">
                <p className="mb-2">الرجاء مراجعة الأخطاء التالية في ملف Excel:</p>
                <ul className="list-disc pr-5 text-xs text-right max-h-40 overflow-y-auto">
                  {importErrors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            ),
            duration: 15000,
          });
          if (importedCount > 0) {
            setOpen(false);
          }
        } else if (importedCount > 0) {
          toast({
            title: 'اكتمل الاستيراد',
            description: `تم استيراد ${importedCount} عميل بنجاح.`,
          });
          setOpen(false);
        } else {
          toast({
            variant: 'destructive',
            title: 'لم يتم الاستيراد',
            description: 'لم يتم العثور على بيانات صالحة في الملف.',
          });
        }
      } catch (error: any) {
        console.error('Import error:', error);
        toast({ variant: 'destructive', title: 'فشل الاستيراد', description: error.message });
      } finally {
        setIsImporting(false);
        setFile(null);
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>استيراد العملاء من ملف Excel</DialogTitle>
          <DialogDescription>
            حمّل القالب أولاً ثم املأ بيانات العملاء. الاسم والهاتف الأساسي مطلوبان. المنطقة اختيارية وسيتم إنشاؤها تلقائياً إن لم تكن موجودة.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="customers-excel-file">ملف Excel</Label>
            <Input id="customers-excel-file" type="file" accept=".xlsx, .xls" onChange={handleFileChange} />
          </div>
          <Button
            variant="link"
            className="gap-1 text-xs justify-start p-0 h-auto"
            onClick={handleDownloadTemplate}
          >
            <Download className="h-3 w-3" />
            تحميل قالب Excel للعملاء
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={handleImport} disabled={!file || isImporting || customersLoading || regionsLoading}>
            {isImporting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <FileUp className="ml-2 h-4 w-4" />}
            {isImporting ? 'جاري الاستيراد...' : 'بدء الاستيراد'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
