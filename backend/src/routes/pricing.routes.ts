import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { pricingService } from '../services/pricingService';
import { DeliverySpeed, ManufacturingProcess } from '@prisma/client';

export const pricingRouter = Router();
pricingRouter.use(requireAuth);

/** Everything the quote builder needs to render its configuration options — no cost internals exposed. */
pricingRouter.get(
  '/options',
  asyncHandler(async (_req, res) => {
    const [materials, finishes, deliveries] = await Promise.all([
      prisma.material.findMany({ where: { active: true }, select: { name: true, process: true } }),
      prisma.finishingOption.findMany({ where: { active: true }, select: { name: true } }),
      prisma.deliveryOption.findMany({ where: { active: true }, select: { speed: true, leadTimeDays: true } }),
    ]);
    res.json({ success: true, data: { materials, finishes, deliveries } });
  })
);

const estimateSchema = z.object({
  cadFileId: z.string().optional(),
  process: z.nativeEnum(ManufacturingProcess),
  material: z.string().min(1),
  quantity: z.number().int().positive().max(100000),
  finish: z.string().optional(),
  deliverySpeed: z.nativeEnum(DeliverySpeed).default(DeliverySpeed.STANDARD),
});

/**
 * Live, non-persisted price preview shown while the customer configures a quote.
 * The authoritative, persisted estimate (with its immutable snapshot) is only
 * created when the RFQ is actually submitted via POST /api/quotes.
 */
pricingRouter.post(
  '/estimate',
  asyncHandler(async (req, res) => {
    const data = estimateSchema.parse(req.body);

    let geometry = null;
    if (data.cadFileId) {
      const cadFile = await prisma.cADFile.findUnique({
        where: { id: data.cadFileId },
        include: { geometryAnalysis: true, project: true },
      });
      if (!cadFile) throw ApiError.notFound('CAD file not found');
      if (cadFile.project.userId !== req.user!.id && req.user!.role === 'CUSTOMER') {
        throw ApiError.forbidden();
      }
      if (cadFile.geometryAnalysis) {
        geometry = {
          ok: true,
          volume: cadFile.geometryAnalysis.volume ?? undefined,
          surfaceArea: cadFile.geometryAnalysis.surfaceArea ?? undefined,
          complexityScore: cadFile.geometryAnalysis.complexityScore ?? undefined,
        };
      }
    }

    const { breakdown } = await pricingService.calculateQuote(geometry, {
      quantity: data.quantity,
      process: data.process,
      materialName: data.material,
      finishNames: data.finish ? [data.finish] : [],
      deliverySpeed: data.deliverySpeed,
    });

    res.json({ success: true, data: { ...breakdown, geometryUsed: !!geometry } });
  })
);
