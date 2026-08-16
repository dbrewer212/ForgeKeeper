import type { ModelVerificationRecord, PrintTrialCriterion, PrintTrialRecord } from "../types/domain";

export function defaultPrintTrialCriteria(): PrintTrialCriterion[] {
  return [
    { id: "print-completed", label: "Print completes without an uncontrolled failure", result: "Pending", observation: "" },
    { id: "identity-readable", label: "Required identity and silhouette survive at intended scale", result: "Pending", observation: "" },
    { id: "dimensions-fit", label: "Critical dimensions, connections, and assembly fit as intended", result: "Pending", observation: "" },
    { id: "durability", label: "Thin features, joints, and load-bearing areas survive intended handling", result: "Pending", observation: "" },
    { id: "supports-clean", label: "Supports remove without unacceptable damage or trapped material", result: "Pending", observation: "" },
    { id: "finish-acceptable", label: "Surface finish and cleanup effort meet the product requirement", result: "Pending", observation: "" },
  ];
}

export function printTrialReadyToStart(trial: PrintTrialRecord): boolean {
  return Boolean(
    trial.modelPath.trim()
    && /^[a-f0-9]{64}$/i.test(trial.modelSha256)
    && trial.modelRevision.trim()
    && trial.printerId
    && trial.nozzleDiameterMm > 0
    && trial.materialName.trim()
    && trial.materialDryState !== "Unknown"
    && trial.slicer.trim()
    && trial.slicerVersion.trim()
    && trial.profileName.trim()
    && trial.profileRevision.trim()
    && trial.orientation.trim()
    && trial.supports.trim()
    && trial.partDivision.trim()
    && trial.assemblyMethod.trim()
    && trial.estimatedTimeHours != null && trial.estimatedTimeHours >= 0
    && trial.estimatedMaterialGrams != null && trial.estimatedMaterialGrams >= 0
    && trial.controlledVariables.some((item) => item.trim())
    && trial.criteria.length > 0,
  );
}

export function printTrialCanPass(trial: PrintTrialRecord): boolean {
  return Boolean(
    printTrialReadyToStart(trial)
    && trial.startedAt
    && trial.actualTimeHours != null && trial.actualTimeHours >= 0
    && trial.actualMaterialGrams != null && trial.actualMaterialGrams >= 0
    && trial.cleanupMinutes != null && trial.cleanupMinutes >= 0
    && trial.assemblyMinutes != null && trial.assemblyMinutes >= 0
    && trial.dimensionalResults.trim()
    && trial.surfaceResult.trim()
    && trial.supportRemovalResult.trim()
    && trial.evidencePaths.some((item) => item.trim())
    && trial.criteria.every((criterion) => criterion.result === "Pass" && criterion.observation.trim())
    && trial.outcomeVerifiedByDerek,
  );
}

export function printTrialCanFail(trial: PrintTrialRecord): boolean {
  return Boolean(
    printTrialReadyToStart(trial)
    && trial.startedAt
    && trial.failureMode.trim()
    && trial.nextAction.trim()
    && trial.evidencePaths.some((item) => item.trim())
    && trial.criteria.some((criterion) => criterion.result === "Fail")
    && trial.outcomeVerifiedByDerek,
  );
}

export function productionEvidenceReady(verification: ModelVerificationRecord | undefined, trial: PrintTrialRecord | undefined): boolean {
  return Boolean(
    verification
    && trial
    && verification.visualDecision === "Accepted"
    && verification.forgeabilityStatus === "Approved"
    && trial.status === "Passed"
    && trial.modelVerificationId === verification.id
    && trial.modelRevision === verification.modelRevision
    && trial.modelSha256.toLowerCase() === verification.modelSha256.toLowerCase(),
  );
}
