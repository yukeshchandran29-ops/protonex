import { z } from 'zod';
import { DeliverySpeed, ManufacturingProcess } from '@prisma/client';

export const signupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  companyName: z.string().trim().min(1).max(200).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(10),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
});

export const requestUploadSchema = z.object({
  projectId: z.string().min(1),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(200 * 1024 * 1024), // 200MB hard ceiling
  contentType: z.string().min(1),
});

export const confirmUploadSchema = z.object({
  cadFileId: z.string().min(1),
  checksum: z.string().min(8),
});

export const createQuoteSchema = z.object({
  projectId: z.string().min(1),
  cadFileIds: z.array(z.string().min(1)).min(1),
  process: z.nativeEnum(ManufacturingProcess),
  material: z.string().min(1),
  quantity: z.number().int().positive().max(100000),
  finish: z.string().optional(),
  tolerance: z.string().optional(),
  deliverySpeed: z.nativeEnum(DeliverySpeed).default(DeliverySpeed.STANDARD),
  customerNotes: z.string().max(4000).optional(),
});

export const engineerUpdateQuoteSchema = z.object({
  finalPrice: z.number().positive().optional(),
  leadTime: z.number().int().positive().optional(),
  internalNotes: z.string().max(8000).optional(),
  customerNotes: z.string().max(4000).optional(),
  discount: z.number().min(0).optional(),
  status: z
    .enum(['UNDER_REVIEW', 'NEEDS_CUSTOMER_INFO', 'APPROVED', 'REJECTED'])
    .optional(),
});

export const pricingMaterialSchema = z.object({
  name: z.string().min(1),
  process: z.nativeEnum(ManufacturingProcess),
  costPerKg: z.number().positive(),
  density: z.number().positive(),
  wasteFactor: z.number().min(1).max(3).default(1.1),
  minimumCharge: z.number().min(0).default(0),
});
