import { Router } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../db/prisma';
import { requireAuth, requireStaff } from '../middleware/auth';
import { assertOwnsOrStaff } from '../middleware/ownership';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { jobs } from '../jobs/queue';

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

ordersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const isStaff = req.user!.role === Role.ENGINEER || req.user!.role === Role.ADMIN;
    const orders = await prisma.order.findMany({
      where: isStaff ? {} : { customerId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      include: { quote: true, items: { include: { cadFile: true } } },
    });
    res.json({ success: true, data: orders });
  })
);

ordersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { quote: true, items: { include: { cadFile: true } }, customer: { select: { id: true, name: true, email: true } } },
    });
    if (!order) throw ApiError.notFound('Order not found');
    assertOwnsOrStaff(req, order.customerId);
    res.json({ success: true, data: order });
  })
);

const statusEmailMap: Record<string, string> = {
  IN_PRODUCTION: 'production_started',
  QUALITY_CHECK: 'production_completed',
};

ordersRouter.patch(
  '/:id/production-status',
  requireStaff,
  asyncHandler(async (req, res) => {
    const { productionStatus } = req.body as { productionStatus: string };
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { productionStatus: productionStatus as any },
      include: { customer: true, quote: true },
    });

    const template = statusEmailMap[productionStatus];
    if (template) {
      await jobs.enqueueEmail({
        template,
        recipient: order.customer.email,
        data: { name: order.customer.name, orderNumber: order.orderNumber },
        idempotencyKey: `${template}-${order.id}`,
      });
    }

    res.json({ success: true, data: order });
  })
);

ordersRouter.patch(
  '/:id/shipping',
  requireStaff,
  asyncHandler(async (req, res) => {
    const { shippingStatus, trackingNumber } = req.body as { shippingStatus: string; trackingNumber?: string };
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { shippingStatus: shippingStatus as any, trackingNumber },
      include: { customer: true },
    });

    if (shippingStatus === 'SHIPPED') {
      await jobs.enqueueEmail({
        template: 'order_shipped',
        recipient: order.customer.email,
        data: { name: order.customer.name, orderNumber: order.orderNumber, trackingNumber },
        idempotencyKey: `order-shipped-${order.id}`,
      });
    }
    if (shippingStatus === 'DELIVERED') {
      await jobs.enqueueEmail({
        template: 'order_delivered',
        recipient: order.customer.email,
        data: { name: order.customer.name, orderNumber: order.orderNumber },
        idempotencyKey: `order-delivered-${order.id}`,
      });
    }

    res.json({ success: true, data: order });
  })
);
