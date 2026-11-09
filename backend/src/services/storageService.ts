import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import path from 'path';
import { env } from '../config/env';

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

export const ALLOWED_CAD_EXTENSIONS = ['.step', '.stp', '.stl', '.obj', '.iges', '.igs', '.dxf', '.dwg', '.3mf', '.zip'];
const ALLOWED_MIME_PREFIXES = ['application/', 'model/', 'text/plain'];
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export const storageService = {
  validateFile(fileName: string, fileSize: number, contentType: string) {
    const ext = path.extname(fileName).toLowerCase();
    if (!ALLOWED_CAD_EXTENSIONS.includes(ext)) {
      throw new Error(`Unsupported CAD format: ${ext || 'unknown'}`);
    }
    if (fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) {
      throw new Error('File size exceeds the 200MB limit');
    }
    if (contentType && !ALLOWED_MIME_PREFIXES.some((p) => contentType.startsWith(p))) {
      // CAD MIME types are inconsistent across OSes/browsers — flag but don't hard block on this alone;
      // extension + later checksum/magic-byte checks in the analysis worker are the real gate.
    }
    return ext;
  },

  buildStorageKey(projectId: string, fileName: string, ext: string): string {
    const safeBase = path
      .basename(fileName, ext)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 120);
    return `cad-files/${projectId}/${crypto.randomUUID()}-${safeBase}${ext}`;
  },

  async getUploadUrl(storageKey: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: storageKey,
      ContentType: contentType,
      // Private by default — never publicly readable CAD IP.
    });
    return getSignedUrl(s3, command, { expiresIn: 600 }); // 10 minutes to complete upload
  },

  async getDownloadUrl(storageKey: string, downloadName?: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: storageKey,
      ResponseContentDisposition: downloadName ? `attachment; filename="${downloadName}"` : undefined,
    });
    return getSignedUrl(s3, command, { expiresIn: 300 }); // 5 minutes
  },

  async deleteObject(storageKey: string): Promise<void> {
    await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey }));
  },
};
