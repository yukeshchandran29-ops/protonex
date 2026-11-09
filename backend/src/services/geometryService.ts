import { spawn } from 'child_process';
import path from 'path';
import { env } from '../config/env';

export interface GeometryResult {
  ok: boolean;
  engine?: string;
  units?: string;
  file?: string;
  parts?: number;
  solids?: number;
  faces?: number;
  edges?: number | null;
  volumeMm3?: number;
  surfaceAreaMm2?: number;
  bboxMm?: [number, number, number];
  bboxVolumeMm3?: number;
  watertight?: boolean;
  warning?: string;
  archiveMember?: string;
  error?: string;
}

/**
 * The Python engine reports raw geometry only (volume/area/bbox/faces/watertight) — it does
 * not and should not invent a subjective "complexity" number. We derive a bounded 0–1
 * complexity heuristic here, in the pricing layer's input boundary, from feature density and
 * manufacturability risk signals we do have. This is deliberately transparent and simple
 * rather than a black box, and easy to recalibrate against real quote outcomes later.
 */
export function estimateComplexityScore(result: GeometryResult): number {
  if (!result.ok) return 0.3; // neutral default when geometry is unavailable
  const faceDensity = result.faces ? Math.min(1, result.faces / 4000) : 0.2;
  const notWatertightPenalty = result.watertight === false ? 0.25 : 0;
  const volumeToBoxRatio =
    result.volumeMm3 && result.bboxVolumeMm3 ? result.volumeMm3 / result.bboxVolumeMm3 : 0.5;
  // Low fill ratio (lots of empty space in the bounding box) tends to mean thin/intricate features.
  const shapeComplexity = 1 - Math.min(1, Math.max(0, volumeToBoxRatio));
  return Math.min(1, Math.max(0, faceDensity * 0.5 + shapeComplexity * 0.3 + notWatertightPenalty));
}

const GEOMETRY_SCRIPT = path.join(__dirname, '..', '..', 'analyze_geometry.py');
const ANALYSIS_VERSION = '2.0.0';

/**
 * Runs the geometry engine against a local file path. Callers are responsible for
 * downloading the CAD file from object storage to a temp path first, and removing
 * it afterwards — this service never touches permanent storage directly.
 */
export function analyzeGeometry(localFilePath: string, timeoutMs = 60_000): Promise<GeometryResult> {
  return new Promise((resolve) => {
    const child = spawn(env.PYTHON_BIN, [GEOMETRY_SCRIPT, localFilePath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, error: 'Geometry analysis timed out' });
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `Geometry engine unavailable: ${e.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout || '{}');
        resolve(parsed);
      } catch {
        resolve({ ok: false, error: stderr || `Geometry engine exited with code ${code}` });
      }
    });
  });
}

export const geometryService = { analyzeGeometry, ANALYSIS_VERSION };
