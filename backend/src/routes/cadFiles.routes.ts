import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { assertOwnsOrStaff } from '../middleware/ownership';
import { uploadLimiter } from '../middleware/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { requestUploadSchema, confirmUploadSchema } from '../utils/validation';
import { storageService } from '../services/storageService';
import { jobs } from '../jobs/queue';

export const cadFilesRouter = Router();
cadFilesRouter.use(requireAuth);

/** All CAD files visible to the current user — their own, or everything for staff. */
cadFilesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const isStaff = req.user!.role === 'ENGINEER' || req.user!.role === 'ADMIN';
    const files = await prisma.cADFile.findMany({
      where: isStaff ? {} : { project: { userId: req.user!.id } },
      orderBy: { createdAt: 'desc' },
      include: { geometryAnalysis: true, project: { select: { id: true, name: true } } },
    });
    res.json({ success: true, data: files });
  })
);

/**
 * Step 1 of the upload flow: customer asks for a signed URL. The CAD file bytes
 * never pass through this API process — they go straight from the browser to
 * object storage. We only record metadata + a PENDING CADFile row here.
 */
cadFilesRouter.post(
  '/request-upload',
  uploadLimiter,
  asyncHandler(async (req, res) => {
    const data = requestUploadSchema.parse(req.body);

    const project = await prisma.project.findUnique({ where: { id: data.projectId } });
    if (!project) throw ApiError.notFound('Project not found');
    assertOwnsOrStaff(req, project.userId);

    const ext = storageService.validateFile(data.fileName, data.fileSize, data.contentType);
    const storageKey = storageService.buildStorageKey(project.id, data.fileName, ext);
    const uploadUrl = await storageService.getUploadUrl(storageKey, data.contentType);

    const cadFile = await prisma.cADFile.create({
      data: {
        originalName: data.fileName,
        storageKey,
        fileType: ext.replace('.', ''),
        fileSize: data.fileSize,
        checksum: '', // filled in on confirm
        projectId: project.id,
        uploadedBy: req.user!.id,
        processingStatus: 'PENDING',
      },
    });

    res.status(201).json({ success: true, data: { cadFileId: cadFile.id, uploadUrl, storageKey } });
  })
);

/**
 * Step 2: browser confirms the direct upload completed and reports a checksum,
 * which we can compare against what object storage received (via a HEAD request
 * with ETag in a fuller implementation). This also enqueues background geometry
 * analysis so the HTTP request returns immediately.
 */
cadFilesRouter.post(
  '/confirm-upload',
  asyncHandler(async (req, res) => {
    const data = confirmUploadSchema.parse(req.body);
    const cadFile = await prisma.cADFile.findUnique({ where: { id: data.cadFileId } });
    if (!cadFile) throw ApiError.notFound('CAD file not found');

    const project = await prisma.project.findUnique({ where: { id: cadFile.projectId } });
    assertOwnsOrStaff(req, project!.userId);

    const updated = await prisma.cADFile.update({
      where: { id: cadFile.id },
      data: { checksum: data.checksum, processingStatus: 'COMPLETE', geometryStatus: 'PENDING' },
    });

    await jobs.enqueueCadAnalysis({ cadFileId: updated.id });

    res.json({ success: true, data: updated });
  })
);

cadFilesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const cadFile = await prisma.cADFile.findUnique({
      where: { id: req.params.id },
      include: { geometryAnalysis: true, dfmAnalysis: true, project: true },
    });
    if (!cadFile) throw ApiError.notFound('CAD file not found');
    assertOwnsOrStaff(req, cadFile.project.userId);

    const downloadUrl = await storageService.getDownloadUrl(cadFile.storageKey, cadFile.originalName);
    res.json({ success: true, data: { ...cadFile, downloadUrl } });
  })
);
