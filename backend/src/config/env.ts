import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8787),
  APP_URL: z.string().default('http://localhost:8787'),
  API_URL: z.string().default('http://localhost:8787'),

  // Email configuration (optional - falls back to Ethereal test inbox)
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('ProtoNex <quotes@protonex.local>'),

  // Optional Python binary for complex STEP geometry
  PYTHON_BIN: z.string().default('python'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.warn('Environment warning:', parsed.error.flatten().fieldErrors);
}

export const env = parsed.success
  ? parsed.data
  : {
      NODE_ENV: 'development' as const,
      PORT: 8787,
      APP_URL: 'http://localhost:8787',
      API_URL: 'http://localhost:8787',
      SMTP_HOST: '',
      SMTP_PORT: 587,
      SMTP_USER: '',
      SMTP_PASS: '',
      SMTP_FROM: 'ProtoNex <quotes@protonex.local>',
      PYTHON_BIN: 'python',
    };

export const isProd = env.NODE_ENV === 'production';
