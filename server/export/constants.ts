import crypto from "crypto";
import { AnalysisWeights, FateSketchThresholds } from "../logic/analysisLogic.js";

export const EXPORT_SCHEMA_VERSION = "1.2.0";

export function getAnalysisWeightsVersion(): string {
  const json = JSON.stringify({ AnalysisWeights, FateSketchThresholds });
  return crypto.createHash("sha256").update(json).digest("hex").slice(0, 12);
}
