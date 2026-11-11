import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';

// Single shared connection; BullMQ manages its own internal connections per queue/worker
// but we centralize the URL/config here.
export const connection = new IORedis(env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });

export const cadAnalysisQueue = new Queue('CAD_ANALYSIS', { connection });
export const quoteCalculationQueue = new Queue('QUOTE_CALCULATION', { connection });
export const emailQueue = new Queue('EMAIL_SEND', { connection });
export const pdfGenerationQueue = new Queue('PDF_GENERATION', { connection });

export interface CadAnalysisJob {
  cadFileId: string;
}
export interface EmailJob {
  template: string;
  recipient: string;
  data: Record<string, unknown>;
  idempotencyKey?: string;
}
export interface PdfGenerationJob {
  quoteId: string;
}

const defaultJobOpts = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: 500,
  removeOnFail: 1000,
};

export const jobs = {
  enqueueCadAnalysis: (data: CadAnalysisJob) => cadAnalysisQueue.add('analyze', data, defaultJobOpts),
  enqueueEmail: (data: EmailJob) =>
    emailQueue.add('send', data, { ...defaultJobOpts, jobId: data.idempotencyKey }),
  enqueuePdfGeneration: (data: PdfGenerationJob) => pdfGenerationQueue.add('generate', data, defaultJobOpts),
};
