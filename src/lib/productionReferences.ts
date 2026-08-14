import type { ProductionReferenceChecks, ProductionReferenceRecord } from "../types/domain";

export const emptyProductionReferenceChecks: ProductionReferenceChecks = {
  oneSubject: false,
  onePose: false,
  cleanBackground: false,
  noTextOrBorders: false,
  noInsetsOrCollage: false,
  noScaleFigure: false,
  noVariantLineup: false,
  noLooseProps: false,
  silhouetteReadable: false,
  canonIdentityPreserved: false,
};

export function referenceChecksPassed(reference: ProductionReferenceRecord) {
  return Object.values(reference.checks).every(Boolean);
}

export function productionReferenceReady(reference?: ProductionReferenceRecord) {
  return Boolean(
    reference
      && reference.status === "Ready"
      && reference.outputPath.trim()
      && /\.(png|jpe?g|webp)$/i.test(reference.outputPath.trim())
      && reference.subject.trim()
      && reference.pose.trim()
      && referenceChecksPassed(reference),
  );
}
