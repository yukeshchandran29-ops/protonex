import { DFMVerdict } from '@prisma/client';
import type { GeometryResult } from './geometryService';

export interface DFMResult {
  thinWalls: DFMVerdict;
  tinyHoles: DFMVerdict;
  overhangs: DFMVerdict;
  aspectRatio: DFMVerdict;
  sharpCorners: DFMVerdict;
  minFeatureSize: DFMVerdict;
  accessibility: DFMVerdict;
  toleranceRisk: DFMVerdict;
  explanations: Record<string, string>;
}

/**
 * Runs the DFM checks the current geometry engine can actually support from
 * volume/area/bbox/face-count/watertightness alone. Checks that require true
 * mesh/topology inspection (thin walls, tiny holes, overhangs, sharp corners,
 * true minimum feature size, tool accessibility) are honestly reported as
 * NOT_ANALYZED rather than guessed — a false PASS/FAIL here would be worse
 * than no answer, since it could mislead a customer or engineer.
 */
export function runDfmChecks(geometry: GeometryResult): DFMResult {
  const explanations: Record<string, string> = {};

  let aspectRatio: DFMVerdict = DFMVerdict.NOT_ANALYZED;
  if (geometry.ok && geometry.bboxMm && geometry.bboxMm.every((d) => d > 0)) {
    const [x, y, z] = geometry.bboxMm;
    const longest = Math.max(x, y, z);
    const shortest = Math.min(x, y, z);
    const ratio = longest / shortest;
    if (ratio > 15) {
      aspectRatio = DFMVerdict.FAIL;
      explanations.aspectRatio = `Bounding box aspect ratio is ${ratio.toFixed(1)}:1 — parts this slender relative to their length are prone to warping or breakage during machining/printing.`;
    } else if (ratio > 8) {
      aspectRatio = DFMVerdict.WARNING;
      explanations.aspectRatio = `Aspect ratio ${ratio.toFixed(1)}:1 is on the higher side — review for handling/warping risk.`;
    } else {
      aspectRatio = DFMVerdict.PASS;
      explanations.aspectRatio = `Aspect ratio ${ratio.toFixed(1)}:1 is within normal range.`;
    }
  }

  let toleranceRisk: DFMVerdict = DFMVerdict.NOT_ANALYZED;
  if (geometry.ok && geometry.watertight === false) {
    toleranceRisk = DFMVerdict.WARNING;
    explanations.toleranceRisk = 'Mesh is not watertight — reported volume/dimensions may be unreliable, which increases tolerance risk. Recommend engineer review before final pricing.';
  } else if (geometry.ok && geometry.watertight === true) {
    toleranceRisk = DFMVerdict.PASS;
    explanations.toleranceRisk = 'Mesh is watertight; geometry-derived dimensions are reliable inputs for tolerancing.';
  }

  return {
    thinWalls: DFMVerdict.NOT_ANALYZED,
    tinyHoles: DFMVerdict.NOT_ANALYZED,
    overhangs: DFMVerdict.NOT_ANALYZED,
    aspectRatio,
    sharpCorners: DFMVerdict.NOT_ANALYZED,
    minFeatureSize: DFMVerdict.NOT_ANALYZED,
    accessibility: DFMVerdict.NOT_ANALYZED,
    toleranceRisk,
    explanations,
  };
}
