import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { OrderRecord, QuoteRecord, CADFileRecord } from '../db/db';

interface SendOrderEmailResult {
  success: boolean;
  messageId: string;
  previewUrl?: string;
  emailHtml: string;
  recipient: string;
  attachmentName?: string;
}

let etherealTransporter: any = null;

async function getTransporter(): Promise<{ transporter: any; isEthereal: boolean }> {
  // If user configured real SMTP in .env
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT || 587,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
    return { transporter, isEthereal: false };
  }

  // Otherwise, use / create Ethereal test inbox
  if (!etherealTransporter) {
    const testAccount = await nodemailer.createTestAccount();
    console.log('\n[ProtoNex Mailer] Created Ethereal Test Account:');
    console.log(`  User: ${testAccount.user}`);
    console.log(`  Pass: ${testAccount.pass}`);

    etherealTransporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  return { transporter: etherealTransporter, isEthereal: true };
}

export function generateOrderEmailHtml(order: OrderRecord, quote?: QuoteRecord, cadFile?: CADFileRecord): string {
  const g = cadFile?.geometryAnalysis;
  const dims = g?.bboxMm ? `${g.bboxMm[0]} × ${g.bboxMm[1]} × ${g.bboxMm[2]} mm` : '—';
  const volume = g?.volumeCm3 ? `${g.volumeCm3} cm³` : '—';
  const surfaceArea = g?.surfaceAreaCm2 ? `${g.surfaceAreaCm2} cm²` : '—';
  const b = quote?.breakdown;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  body { margin:0; padding:0; background:#0b0d10; color:#f4f1eb; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  .email-wrapper { max-width:620px; margin:20px auto; background:#14181e; border:1px solid #272d35; border-radius:18px; overflow:hidden; }
  .email-header { background:linear-gradient(135deg, #1b2028, #101317); padding:32px 36px; border-bottom:1px solid #272d35; }
  .wordmark { font-size:22px; font-weight:800; letter-spacing:2px; color:#ffffff; }
  .wordmark span { color:#ff6338; }
  .badge { display:inline-block; margin-top:14px; background:rgba(73,215,194,0.15); color:#49d7c2; border:1px solid #49d7c2; padding:4px 12px; border-radius:99px; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px; }
  .email-body { padding:36px; }
  h1 { margin:0 0 10px; font-size:24px; font-weight:700; color:#ffffff; }
  p { margin:0 0 20px; color:#9da5af; font-size:15px; line-height:1.6; }
  .card { background:#0f1216; border:1px solid #272d35; border-radius:14px; padding:20px; margin-bottom:24px; }
  .card-title { font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:#ff6338; font-weight:700; margin-bottom:12px; }
  .grid-2 { display:table; width:100%; }
  .grid-row { display:table-row; }
  .grid-cell { display:table-cell; padding:7px 0; font-size:14px; }
  .grid-cell.label { color:#9da5af; width:45%; }
  .grid-cell.val { color:#ffffff; font-weight:600; text-align:right; }
  .attachment-pill { display:flex; align-items:center; background:#1b2028; border:1px dashed #ff6338; border-radius:10px; padding:12px 16px; margin:18px 0; color:#f4f1eb; font-size:13px; }
  .price-highlight { font-size:28px; font-weight:800; color:#49d7c2; margin:10px 0 4px; text-align:right; }
  .footer { background:#0b0d10; padding:24px 36px; text-align:center; font-size:12px; color:#687381; border-top:1px solid #272d35; }
</style>
</head>
<body>
<div class="email-wrapper">
  <div class="email-header">
    <div class="wordmark">PROTO<span>NEX</span></div>
    <div class="badge">Order Confirmed &bull; ${order.orderNumber}</div>
  </div>

  <div class="email-body">
    <h1>Hello, ${order.customerName}!</h1>
    <p>Thank you for choosing ProtoNex for your fabrication prototype. We have successfully received your order and CAD file. Our digital fabrication engineers are reviewing the tooling requirements.</p>

    <div class="card">
      <div class="card-title">Attached CAD Design File</div>
      <div class="attachment-pill">
        &bull; <strong>${cadFile?.originalName || 'CAD Model'}</strong> &nbsp;(${cadFile?.fileSize ? (cadFile.fileSize / 1024).toFixed(1) + ' KB' : 'Standard Attachment'})
      </div>
      <div class="grid-2">
        <div class="grid-row"><div class="grid-cell label">Bounding Envelope</div><div class="grid-cell val">${dims}</div></div>
        <div class="grid-row"><div class="grid-cell label">Calculated Volume</div><div class="grid-cell val">${volume}</div></div>
        <div class="grid-row"><div class="grid-cell label">Surface Area</div><div class="grid-cell val">${surfaceArea}</div></div>
        <div class="grid-row"><div class="grid-cell label">Mesh Faces / Facets</div><div class="grid-cell val">${g?.faces ? g.faces.toLocaleString() : 'Analyzed'}</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Manufacturing Specifications</div>
      <div class="grid-2">
        <div class="grid-row"><div class="grid-cell label">Process</div><div class="grid-cell val">${quote?.process || 'Custom Fabrication'}</div></div>
        <div class="grid-row"><div class="grid-cell label">Material</div><div class="grid-cell val">${quote?.material || 'Standard Material'}</div></div>
        <div class="grid-row"><div class="grid-cell label">Surface Finish</div><div class="grid-cell val">${quote?.finish || 'As Manufactured'}</div></div>
        <div class="grid-row"><div class="grid-cell label">Ordered Quantity</div><div class="grid-cell val">${quote?.quantity || 1} unit(s)</div></div>
        <div class="grid-row"><div class="grid-cell label">Turnaround Speed</div><div class="grid-cell val">${quote?.deliverySpeed || 'STANDARD'} (${b?.leadTimeDays || 4} business days)</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Commercial Quote Breakdown</div>
      <div class="grid-2">
        <div class="grid-row"><div class="grid-cell label">Raw Material Cost</div><div class="grid-cell val">&#8377;${b?.materialCost?.toFixed(2) || '0.00'}</div></div>
        <div class="grid-row"><div class="grid-cell label">Machine Runtime & Tooling</div><div class="grid-cell val">&#8377;${b?.machineCost?.toFixed(2) || '0.00'}</div></div>
        <div class="grid-row"><div class="grid-cell label">Batch Setup & Calibration</div><div class="grid-cell val">&#8377;${b?.setupCost?.toFixed(2) || '0.00'}</div></div>
        <div class="grid-row"><div class="grid-cell label">Post-Process Finishing</div><div class="grid-cell val">&#8377;${b?.finishingCost?.toFixed(2) || '0.00'}</div></div>
        ${b?.discount ? `<div class="grid-row"><div class="grid-cell label">Volume Bulk Discount</div><div class="grid-cell val" style="color:#ff6338">-&#8377;${b.discount.toFixed(2)}</div></div>` : ''}
        ${b?.rushCost ? `<div class="grid-row"><div class="grid-cell label">Expedited Rush Fee</div><div class="grid-cell val">&#8377;${b.rushCost.toFixed(2)}</div></div>` : ''}
        <div class="grid-row"><div class="grid-cell label">GST / Taxes (18%)</div><div class="grid-cell val">&#8377;${b?.tax?.toFixed(2) || '0.00'}</div></div>
      </div>
      <div style="border-top:1px solid #272d35; margin-top:14px; padding-top:14px; text-align:right;">
        <span style="font-size:13px; color:#9da5af;">Total Invoice Quote</span>
        <div class="price-highlight">&#8377;${order.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Delivery & Customer Info</div>
      <div class="grid-2">
        <div class="grid-row"><div class="grid-cell label">Customer Name</div><div class="grid-cell val">${order.customerName}</div></div>
        <div class="grid-row"><div class="grid-cell label">Contact Email</div><div class="grid-cell val">${order.customerEmail}</div></div>
        ${order.customerPhone ? `<div class="grid-row"><div class="grid-cell label">Phone</div><div class="grid-cell val">${order.customerPhone}</div></div>` : ''}
        ${order.customerNotes ? `<div class="grid-row"><div class="grid-cell label">Special Instructions</div><div class="grid-cell val">${order.customerNotes}</div></div>` : ''}
      </div>
    </div>

    <p style="font-size:13px; color:#687381; text-align:center;">
      Note: The CAD file <strong>${cadFile?.originalName || 'file'}</strong> is attached to this email for your archives and fabrication queue.
    </p>
  </div>

  <div class="footer">
    &copy; ${new Date().getFullYear()} ProtoNex Digital Fabrication Lab &bull; Engineering Prototypes Made Easy
  </div>
</div>
</body>
</html>
  `;
}

export async function sendOrderConfirmationEmail(
  order: OrderRecord,
  quote?: QuoteRecord,
  cadFile?: CADFileRecord
): Promise<SendOrderEmailResult> {
  const { transporter, isEthereal } = await getTransporter();
  const html = generateOrderEmailHtml(order, quote, cadFile);

  const attachments: Array<{ filename: string; path: string }> = [];

  // Attach CAD file if it exists on disk
  if (cadFile && cadFile.filePath && fs.existsSync(cadFile.filePath)) {
    attachments.push({
      filename: cadFile.originalName,
      path: cadFile.filePath,
    });
  }

  const mailOptions = {
    from: env.SMTP_FROM || '"ProtoNex Fabrication" <quotes@protonex.local>',
    to: order.customerEmail,
    subject: `Order Confirmed: ${order.orderNumber} — ProtoNex CAD Fabrication Quote`,
    html,
    attachments,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    const previewUrl = isEthereal ? nodemailer.getTestMessageUrl(info) || undefined : undefined;

    console.log(`\n========================================================`);
    console.log(`[ProtoNex Email Sent]`);
    console.log(`  To:           ${order.customerEmail}`);
    console.log(`  Subject:      ${mailOptions.subject}`);
    console.log(`  CAD Attached: ${attachments.length ? cadFile?.originalName : 'None'}`);
    if (previewUrl) {
      console.log(`  >>> Ethereal Web Preview URL: ${previewUrl}`);
    }
    console.log(`========================================================\n`);

    return {
      success: true,
      messageId: info.messageId,
      previewUrl,
      emailHtml: html,
      recipient: order.customerEmail,
      attachmentName: cadFile?.originalName,
    };
  } catch (err: any) {
    console.error('Failed to send order email:', err);
    return {
      success: false,
      messageId: '',
      emailHtml: html,
      recipient: order.customerEmail,
      attachmentName: cadFile?.originalName,
    };
  }
}
