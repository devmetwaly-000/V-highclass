import type { Order, OrderItem } from '@/lib/definitions';

export function printItemTailorSlip(
  order: Order,
  item: OrderItem,
  customNotes?: string,
  customMeasurements?: string,
  settings?: any
) {
  const printWindow = window.open('', '', 'height=800,width=420');
  if (!printWindow) return;

  const notes = customNotes !== undefined ? customNotes : (item.tailorNotes || '');
  const measurements = customMeasurements !== undefined ? customMeasurements : (item.measurements || '');
  const shopName = settings?.tailor_showShopName !== false ? (settings?.tailor_shopName || 'أتيليه High Class') : '';
  const contactInfo = settings?.tailor_showContact !== false ? (settings?.tailor_contactInfo || '') : '';
  const disclaimer = settings?.tailor_disclaimer || 'تنبيه: نرجو من العميل تجربة الفستان واستلامه بعد التعديل في الموعد المحدد.';

  const orderDateStr = order.orderDate ? new Date(order.orderDate).toLocaleDateString('ar-EG') : '-';
  const deliveryDateStr = order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('ar-EG') : '-';

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>وصل تجهيز خياط - ${order.orderCode} - ${item.productName}</title>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet" />
      <style>
        @page { size: 72mm auto; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
          font-family: "Tajawal", 'Cairo', sans-serif; 
          direction: rtl; 
          background: #ffffff; 
          color: #000000; 
          width: 72mm; 
          margin: 0 auto; 
          padding: 4mm 3mm; 
          -webkit-print-color-adjust: exact; 
          print-color-adjust: exact;
        }
        .header { text-align: center; margin-bottom: 6px; }
        .shop-name { font-size: 16px; font-weight: 800; }
        .contact { font-size: 10px; margin-top: 2px; }
        .slip-title { 
          display: inline-block; 
          font-size: 11px; 
          font-weight: 700; 
          border: 1px solid #000; 
          padding: 2px 8px; 
          border-radius: 2px; 
          margin-top: 4px; 
        }
        .divider { border-bottom: 1.5px dashed #000; margin: 6px 0; }
        .info-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; }
        .info-label { color: #333; }
        .info-val { font-weight: 700; }
        .item-box { background: #f9f9f9; border: 1px solid #000; padding: 6px; margin-bottom: 6px; }
        .item-name { font-weight: 700; font-size: 13px; }
        .item-code { font-family: monospace; font-size: 10px; color: #444; }
        .notes-box { border: 1px solid #000; padding: 6px; font-size: 12px; font-weight: 600; line-height: 1.5; white-space: pre-wrap; background: #fff; min-height: 40px; }
        .measure-box { border: 1px dashed #555; padding: 4px 6px; font-size: 11.5px; margin-top: 2px; background: #fff; }
        .disclaimer { text-align: center; font-size: 9px; line-height: 1.3; margin-top: 6px; }
        .footer-link { border-top: 1px solid #000; margin-top: 6px; padding-top: 3px; text-align: center; font-size: 8.5px; font-family: monospace; }
      </style>
    </head>
    <body>
      <div class="header">
        ${shopName ? `<div class="shop-name">${shopName}</div>` : ''}
        ${contactInfo ? `<div class="contact">${contactInfo}</div>` : ''}
        <div class="slip-title">وصل تجهيز وتعديل صنف (الخياط)</div>
      </div>

      <div class="divider"></div>

      <div class="info-row"><span class="info-label">رقم الطلب:</span> <span class="info-val">#${order.orderCode}</span></div>
      <div class="info-row"><span class="info-label">تاريخ الطلب:</span> <span>${orderDateStr}</span></div>
      <div class="info-row"><span class="info-label">العميل:</span> <span class="info-val">${order.customerName}</span></div>
      ${order.customerPhone ? `<div class="info-row"><span class="info-label">الهاتف:</span> <span dir="ltr" class="info-val">${order.customerPhone}</span></div>` : ''}
      ${order.deliveryDate ? `<div class="info-row"><span class="info-label">موعد التسليم:</span> <span class="info-val" style="font-size: 12px; text-decoration: underline;">${deliveryDateStr}</span></div>` : ''}

      <div class="divider"></div>

      <div class="item-box">
        <div class="item-name">${item.productName}</div>
        ${item.productCode ? `<div class="item-code">كود: ${item.productCode}</div>` : ''}
      </div>

      ${measurements ? `
        <div style="margin-bottom: 6px;">
          <div style="font-size: 10px; font-weight: 700; margin-bottom: 2px;">القياسات:</div>
          <div class="measure-box">${measurements}</div>
        </div>
      ` : ''}

      <div style="margin-bottom: 6px;">
        <div style="font-size: 10px; font-weight: 700; margin-bottom: 2px;">التعديلات المطلوبة للخياط:</div>
        <div class="notes-box">${notes || 'لا توجد ملاحظات خاصة'}</div>
      </div>

      <div class="divider"></div>

      ${disclaimer ? `<div class="disclaimer">${disclaimer}</div>` : ''}
      <div class="footer-link">www.codlink.online</div>
    </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 300);
}
