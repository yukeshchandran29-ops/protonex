import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { prisma } from '../db/prisma';
import { env } from '../config/env';
import { storageService } from './storageService';
import { ApiError } from '../utils/apiError';

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
});

/**
 * Renders a branded PDF quotation and stores it privately in object storage.
 * Only customer-facing fields are included — internalNotes are never rendered here.
 */
export async function generateQuotePdf(quoteId: string): Promise<string> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      customer: true,
      project: { include: { company: true } },
      items: { include: { cadFile: true } },
    },
  });
  if (!quote) throw ApiError.notFound('Quote not found');

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  const stream = new PassThrough();
  doc.pipe(stream);
  stream.on('data', (c) => chunks.push(c));

  doc
    .fontSize(20)
    .fillColor('#ff7a1a')
    .text('PROTO NEX', { continued: false })
    .fontSize(9)
    .fillColor('#666')
    .text('Where Ideas Become Prototypes.')
    .moveDown(1.5);

  doc.fillColor('#111').fontSize(14).text(`Quotation ${quote.quoteNumber}`, { underline: false });
  doc.fontSize(10).fillColor('#333').moveDown(0.5);
  doc.text(`Date: ${quote.createdAt.toDateString()}`);
  doc.text(`Customer: ${quote.customer.name} (${quote.customer.email})`);
  if (quote.project.company) doc.text(`Company: ${quote.project.company.name}`);
  doc.text(`Project: ${quote.project.name}`);
  doc.moveDown();

  doc.fontSize(12).fillColor('#111').text('Specification', { underline: true }).moveDown(0.3);
  doc.fontSize(10).fillColor('#333');
  doc.text(`Process: ${quote.process}`);
  doc.text(`Material: ${quote.material}`);
  doc.text(`Quantity: ${quote.quantity}`);
  if (quote.finish) doc.text(`Finish: ${quote.finish}`);
  if (quote.tolerance) doc.text(`Tolerance: ${quote.tolerance}`);
  doc.text(`Lead time: ${quote.leadTime ?? 'TBD'} days`);
  doc.moveDown();

  doc.fontSize(12).fillColor('#111').text('CAD Files', { underline: true }).moveDown(0.3);
  doc.fontSize(10).fillColor('#333');
  quote.items.forEach((item) => doc.text(`• ${item.cadFile.originalName} × ${item.quantity}`));
  doc.moveDown();

  doc.fontSize(12).fillColor('#111').text('Price Breakdown', { underline: true }).moveDown(0.3);
  doc.fontSize(10).fillColor('#333');
  doc.text(`Material cost: $${(quote.materialCost ?? 0).toFixed(2)}`);
  doc.text(`Machine cost: $${(quote.machineCost ?? 0).toFixed(2)}`);
  doc.text(`Setup cost: $${(quote.setupCost ?? 0).toFixed(2)}`);
  doc.text(`Finishing cost: $${(quote.finishingCost ?? 0).toFixed(2)}`);
  if (quote.rushCost) doc.text(`Rush/delivery cost: $${quote.rushCost.toFixed(2)}`);
  if (quote.discount) doc.text(`Discount: -$${quote.discount.toFixed(2)}`);
  doc.moveDown(0.3);
  doc
    .fontSize(13)
    .fillColor('#111')
    .text(`Total: $${(quote.finalPrice ?? quote.estimatedPrice ?? 0).toFixed(2)} ${quote.currency}`, { underline: false });
  doc.moveDown();

  if (quote.customerNotes) {
    doc.fontSize(12).fillColor('#111').text('Notes', { underline: true }).moveDown(0.3);
    doc.fontSize(10).fillColor('#333').text(quote.customerNotes);
    doc.moveDown();
  }

  doc.fontSize(8).fillColor('#888').text('This quotation is valid for 30 days from the date above. Terms and conditions apply — see protonex.example/terms.');

  doc.end();

  await new Promise((resolve) => stream.on('end', resolve));
  const buffer = Buffer.concat(chunks);

  const storageKey = `quote-pdfs/${quote.id}/${quote.quoteNumber}.pdf`;
  await s3.send(
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey, Body: buffer, ContentType: 'application/pdf' })
  );

  return storageService.getDownloadUrl(storageKey, `${quote.quoteNumber}.pdf`);
}
