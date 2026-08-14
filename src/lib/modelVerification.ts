import type { AssessmentResult, InspectionView, ModelVerificationRecord, VerificationCheck } from "../types/domain";

export const requiredInspectionViews: InspectionView[] = ["Front", "Left", "Right", "Back", "Top", "Three-quarter", "Silhouette"];

const visualLabels = [
  "Canonical identity",
  "Overall proportions",
  "Required anatomy",
  "Intended pose and frozen action",
  "Facial character and expression",
  "Signature features",
  "No missing required elements",
  "No hallucinated geometry",
  "No duplicate bodies or objects",
  "No attached background debris",
];

const meshLabels = [
  "Units, scale, bounding box, and origin",
  "Watertight manifold geometry and normals",
  "No self-intersections or duplicate geometry",
  "No disconnected islands or unintended shells",
  "Local wall and feature thickness assessed",
  "No trapped cavities, supports, or unusable complexity",
];

function checks(prefix: string, labels: string[]): VerificationCheck[] {
  return labels.map((label, index) => ({ id: `${prefix}-${index + 1}`, label, result: "Not Assessed", note: "" }));
}

export function defaultVisualChecks() {
  return checks("VIS", visualLabels);
}

export function defaultMeshChecks() {
  return checks("MESH", meshLabels);
}

export function checksAllPass(items: VerificationCheck[]) {
  return items.length > 0 && items.every((item) => item.result === "Pass");
}

export function checksContainFailure(items: VerificationCheck[]) {
  return items.some((item) => item.result === "Fail");
}

export function updateVerificationCheck(items: VerificationCheck[], id: string, result: AssessmentResult, note?: string) {
  return items.map((item) => item.id === id ? { ...item, result, ...(note === undefined ? {} : { note }) } : item);
}

export function canApproveForgeability(record: ModelVerificationRecord) {
  return record.evidenceClass !== "Concept only"
    && Boolean(record.modelPath.trim())
    && /^[a-f0-9]{64}$/i.test(record.modelSha256.trim())
    && checksAllPass(record.meshChecks);
}

export function requiredViewsPresent(record: ModelVerificationRecord) {
  return requiredInspectionViews.every((view) => Boolean(record.inspectionViews[view]?.trim()));
}
