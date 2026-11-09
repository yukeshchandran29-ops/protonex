import { Router } from 'express';
import { QuoteStatus, Role } from '@prisma/client';
import { prisma } from '../db/prisma';
import { requireAuth, requireStaff } from '../middleware/auth';
import { assertOwnsOrStaff, assertIsOwner } from '../middleware/ownership';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { createQuoteSchema, engineerUpdateQuoteSchema } from '../utils/validation';
import { pricingService } from '../services/pricingService';
import { jobs } from '../jobs/queue';
import { generateQuotePdf } from '../services/pdfService';

export const quotesRouter = Router();
quotesRouter.use(requireAuth);

function generateQuoteNumber() {
  return `PNX-Q-${Date.now().toString(36).toUpperCase()}`;
}

async function recordStatusChange(
  quoteId: string,
  oldStatus: QuoteStatus | null,
  newStatus: QuoteStatus,
  changedBy: string | null,
  note?: string
) {
  await prisma.quoteStatusHistory.create({ data: { quoteId, oldStatus, newStatus, changedBy, note } });
}

// ── List ──────────────────────────────────────────────────────────────────
quotesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const isStaff = req.user!.role === Role.ENGINEER || req.user!.role === Role.ADMIN;
    const quotes = await prisma.quote.findMany({
      where: isStaff ? {} : { customerId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      include: { project: true, items: { include: { cadFile: true } } },
    });
    res.json({ success: true, data: quotes });
  })
);

// ── Create RFQ (customer) ────────────────────────────────────────────────
quotesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createQuoteSchema.parse(req.body);

    const project = await prisma.project.findUnique({ where: { id: data.projectId } });
    if (!project) throw ApiError.notFound('Project not found');
    assertIsOwner(req, project.userId);

    const cadFiles = await prisma.cADFile.findMany({
      where: { id: { in: data.cadFileIds }, projectId: project.id },
      include: { geometryAnalysis: true },
    });
    if (cadFiles.length !== data.cadFileIds.length) {
      throw ApiError.badRequest('INVALID_FILES', 'One or more CAD files were not found in this project');
    }

    // Use the first file's geometry for the headline estimate (multi-file aggregate pricing
    // is a natural follow-up enhancement — kept simple and correct for v1).
    const primaryGeometry = cadFiles[0].geometryAnalysis
      ? {
          ok: true,
          volume: cadFiles[0].geometryAnalysis.volume ?? undefined,
          surfaceArea: cadFiles[0].geometryAnalysis.surfaceArea ?? undefined,
          complexityScore: cadFiles[0].geometryAnalysis.complexityScore ?? undefined,
        }
      : null;

    const { breakdown, snapshot } = await pricingService.calculateQuote(primaryGeometry, {
      quantity: data.quantity,
      process: data.process,
      materialName: data.material,
      finishNames: data.finish ? [data.finish] : [],
      deliverySpeed: data.deliverySpeed,
    });

    const quote = await prisma.quote.create({
      data: {
        quoteNumber: generateQuoteNumber(),
        projectId: project.id,
        customerId: req.user!.id,
        status: QuoteStatus.SUBMITTED,
        process: data.process,
        material: data.material,
        quantity: data.quantity,
        finish: data.finish,
        tolerance: data.tolerance,
        deliverySpeed: data.deliverySpeed,
        basePrice: breakdown.basePrice,
        materialCost: breakdown.materialCost,
        machineCost: breakdown.machineCost,
        setupCost: breakdown.setupCost,
        finishingCost: breakdown.finishingCost,
        rushCost: breakdown.rushCost,
        estimatedPrice: breakdown.estimatedPrice,
        leadTime: breakdown.leadTimeDays,
        customerNotes: data.customerNotes,
        pricingSnapshot: snapshot as any,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        items: {
          create: cadFiles.map((f) => ({
            cadFileId: f.id,
            quantity: data.quantity,
            unitPrice: breakdown.estimatedPrice / data.quantity,
            totalPrice: breakdown.estimatedPrice,
            geometryAnalysisId: f.geometryAnalysis?.id,
          })),
        },
      },
    });

    await recordStatusChange(quote.id, null, QuoteStatus.SUBMITTED, req.user!.id, 'RFQ submitted by customer');

    const customer = await prisma.user.findUnique({ where: { id: req.user!.id } });
    await jobs.enqueueEmail({
      template: 'quote_submitted',
      recipient: customer!.email,
      data: { name: customer!.name, quoteNumber: quote.quoteNumber },
      idempotencyKey: `quote-submitted-${quote.id}`,
    });

    res.status(201).json({ success: true, data: quote });
  })
);

// ── Get one ───────────────────────────────────────────────────────────────
quotesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const quote = await prisma.quote.findUnique({
      where: { id: req.params.id },
      include: {
        project: true,
        customer: { select: { id: true, name: true, email: true } },
        items: { include: { cadFile: true } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!quote) throw ApiError.notFound('Quote not found');
    assertOwnsOrStaff(req, quote.customerId);

    // Customers never see internal engineer notes.
    const isStaff = req.user!.role === Role.ENGINEER || req.user!.role === Role.ADMIN;
    const payload = isStaff ? quote : { ...quote, internalNotes: undefined };

    res.json({ success: true, data: payload });
  })
);

// ── Engineer review / update ─────────────────────────────────────────────
quotesRouter.patch(
  '/:id/review',
  requireStaff,
  asyncHandler(async (req, res) => {
    const data = engineerUpdateQuoteSchema.parse(req.body);
    const quote = await prisma.quote.findUnique({ where: { id: req.params.id }, include: { customer: true } });
    if (!quote) throw ApiError.notFound('Quote not found');

    const nextStatus = (data.status as QuoteStatus | undefined) ?? quote.status;

    const updated = await prisma.quote.update({
      where: { id: quote.id },
      data: {
        finalPrice: data.finalPrice,
        leadTime: data.leadTime,
        internalNotes: data.internalNotes,
        customerNotes: data.customerNotes ?? quote.customerNotes,
        discount: data.discount,
        status: nextStatus,
        approvedAt: nextStatus === QuoteStatus.APPROVED ? new Date() : quote.approvedAt,
        rejectedAt: nextStatus === QuoteStatus.REJECTED ? new Date() : quote.rejectedAt,
      },
    });

    if (nextStatus !== quote.status) {
      await recordStatusChange(quote.id, quote.status, nextStatus, req.user!.id);

      const emailMap: Partial<Record<QuoteStatus, string>> = {
        UNDER_REVIEW: 'quote_under_review',
        NEEDS_CUSTOMER_INFO: 'quote_needs_info',
        APPROVED: 'quote_approved',
        REJECTED: 'quote_rejected',
      };
      const template = emailMap[nextStatus];
      if (template) {
        await jobs.enqueueEmail({
          template,
          recipient: quote.customer.email,
          data: {
            name: quote.customer.name,
            quoteNumber: quote.quoteNumber,
            finalPrice: updated.finalPrice,
            leadTime: updated.leadTime,
            customerNotes: updated.customerNotes,
            quoteUrl: `${process.env.APP_URL}/dashboard.html?quote=${quote.id}`,
          },
          idempotencyKey: `quote-${nextStatus.toLowerCase()}-${quote.id}`,
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'QUOTE_REVIEWED',
        entityType: 'Quote',
        entityId: quote.id,
        metadata: data as any,
        ipAddress: req.ip,
      },
    });

    res.json({ success: true, data: updated });
  })
);

// ── Customer accepts an approved quote → creates Order ───────────────────
quotesRouter.post(
  '/:id/accept',
  asyncHandler(async (req, res) => {
    const quote = await prisma.quote.findUnique({ where: { id: req.params.id }, include: { customer: true } });
    if (!quote) throw ApiError.notFound('Quote not found');
    assertIsOwner(req, quote.customerId);

    if (quote.status !== QuoteStatus.APPROVED) {
      throw ApiError.conflict('Only approved quotes can be accepted');
    }

    const orderNumber = `PNX-O-${Date.now().toString(36).toUpperCase()}`;

    const [order] = await prisma.$transaction([
      prisma.order.create({
        data: {
          orderNumber,
          quoteId: quote.id,
          customerId: quote.customerId,
          items: {
            create: (
              await prisma.quoteItem.findMany({ where: { quoteId: quote.id } })
            ).map((item) => ({ cadFileId: item.cadFileId, quantity: item.quantity, price: item.totalPrice })),
          },
        },
      }),
      prisma.quote.update({
        where: { id: quote.id },
        data: { status: QuoteStatus.ORDERED, acceptedAt: new Date(), acceptedBy: req.user!.id },
      }),
    ]);

    await recordStatusChange(quote.id, QuoteStatus.APPROVED, QuoteStatus.ORDERED, req.user!.id, 'Customer accepted quote');
    await prisma.auditLog.create({
      data: { userId: req.user!.id, action: 'QUOTE_ACCEPTED', entityType: 'Quote', entityId: quote.id, ipAddress: req.ip },
    });

    await jobs.enqueueEmail({
      template: 'order_confirmation',
      recipient: quote.customer.email,
      data: { name: quote.customer.name, orderNumber: order.orderNumber, quoteNumber: quote.quoteNumber },
      idempotencyKey: `order-confirmation-${order.id}`,
    });

    res.status(201).json({ success: true, data: order });
  })
);

// ── Download quote PDF (customer or staff) ────────────────────────────────
quotesRouter.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    const quote = await prisma.quote.findUnique({ where: { id: req.params.id } });
    if (!quote) throw ApiError.notFound('Quote not found');
    assertOwnsOrStaff(req, quote.customerId);
    const url = await generateQuotePdf(quote.id);
    res.json({ success: true, data: { url } });
  })
);

// ── Customer requests changes on an approved/under-review quote ──────────
quotesRouter.post(
  '/:id/request-changes',
  asyncHandler(async (req, res) => {
    const quote = await prisma.quote.findUnique({ where: { id: req.params.id } });
    if (!quote) throw ApiError.notFound('Quote not found');
    assertIsOwner(req, quote.customerId);

    const updated = await prisma.quote.update({
      where: { id: quote.id },
      data: { status: QuoteStatus.NEEDS_CUSTOMER_INFO, customerNotes: req.body?.message ?? quote.customerNotes },
    });
    await recordStatusChange(quote.id, quote.status, QuoteStatus.NEEDS_CUSTOMER_INFO, req.user!.id, 'Customer requested changes');
    res.json({ success: true, data: updated });
  })
);
