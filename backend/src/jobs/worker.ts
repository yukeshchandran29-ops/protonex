import { Worker } from 'bullmq';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { connection, CadAnalysisJob, EmailJob, PdfGenerationJob } from './queue';
import { prisma } from '../db/prisma';
import { storageService } from '../services/storageService';
import { geometryService, estimateComplexityScore } from '../services/geometryService';
import { runDfmChecks } from '../services/dfmService';
import { emailService } from '../services/emailService';
import { generateQuotePdf } from '../services/pdfService';
import { logger } from '../utils/logger';

// ── CAD_ANALYSIS worker ────────────────────────────────────────────────────
new Worker<CadAnalysisJob>(
  'CAD_ANALYSIS',
  async (job) => {
    const cadFile = await prisma.cADFile.findUnique({ where: { id: job.data.cadFileId } });
    if (!cadFile) return;

    await prisma.cADFile.update({ where: { id: cadFile.id }, data: { geometryStatus: 'PROCESSING' } });

    const tempPath = path.join(os.tmpdir(), `protonex-${cadFile.id}${path.extname(cadFile.originalName)}`);
    try {
      const downloadUrl = await storageService.getDownloadUrl(cadFile.storageKey);
      const res = await fetch(downloadUrl);
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(tempPath, buf);

      const result = await geometryService.analyzeGeometry(tempPath);

      if (result.ok) {
        const complexityScore = estimateComplexityScore(result);
        await prisma.geometryAnalysis.upsert({
          where: { cadFileId: cadFile.id },
          create: {
            cadFileId: cadFile.id,
            volume: result.volumeMm3,
            surfaceArea: result.surfaceAreaMm2,
            boundingBoxX: result.bboxMm?.[0],
            boundingBoxY: result.bboxMm?.[1],
            boundingBoxZ: result.bboxMm?.[2],
            faceCount: result.faces,
            solidCount: result.solids,
            triangleCount: result.faces, // mesh formats report triangles as "faces"; STEP/IGES report topological faces
            watertight: result.watertight,
            complexityScore,
            analysisVersion: geometryService.ANALYSIS_VERSION,
          },
          update: {
            volume: result.volumeMm3,
            surfaceArea: result.surfaceAreaMm2,
            boundingBoxX: result.bboxMm?.[0],
            boundingBoxY: result.bboxMm?.[1],
            boundingBoxZ: result.bboxMm?.[2],
            faceCount: result.faces,
            solidCount: result.solids,
            triangleCount: result.faces,
            watertight: result.watertight,
            complexityScore,
            analysisVersion: geometryService.ANALYSIS_VERSION,
          },
        });
        await prisma.cADFile.update({
          where: { id: cadFile.id },
          data: { geometryStatus: 'COMPLETE', geometryMetadata: result as any },
        });

        const dfm = runDfmChecks(result);
        await prisma.dFMAnalysis.upsert({
          where: { cadFileId: cadFile.id },
          create: { cadFileId: cadFile.id, ...dfm, explanations: dfm.explanations as any },
          update: { ...dfm, explanations: dfm.explanations as any },
        });
      } else {
        await prisma.cADFile.update({
          where: { id: cadFile.id },
          data: { geometryStatus: 'FAILED', geometryMetadata: result as any },
        });
      }
    } catch (err) {
      logger.error({ err, cadFileId: cadFile.id }, 'CAD analysis job failed');
      await prisma.cADFile.update({ where: { id: cadFile.id }, data: { geometryStatus: 'FAILED' } });
      throw err; // let BullMQ retry with backoff
    } finally {
      await fs.rm(tempPath, { force: true });
    }
  },
  { connection }
);

// ── EMAIL_SEND worker ───────────────────────────────────────────────────────
new Worker<EmailJob>(
  'EMAIL_SEND',
  async (job) => {
    await emailService.send({
      template: job.data.template as any,
      recipient: job.data.recipient,
      data: job.data.data,
      idempotencyKey: job.data.idempotencyKey,
    });
  },
  { connection }
);

// ── PDF_GENERATION worker ───────────────────────────────────────────────────
new Worker<PdfGenerationJob>(
  'PDF_GENERATION',
  async (job) => {
    await generateQuotePdf(job.data.quoteId);
  },
  { connection }
);

logger.info('ProtoNex background workers started (CAD_ANALYSIS, EMAIL_SEND, PDF_GENERATION)');
