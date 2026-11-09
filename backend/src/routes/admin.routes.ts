import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAuth, requireAdmin, requireStaff } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { pricingMaterialSchema } from '../utils/validation';
import { generateQuotePdf } from '../services/pdfService';

export const adminRouter = Router();
adminRouter.use(requireAuth);

// ── Dashboard summary (staff) ───────────────────────────────────────────
adminRouter.get(
  '/dashboard',
  requireStaff,
  asyncHandler(async (_req, res) => {
    const [quoteCounts, orderCounts, recentQuotes] = await Promise.all([
      prisma.quote.groupBy({ by: ['status'], _count: true }),
      prisma.order.groupBy({ by: ['status'], _count: true }),
      prisma.quote.findMany({ take: 10, orderBy: { createdAt: 'desc' }, include: { customer: true, project: true } }),
    ]);
    res.json({ success: true, data: { quoteCounts, orderCounts, recentQuotes } });
  })
);

// ── Pricing configuration (admin only writes; staff can read) ───────────
adminRouter.get(
  '/pricing/materials',
  requireStaff,
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await prisma.material.findMany({ orderBy: { name: 'asc' } }) });
  })
);

adminRouter.post(
  '/pricing/materials',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = pricingMaterialSchema.parse(req.body);
    const material = await prisma.material.create({ data });
    await prisma.auditLog.create({
      data: { userId: req.user!.id, action: 'PRICING_MATERIAL_CREATED', entityType: 'Material', entityId: material.id, metadata: data as any },
    });
    res.status(201).json({ success: true, data: material });
  })
);

adminRouter.patch(
  '/pricing/materials/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = pricingMaterialSchema.partial().parse(req.body);
    const material = await prisma.material.update({ where: { id: req.params.id }, data });
    await prisma.auditLog.create({
      data: { userId: req.user!.id, action: 'PRICING_MATERIAL_UPDATED', entityType: 'Material', entityId: material.id, metadata: data as any },
    });
    res.json({ success: true, data: material });
  })
);

adminRouter.get(
  '/pricing/process-rates',
  requireStaff,
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await prisma.processRate.findMany() });
  })
);

adminRouter.get(
  '/pricing/finishing-options',
  requireStaff,
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await prisma.finishingOption.findMany() });
  })
);

adminRouter.get(
  '/pricing/delivery-options',
  requireStaff,
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await prisma.deliveryOption.findMany() });
  })
);

// ── Users (admin only) ───────────────────────────────────────────────────
adminRouter.get(
  '/users',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, companyId: true, emailVerified: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: users });
  })
);

adminRouter.patch(
  '/users/:id/role',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { role } = req.body as { role: 'CUSTOMER' | 'ENGINEER' | 'ADMIN' };
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { role } });
    await prisma.auditLog.create({
      data: { userId: req.user!.id, action: 'USER_ROLE_CHANGED', entityType: 'User', entityId: user.id, metadata: { role } },
    });
    res.json({ success: true, data: { id: user.id, role: user.role } });
  })
);

// ── Audit log (admin only) ────────────────────────────────────────────────
adminRouter.get(
  '/audit-logs',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const logs = await prisma.auditLog.findMany({ take: 200, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: logs });
  })
);

// ── Quote PDF (customer via their own route elsewhere; this is the admin path) ──
adminRouter.get(
  '/quotes/:id/pdf',
  requireStaff,
  asyncHandler(async (req, res) => {
    const url = await generateQuotePdf(req.params.id);
    res.json({ success: true, data: { url } });
  })
);
