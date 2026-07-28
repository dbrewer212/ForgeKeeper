import type { PrinterRecord } from "../types/domain";

export const WORKSHOP_PRINTER_PROFILE_REVISION = 1;

const PROFILE_UPDATED_AT = "2026-07-27";

export const workshopPrinterProfiles: PrinterRecord[] = [
  {
    id: "PR-KOBRA-S1-MAX-COMBO",
    profileId: "anycubic-kobra-s1-max-combo",
    profileRevision: WORKSHOP_PRINTER_PROFILE_REVISION,
    name: "Kobra S1 Max Combo",
    model: "Kobra S1 Max Combo",
    manufacturer: "Anycubic",
    status: "Available",
    buildVolume: "350 × 350 × 350 mm",
    buildVolumeX: 350,
    buildVolumeY: 350,
    buildVolumeZ: 350,
    machineDimensions: "502.7 × 483 × 584 mm; ACE 2 Pro 368 × 291.5 × 236.5 mm",
    // Costing watts are an editable planning estimate. Rated power is stored separately.
    watts: 350,
    ratedPowerWatts: 1000,
    accessoryPowerWatts: 235,
    nozzleDiameter: 0.4,
    nozzleOptions: [0.25, 0.4, 0.6, 0.8],
    nozzleMaterial: "Hardened steel (0.4 mm installed; 0.6 mm included)",
    maxNozzleTemperatureC: 350,
    maxBedTemperatureC: 120,
    maxChamberTemperatureC: 65,
    recommendedPrintSpeedMmS: 300,
    maxPrintSpeedMmS: 600,
    maxAccelerationMmS2: 20000,
    supportedMaterials: [
      "PLA", "PETG", "TPU", "PET", "PLA-CF", "PETG-CF", "PVA",
      "ABS", "ASA", "PC", "PA", "PA6-CF", "PC-CF/GF", "PET-CF",
    ],
    motionSystem: "Fully enclosed CoreXY",
    extruder: "Short-distance direct extrusion; hardened steel gears",
    firmware: "Kobra OS",
    levelingSystem: "LeviQ 3.0 auto-leveling",
    enclosed: true,
    heatedChamber: true,
    multicolorSystem: "ACE 2 Pro",
    includedColorCount: 4,
    maxColorCount: 16,
    filamentDrying: true,
    camera: "Standard 720p HD camera",
    preferredSlicer: "anycubic",
    connectionType: "Anycubic Cloud / LAN",
    connectionEndpoint: "",
    profileSource: "Anycubic Kobra S1 Max Combo official specifications and FAQ",
    profileUpdatedAt: PROFILE_UPDATED_AT,
    maintenanceIntervalDays: 30,
    activeJob: "",
    notes: "ACE 2 Pro dries while printing up to 65°C. First-generation ACE Pro is not compatible. TPU 95A is single-color only and is not compatible with ACE 2 Pro.",
  },
  {
    id: "PR-NEPTUNE-4-MAX",
    profileId: "elegoo-neptune-4-max",
    profileRevision: WORKSHOP_PRINTER_PROFILE_REVISION,
    name: "Neptune 4 Max",
    model: "Neptune 4 Max",
    manufacturer: "ELEGOO",
    status: "Available",
    buildVolume: "420 × 420 × 480 mm",
    buildVolumeX: 420,
    buildVolumeY: 420,
    buildVolumeZ: 480,
    machineDimensions: "658 × 632 × 740 mm; operating envelope up to 658 × 950 × 960 mm",
    watts: 350,
    ratedPowerWatts: 0,
    accessoryPowerWatts: 0,
    nozzleDiameter: 0.4,
    nozzleOptions: [0.4],
    nozzleMaterial: "Extended brass hotend/nozzle; model-specific nozzle",
    maxNozzleTemperatureC: 300,
    maxBedTemperatureC: 85,
    maxChamberTemperatureC: 0,
    recommendedPrintSpeedMmS: 250,
    maxPrintSpeedMmS: 500,
    maxAccelerationMmS2: 8000,
    supportedMaterials: ["PLA", "PETG", "TPU", "ABS", "ASA", "Nylon"],
    motionSystem: "Open-frame Cartesian bed slinger",
    extruder: "5.2:1 dual-gear direct drive",
    firmware: "Klipper",
    levelingSystem: "121-point (11 × 11) automatic bed leveling",
    enclosed: false,
    heatedChamber: false,
    multicolorSystem: "None",
    includedColorCount: 1,
    maxColorCount: 1,
    filamentDrying: false,
    camera: "Not included",
    preferredSlicer: "orca",
    connectionType: "Moonraker / Fluidd",
    connectionEndpoint: "",
    profileSource: "ELEGOO Neptune 4 Max official product specifications and user manual V1.8",
    profileUpdatedAt: PROFILE_UPDATED_AT,
    maintenanceIntervalDays: 30,
    activeJob: "",
    notes: "Moonraker/Fluidd-ready network profile. ABS and ASA should be used with a suitable enclosure. Verify the installed ribbon-cable/hardware revision before ordering replacement parts.",
  },
  {
    id: "PR-KOBRA-3-COMBO",
    profileId: "anycubic-kobra-3-combo",
    profileRevision: WORKSHOP_PRINTER_PROFILE_REVISION,
    name: "Kobra 3 Combo",
    model: "Kobra 3 Combo",
    manufacturer: "Anycubic",
    status: "Available",
    buildVolume: "250 × 250 × 260 mm",
    buildVolumeX: 250,
    buildVolumeY: 250,
    buildVolumeZ: 260,
    machineDimensions: "452.9 × 504.7 × 483 mm; ACE Pro 365.9 × 282.8 × 234.5 mm",
    watts: 250,
    ratedPowerWatts: 400,
    accessoryPowerWatts: 200,
    nozzleDiameter: 0.4,
    nozzleOptions: [0.4, 0.6, 0.8],
    nozzleMaterial: "Brass",
    maxNozzleTemperatureC: 300,
    maxBedTemperatureC: 110,
    maxChamberTemperatureC: 0,
    recommendedPrintSpeedMmS: 300,
    maxPrintSpeedMmS: 600,
    maxAccelerationMmS2: 20000,
    supportedMaterials: ["PLA", "PETG", "TPU"],
    motionSystem: "Open-frame gantry bed slinger",
    extruder: "Short-distance direct drive",
    firmware: "Kobra OS",
    levelingSystem: "LeviQ 3.0 auto-leveling and Z-offset",
    enclosed: false,
    heatedChamber: false,
    multicolorSystem: "ACE Pro",
    includedColorCount: 4,
    maxColorCount: 8,
    filamentDrying: true,
    camera: "Optional 720p HD camera",
    preferredSlicer: "anycubic",
    connectionType: "Anycubic Cloud / LAN",
    connectionEndpoint: "",
    profileSource: "Anycubic Kobra 3 Combo official specifications and user manual",
    profileUpdatedAt: PROFILE_UPDATED_AT,
    maintenanceIntervalDays: 30,
    activeJob: "",
    notes: "ACE Pro is required for multicolor printing and supports drying while printing. TPU is single-color only and is not compatible with ACE Pro. Eight-color printing requires a second ACE Pro and filament hub.",
  },
];

function normalizedName(value = ""): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findExistingProfile(printers: PrinterRecord[], profile: PrinterRecord): PrinterRecord | undefined {
  const profileNames = new Set([
    normalizedName(profile.name),
    normalizedName(profile.model),
    normalizedName(profile.profileId),
  ]);
  return printers.find((printer) => (
    printer.profileId === profile.profileId
    || profileNames.has(normalizedName(printer.model))
    || profileNames.has(normalizedName(printer.name))
  ));
}

function mergeWorkshopProfile(profile: PrinterRecord, existing?: PrinterRecord): PrinterRecord {
  if (!existing) return { ...profile, supportedMaterials: [...profile.supportedMaterials], nozzleOptions: [...profile.nozzleOptions] };
  return {
    ...profile,
    id: existing.id,
    name: existing.name || profile.name,
    status: existing.status,
    watts: existing.watts || profile.watts,
    maintenanceIntervalDays: existing.maintenanceIntervalDays || profile.maintenanceIntervalDays,
    activeJob: existing.activeJob,
    connectionEndpoint: existing.connectionEndpoint || "",
    notes: existing.notes || profile.notes,
  };
}

export function installWorkshopPrinterProfiles(printers: PrinterRecord[]): PrinterRecord[] {
  const matchedIds = new Set<string>();
  const installed = workshopPrinterProfiles.map((profile) => {
    const existing = findExistingProfile(printers, profile);
    if (existing) matchedIds.add(existing.id);
    return mergeWorkshopProfile(profile, existing);
  });
  return [...installed, ...printers.filter((printer) => !matchedIds.has(printer.id))];
}

export function normalizePrinterRecord(printer: Partial<PrinterRecord>): PrinterRecord {
  const buildParts = String(printer.buildVolume ?? "")
    .split(/[x×]/i)
    .map((value) => Number.parseFloat(value))
    .filter(Number.isFinite);
  return {
    id: printer.id ?? "",
    name: printer.name ?? "Unnamed Printer",
    model: printer.model ?? printer.name ?? "",
    manufacturer: printer.manufacturer ?? "",
    profileId: printer.profileId,
    profileRevision: printer.profileRevision,
    status: printer.status ?? "Available",
    buildVolume: printer.buildVolume ?? "",
    buildVolumeX: printer.buildVolumeX ?? buildParts[0] ?? 0,
    buildVolumeY: printer.buildVolumeY ?? buildParts[1] ?? 0,
    buildVolumeZ: printer.buildVolumeZ ?? buildParts[2] ?? 0,
    machineDimensions: printer.machineDimensions ?? "",
    watts: printer.watts ?? 250,
    ratedPowerWatts: printer.ratedPowerWatts ?? 0,
    accessoryPowerWatts: printer.accessoryPowerWatts ?? 0,
    nozzleDiameter: printer.nozzleDiameter ?? 0.4,
    nozzleOptions: printer.nozzleOptions ?? [printer.nozzleDiameter ?? 0.4],
    nozzleMaterial: printer.nozzleMaterial ?? "",
    maxNozzleTemperatureC: printer.maxNozzleTemperatureC ?? 0,
    maxBedTemperatureC: printer.maxBedTemperatureC ?? 0,
    maxChamberTemperatureC: printer.maxChamberTemperatureC ?? 0,
    recommendedPrintSpeedMmS: printer.recommendedPrintSpeedMmS ?? 0,
    maxPrintSpeedMmS: printer.maxPrintSpeedMmS ?? 0,
    maxAccelerationMmS2: printer.maxAccelerationMmS2 ?? 0,
    supportedMaterials: printer.supportedMaterials ?? ["PLA", "PLA+", "PETG"],
    motionSystem: printer.motionSystem ?? "",
    extruder: printer.extruder ?? "",
    firmware: printer.firmware ?? "",
    levelingSystem: printer.levelingSystem ?? "",
    enclosed: printer.enclosed ?? false,
    heatedChamber: printer.heatedChamber ?? false,
    multicolorSystem: printer.multicolorSystem ?? "None",
    includedColorCount: printer.includedColorCount ?? 1,
    maxColorCount: printer.maxColorCount ?? 1,
    filamentDrying: printer.filamentDrying ?? false,
    camera: printer.camera ?? "",
    preferredSlicer: printer.preferredSlicer ?? (normalizedName(printer.model).includes("kobra") ? "anycubic" : "orca"),
    connectionType: printer.connectionType ?? "Local / USB",
    connectionEndpoint: printer.connectionEndpoint ?? "",
    profileSource: printer.profileSource ?? "",
    profileUpdatedAt: printer.profileUpdatedAt ?? "",
    maintenanceIntervalDays: printer.maintenanceIntervalDays ?? 30,
    activeJob: printer.activeJob ?? "",
    notes: printer.notes ?? "",
  };
}

export function createCustomPrinter(id: string, name: string, watts = 250): PrinterRecord {
  return normalizePrinterRecord({
    id,
    name,
    model: name,
    status: "Available",
    watts,
  });
}
