import { Resend } from 'resend';
import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { emailTemplates, EmailTemplateName } from '../../emails/templates';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

interface SendEmailInput {
  template: EmailTemplateName;
  recipient: string;
  data: Record<string, unknown>;
  /** Pass a stable key (e.g. `quote-approved-${quoteId}`) to guarantee at-most-once delivery on retries. */
  idempotencyKey?: string;
}

async function sendWithRetry(fn: () => Promise<{ id: string } | null>, attempts = 3): Promise<{ id: string } | null> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const backoffMs = 2 ** i * 500;
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr;
}

export const emailService = {
  /**
   * Sends a templated transactional email. In production this should be called by a
   * background worker consuming an EMAIL_SEND job, not synchronously inside a request
   * handler — see src/jobs/queue.ts. Idempotent when idempotencyKey is provided.
   */
  async send({ template, recipient, data, idempotencyKey }: SendEmailInput): Promise<void> {
    const key = idempotencyKey ?? crypto.createHash('sha256').update(`${template}:${recipient}:${JSON.stringify(data)}`).digest('hex');

    const existing = await prisma.emailLog.findUnique({ where: { idempotencyKey: key } });
    if (existing && existing.status === 'SENT') {
      logger.info({ template, recipient, key }, 'Skipping duplicate email send (idempotency hit)');
      return;
    }

    const log = existing
      ? await prisma.emailLog.update({ where: { id: existing.id }, data: { attempts: { increment: 1 } } })
      : await prisma.emailLog.create({
          data: { recipient, template, status: 'QUEUED', idempotencyKey: key, metadata: data as any },
        });

    try {
      const { subject, html } = emailTemplates[template]({ ...data, appUrl: env.APP_URL });

      let providerId: string | null = null;
      if (resend) {
        const result = await sendWithRetry(async () => {
          const { data: r, error } = await resend.emails.send({
            from: env.EMAIL_FROM,
            to: recipient,
            subject,
            html,
          });
          if (error) throw new Error(error.message);
          return r ? { id: r.id } : null;
        });
        providerId = result?.id ?? null;
      } else {
        logger.warn({ template, recipient }, 'RESEND_API_KEY not configured — email logged but not sent');
      }

      await prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'SENT', sentAt: new Date(), providerId: providerId ?? undefined },
      });
    } catch (err) {
      await prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', errorMessage: err instanceof Error ? err.message : String(err) },
      });
      logger.error({ err, template, recipient }, 'Email send failed after retries');
      // Do not throw — a failed email must never fail the parent business transaction
      // (e.g. quote approval should still succeed even if the notification email fails).
    }
  },
};
