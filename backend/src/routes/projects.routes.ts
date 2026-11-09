import { Router } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { assertOwnsOrStaff } from '../middleware/ownership';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { createProjectSchema } from '../utils/validation';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

function generateProjectNumber() {
  return `PNX-P-${Date.now().toString(36).toUpperCase()}`;
}

projectsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const isStaff = req.user!.role === Role.ENGINEER || req.user!.role === Role.ADMIN;
    const projects = await prisma.project.findMany({
      where: isStaff ? {} : { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { cadFiles: true, quotes: true } } },
    });
    res.json({ success: true, data: projects });
  })
);

projectsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createProjectSchema.parse(req.body);
    const project = await prisma.project.create({
      data: {
        projectNumber: generateProjectNumber(),
        name: data.name,
        description: data.description,
        userId: req.user!.id,
        companyId: req.user!.companyId ?? undefined,
      },
    });
    res.status(201).json({ success: true, data: project });
  })
);

projectsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { cadFiles: true, quotes: true },
    });
    if (!project) throw ApiError.notFound('Project not found');
    assertOwnsOrStaff(req, project.userId);
    res.json({ success: true, data: project });
  })
);
