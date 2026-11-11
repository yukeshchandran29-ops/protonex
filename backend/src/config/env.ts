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

  // Additional optional environment variables used throughout the codebase
  REDIS_URL: z.string().optional().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().optional().default('dev-secret'),
  JWT_ACCESS_TTL: z.coerce.number().optional().default(3600),
  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().optional().default('no-reply@protonex.local'),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_REGION: z.string().optional().default(''),
  S3_FORCE_PATH_STYLE: z.string().optional().default('false'),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_BUCKET: z.string().optional().default(''),
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
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'dev-secret',
      JWT_ACCESS_TTL: 3600,
      RESEND_API_KEY: '',
      EMAIL_FROM: 'no-reply@protonex.local',
      S3_ENDPOINT: '',
      S3_REGION: '',
      S3_FORCE_PATH_STYLE: 'false',
      S3_ACCESS_KEY_ID: '',
      S3_SECRET_ACCESS_KEY: '',
      S3_BUCKET: '',
    };

export const isProd = env.NODE_ENV === 'production';


