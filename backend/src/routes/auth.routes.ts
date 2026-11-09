import { Router } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../db/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { authService } from '../services/authService';
import { emailService } from '../services/emailService';
import { requireAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../utils/validation';
import { env } from '../config/env';

export const authRouter = Router();

const ACCESS_COOKIE = 'protonex_access_token';
const REFRESH_COOKIE = 'protonex_refresh_token';
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const cookieOpts = (maxAgeMs: number) => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax' as const,
  maxAge: maxAgeMs,
  path: '/',
});

async function issueSession(res: import('express').Response, user: { id: string; role: Role; companyId: string | null }) {
  const accessToken = authService.signAccessToken({ sub: user.id, role: user.role, companyId: user.companyId });
  const { token: refreshToken, hash } = authService.generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  res.cookie(ACCESS_COOKIE, accessToken, cookieOpts(15 * 60 * 1000));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts(30 * 24 * 60 * 60 * 1000));
}

authRouter.post(
  '/signup',
  authLimiter,
  asyncHandler(async (req, res) => {
    const data = signupSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      // Do not reveal whether the account exists — generic message either way.
      throw ApiError.conflict('Unable to create account with these details');
    }

    const passwordHash = await authService.hashPassword(data.password);
    const emailVerifyToken = authService.generateUrlSafeToken();

    const company = data.companyName
      ? await prisma.company.create({ data: { name: data.companyName } })
      : null;

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: Role.CUSTOMER,
        companyId: company?.id,
        emailVerifyToken,
        emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await emailService.send({
      template: 'welcome',
      recipient: user.email,
      data: { name: user.name },
    });
    await emailService.send({
      template: 'email_verification',
      recipient: user.email,
      data: { name: user.name, verifyUrl: `${env.APP_URL}/verify-email?token=${emailVerifyToken}` },
    });

    await prisma.auditLog.create({
      data: { userId: user.id, action: 'USER_SIGNUP', entityType: 'User', entityId: user.id, ipAddress: req.ip },
    });

    await issueSession(res, user);
    res.status(201).json({
      success: true,
      data: { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified },
    });
  })
);

authRouter.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    // Constant-shaped response whether or not the user exists, to avoid user enumeration.
    const genericError = () => ApiError.badRequest('INVALID_CREDENTIALS', 'Invalid email or password');

    if (!user) throw genericError();

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw ApiError.badRequest('ACCOUNT_LOCKED', 'Account temporarily locked due to failed login attempts. Try again later.');
    }

    const valid = await authService.verifyPassword(password, user.passwordHash);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
        },
      });
      throw genericError();
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    await issueSession(res, user);
    await prisma.auditLog.create({
      data: { userId: user.id, action: 'USER_LOGIN', entityType: 'User', entityId: user.id, ipAddress: req.ip },
    });

    res.json({
      success: true,
      data: { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified },
    });
  })
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (refreshToken) {
      const hash = authService.hashOpaqueToken(refreshToken);
      await prisma.refreshToken.updateMany({ where: { tokenHash: hash }, data: { revoked: true } });
    }
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    res.json({ success: true, data: null });
  })
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) throw ApiError.unauthorized('No refresh token');

    const hash = authService.hashOpaqueToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw ApiError.unauthorized('Refresh token invalid or expired');
    }

    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) throw ApiError.unauthorized();

    // Rotate: revoke old, issue new (prevents replay of stolen refresh tokens).
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
    await issueSession(res, user);

    res.json({ success: true, data: null });
  })
);

authRouter.post(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const { token } = verifyEmailSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { emailVerifyToken: token } });
    if (!user || !user.emailVerifyExpires || user.emailVerifyExpires < new Date()) {
      throw ApiError.badRequest('INVALID_TOKEN', 'Verification link is invalid or has expired');
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null, emailVerifyExpires: null },
    });
    res.json({ success: true, data: { verified: true } });
  })
);

authRouter.post(
  '/forgot-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });

    // Always respond success — never confirm/deny account existence.
    if (user) {
      const token = authService.generateUrlSafeToken();
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken: token, passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000) },
      });
      await emailService.send({
        template: 'password_reset',
        recipient: user.email,
        data: { name: user.name, resetUrl: `${env.APP_URL}/reset-password?token=${token}` },
      });
    }
    res.json({ success: true, data: { message: 'If that email exists, a reset link has been sent.' } });
  })
);

authRouter.post(
  '/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { token, password } = resetPasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { passwordResetToken: token } });
    if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      throw ApiError.badRequest('INVALID_TOKEN', 'Reset link is invalid or has expired');
    }
    const passwordHash = await authService.hashPassword(password);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordResetToken: null, passwordResetExpires: null, failedLoginAttempts: 0, lockedUntil: null },
    });
    // Revoke all existing sessions on password reset.
    await prisma.refreshToken.updateMany({ where: { userId: user.id }, data: { revoked: true } });
    res.json({ success: true, data: { message: 'Password updated. Please log in again.' } });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, role: true, emailVerified: true, companyId: true, createdAt: true },
    });
    res.json({ success: true, data: user });
  })
);
