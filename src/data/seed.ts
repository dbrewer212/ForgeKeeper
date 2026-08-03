import type { AppSettings, CanonRecord, CollectionRecord, ConceptSpec, ControlCenterRecord, FilamentRecord, OrderRecord, PrinterRecord, Product, ProductVariant, ReleaseRecord, STLRecord } from "../types/domain";

export const defaultSettings: AppSettings = {
  laborRate: 18,
  electricityRate: 0.203,
  machineWatts: 250,
  packagingCost: 1.25,
  otherCost: 0.5,
  materialMarkupPercent: 10,
  targetMarginPercent: 50,
  assetRootPath: "FenrirForgeworks/assets",
  productionHoursPerDay: 8,
};

export const defaultControlCenter: ControlCenterRecord = {
  activeObjective: {
    id: "OBJ-FOUNDRY-FIRST-ACTIVE",
    title: "Choose the Foundry's active objective",
    stage: "Planning",
    status: "Active",
    blocker: "None",
    approvalNeeded: "Select the one objective that should receive active work.",
    lastCompletedAction: "Foundry Control Center initialized.",
    nextAction: "Name the objective, connect a product when applicable, and record its next real gate.",
    updatedAt: "2026-08-02T00:00:00.000Z",
  },
  parkedIdeas: [],
};

export const seedCanonRecords: CanonRecord[] = [
  {
    id: "CANON-PROPER-MIMICWHELP",
    name: "Proper Mimicwhelp",
    kind: "Creature",
    canonStatus: "Locked",
    primaryAuthority: "MimicWhelp_proper.png",
    supersededReferences: ["MimicWhelp.png"],
    identity: "A young mimic raised among wyrmslings who believes it is a dragon; its patchwork body is built through hopeful imitation.",
    foundryRole: "A sincere would-be wyrmsling whose improvised attempts turn belonging, imitation, and Foundry chaos into character-driven stories.",
    relationships: ["Raised among wyrmslings", "Receives repairs, gifts, and gadgets from Foundry residents", "Matures into Mimicwyrm"],
    characterDna: ["Mimic chest-and-maw identity", "One large expressive eye", "Patchwork found or gifted construction", "Proudly made nonfunctional wings", "Hopeful, determined imitation", "Imperfect asymmetry"],
    allowedVariation: ["Small goblin-made accessories", "Repairs and keepsakes", "Gadgets inspired by admired residents", "Pose and activity changes that preserve identity"],
    forbiddenDrift: ["Generic baby dragon anatomy", "Perfect symmetrical armor", "Removing the mimic/chest logic", "Functional natural wings", "Cruel or evil characterization"],
    symbolism: "Belonging through effort, adaptation, and the sincere desire to become part of the Foundry community.",
    currentProductionDesign: "Canonical identity is locked; individual printable poses and accessories remain separate production revisions requiring their own engineering evidence.",
    decisionEvidence: "Derek explicitly established the Proper Mimicwhelp sheet as the canonical foundation and limited variants to small influence-based additions.",
    authorityLinked: false,
    lastCanonChange: "Proper Mimicwhelp established as the canonical foundation; later variants must extend rather than redesign it.",
    notes: "Compliments or continued discussion do not approve a redesign.",
  },
  {
    id: "CANON-EMBERWHELP",
    name: "Emberwhelp",
    kind: "Creature",
    canonStatus: "Locked",
    primaryAuthority: "Emberwhelp.png plus later explicit approved refinements",
    supersededReferences: ["Wyrmsling.png as printable exploration"],
    identity: "A forge-born juvenile wyrmsling: curious, energetic, playful, loyal, easily excited, and visibly carrying the Foundry's inner heat.",
    foundryRole: "The Spark of the Forge: an energetic juvenile whose curiosity turns ordinary Foundry activity into warm, active storytelling.",
    relationships: ["Foundry wyrmsling", "Admirer and influence on Mimicwhelp", "Handled and protected by Foundry caretakers"],
    characterDna: ["Forge-black heat-shaped surface", "Visible inner ember heat", "Large expressive amber eyes", "Forming horn nubs", "Ember tail that reacts with mood", "Curious juvenile proportions"],
    allowedVariation: ["Story-driven poses", "Foundry tools used in-character", "Production refinements that retain the locked silhouette and face", "Realm influence only when intentionally approved"],
    forbiddenDrift: ["Generic orange cartoon dragon", "Cold or detached personality", "Decorative flame clutter without story", "Losing the face, eye, horn, or ember-tail identity", "Treating color alone as a new wyrmsling"],
    symbolism: "The first spark: curiosity, energy, growth, and the living fire of making.",
    currentProductionDesign: "Core face and identity are canonical; the later approved long-bodied, heat-tempered juvenile anatomy governs future production development over compact older explorations.",
    decisionEvidence: "Derek locked the uploaded Emberwhelp concept as the core identity and later explicitly superseded conflicting compact/cracked-surface production anatomy.",
    authorityLinked: false,
    lastCanonChange: "Uploaded Emberwhelp concept preserved as the core authority; later explicit locks supersede conflicting older production explorations.",
    notes: "Resolve any anatomy-specific production change against its recorded approval before model generation.",
  },
  {
    id: "CANON-PURGE",
    name: "Purge",
    kind: "Resident",
    canonStatus: "Locked",
    primaryAuthority: "Foundry canon and Charter decisions",
    supersededReferences: [],
    identity: "An older, quiet goblin whose help is known through reclaimed possibilities rather than personal recognition.",
    foundryRole: "The unseen keeper of overlooked possibilities, expressed through repaired objects, reclaimed material, and quiet acts rather than appearances.",
    relationships: ["Helps Foundry residents without seeking recognition", "Transforms discarded material into Purge's Trinkets", "Embodies the Foundry's ethic of consideration"],
    characterDna: ["No fixed appearance", "Quiet acts of help", "Sees purpose in discarded things", "Older and observant", "Compassion without spectacle", "Reclamation as practice"],
    allowedVariation: ["Evidence of his work", "Anonymous repaired objects", "Purge's Trinkets", "Stories told through aftermath and quiet assistance"],
    forbiddenDrift: ["Official character design", "Sculpt or mascot depiction", "Seeking praise or recognition", "Comic junk-hoarder stereotype", "Treating broken things or people as disposable"],
    symbolism: "Empathy, compassion, reclamation, and the belief that overlooked or broken things deserve consideration.",
    currentProductionDesign: "No official character design or sculpt is permitted. Products may depict the evidence and results of his work, including Purge's Trinkets.",
    decisionEvidence: "Derek explicitly established that Purge intentionally has no fixed appearance, official design, or sculpt.",
    authorityLinked: false,
    lastCanonChange: "Purge intentionally established without an official appearance or sculpt.",
    notes: "His absence from view is an identity rule, not missing concept art.",
  },
  {
    id: "CANON-MIMICWYRM",
    name: "Mimicwyrm",
    kind: "Creature",
    canonStatus: "Established Direction",
    primaryAuthority: "Proper Mimicwhelp identity plus Mimicwyrm development sheets",
    supersededReferences: [],
    identity: "The adult Mimicwhelp that never stopped believing; a magnificent accumulated creature built from attempts, gifts, failures, and Foundry history.",
    foundryRole: "The long-term outcome of Mimicwhelp's belief and community history: impressive because every imperfect accumulated part has meaning.",
    relationships: ["Adult continuation of Proper Mimicwhelp", "Protective of friends and wyrmslings", "Carries gifts, repairs, and Foundry history"],
    characterDna: ["Adult mimic chest-and-maw identity", "Improvised construction", "Uneven horns and asymmetry", "Forge junk and collected objects", "Learned wyrmsling behavior", "Earnest self-identification as a dragon"],
    allowedVariation: ["Accumulated repairs and gifts", "Hoard objects with personal stories", "Imperfect learned abilities", "Scale growth that preserves mimic identity"],
    forbiddenDrift: ["Conventional dragon anatomy", "Perfect armor sculpture", "Generic gold hoard", "Erasing its history of imitation", "Turning it grim or malicious"],
    symbolism: "Proof that belief, community, and accumulated imperfect attempts can build something extraordinary.",
    currentProductionDesign: "Established adult direction only. The competing Mimicwyrm development sheets remain references; neither is the locked production design.",
    decisionEvidence: "The adult identity is established in project canon, but Derek has not explicitly selected either competing adult visual sheet as final.",
    authorityLinked: false,
    lastCanonChange: "Adult direction established; competing visual development sheets remain unresolved until Derek explicitly locks one.",
    notes: "Do not infer a final visual lock from either adult sheet alone.",
  },
];

export const seedProducts: Product[] = [
  {
    id: "P1",
    name: "Controller Stand",
    tier: "Hero",
    line: "ForgeTech",
    category: "Controller Stand",
    collection: "ForgeTech Lane",
    status: "Active",
    targetPrice: 29.99,
    estimatedFilamentGrams: 110,
    estimatedPrintHours: 6.5,
    available: 24,
    reorderPoint: 10,
    productImagePath: "/assets/products/controller-stand.png",
    conceptImagePath: "/assets/concepts/controller-stand-concept.png",
    supportedRealmVariants: ["Midgard", "Svartalfheim", "Asgard"],
    notes: "Primary hero product",
  },
  {
    id: "P2",
    name: "Cable Organizer",
    tier: "Utility",
    line: "ForgeTech",
    category: "Cable Organizer",
    collection: "ForgeTech Lane",
    status: "Active",
    targetPrice: 12,
    estimatedFilamentGrams: 22,
    estimatedPrintHours: 1.4,
    available: 52,
    reorderPoint: 20,
    productImagePath: "/assets/products/cable-organizer.png",
    conceptImagePath: "/assets/concepts/cable-organizer-concept.png",
    supportedRealmVariants: [],
    notes: "Utility fast print",
  },
];

export const seedStls: STLRecord[] = [
  { id: "STL-P1-PRIMARY", productId: "P1", name: "Controller Stand Primary STL", fileName: "assets/stls/controller-stand/controller-stand-v1.stl", version: "v1", isPrimary: true, notes: "Primary production file." },
  { id: "STL-P2-PRIMARY", productId: "P2", name: "Cable Organizer Primary STL", fileName: "assets/stls/cable-organizer/cable-organizer-v1.stl", version: "v1", isPrimary: true, notes: "Fast utility print." },
];

export const seedConcepts: ConceptSpec[] = [
  {
    id: "CON-P1-PRIMARY",
    productId: "P1",
    title: "Controller Stand Concept Spec",
    imageName: "/assets/concepts/controller-stand-concept.png",
    measurements: "Track overall footprint, controller cradle width, cable pass-through, and base height.",
    description: "ForgeTech hero item with optional realm styling. Use this spec for listing content and variant planning.",
    notes: "Concept drives STL association and future variant image planning.",
    linkedStlId: "STL-P1-PRIMARY",
  },
  {
    id: "CON-P2-PRIMARY",
    productId: "P2",
    title: "Cable Organizer Concept Spec",
    imageName: "/assets/concepts/cable-organizer-concept.png",
    measurements: "Track channel width, adhesive/contact surface, and cable clearance.",
    description: "ForgeTech utility item with simple production notes and no realm variants by default.",
    notes: "Keep simple and repeatable.",
    linkedStlId: "STL-P2-PRIMARY",
  },
];


export const seedVariants: ProductVariant[] = [
  {
    id: "VAR-P1-MIDGARD",
    productId: "P1",
    realm: "Midgard",
    name: "Controller Stand - Midgard",
    productImagePath: "/assets/products/controller-stand.png",
    conceptImagePath: "/assets/concepts/controller-stand-concept.png",
    stlId: "STL-P1-PRIMARY",
    conceptId: "CON-P1-PRIMARY",
    filamentId: "F2",
    priceModifier: 4,
    estimatedFilamentGrams: 118,
    estimatedPrintHours: 6.8,
    isActive: true,
    notes: "Earth-forged baseline realm variant. Use as the neutral product listing example.",
  },
  {
    id: "VAR-P1-SVARTALFHEIM",
    productId: "P1",
    realm: "Svartalfheim",
    name: "Controller Stand - Svartalfheim",
    productImagePath: "/assets/products/controller-stand.png",
    conceptImagePath: "/assets/concepts/controller-stand-concept.png",
    stlId: "STL-P1-PRIMARY",
    conceptId: "CON-P1-PRIMARY",
    filamentId: "F1",
    priceModifier: 6,
    estimatedFilamentGrams: 122,
    estimatedPrintHours: 7.1,
    isActive: true,
    notes: "Dwarven-tech treatment: darker finish, forged plates, refined industrial accents.",
  },
];

export const seedCollections: CollectionRecord[] = [
  { id: "C1", name: "ForgeTech Lane", line: "ForgeTech", description: "Core desk line", heroProductId: "P1" },
];

export const seedReleases: ReleaseRecord[] = [
  { id: "R1", name: "Wave 01 Deskworks", wave: "Wave 01", targetDate: "2025-06-01", status: "Scheduled", productIds: ["P2"], notes: "Utility launch" },
];

export const seedOrders: OrderRecord[] = [
  { id: "ORD-1001", productId: "P1", filamentId: "F1", materialGrams: 110, customer: "Rune Workshop", contact: "", quantity: 2, dueDate: "May 26, 2026", status: "Printing", priority: "High", paid: true, tracking: "", printerId: "PR1", estimatedPrintHours: 6.5, laborHours: 1, laborRate: 18, machineWatts: 280, electricityRate: 0.203, packagingCost: 1.25, otherCost: 0.5, quotedPrice: 64, notes: "Batch for featured display.", materialConsumed: false },
  { id: "ORD-1002", productId: "P2", filamentId: "F2", materialGrams: 22, customer: "Shelf & Steel", contact: "", quantity: 4, dueDate: "May 28, 2026", status: "Queued", priority: "Normal", paid: false, tracking: "", printerId: undefined, estimatedPrintHours: 1.4, laborHours: 0.5, laborRate: 18, machineWatts: 250, electricityRate: 0.203, packagingCost: 1.25, otherCost: 0.5, quotedPrice: 48, notes: "Utility reorder.", materialConsumed: false },
];

export const seedFilament: FilamentRecord[] = [
  { id: "F1", brand: "Polymaker", material: "PLA+", colorName: "Obsidian Black", colorFamily: "Black", gramsAvailable: 860, reorderPointGrams: 250, spoolPrice: 24.99, spoolWeightGrams: 1000, notes: "Main base color" },
  { id: "F2", brand: "Overture", material: "PLA", colorName: "Gunmetal Gray", colorFamily: "Gray", gramsAvailable: 520, reorderPointGrams: 200, spoolPrice: 22.99, spoolWeightGrams: 1000, notes: "Tech accent color" },
  { id: "F3", brand: "Elegoo", material: "PLA", colorName: "Bone White", colorFamily: "White", gramsAvailable: 340, reorderPointGrams: 150, spoolPrice: 18.99, spoolWeightGrams: 1000, notes: "Paint-ready base" },
];

export const seedPrinters: PrinterRecord[] = [
  { id: "PR1", name: "Neptune 4 Max", model: "Elegoo Neptune 4 Max", status: "Printing", buildVolume: "420 x 420 x 480", watts: 280, activeJob: "Controller Stand", notes: "Large format" },
  { id: "PR2", name: "Kobra 3 Combo", model: "Anycubic Kobra 3 Combo", status: "Available", buildVolume: "250 x 250 x 260", watts: 220, activeJob: "", notes: "Fast support printer" },
];
