import type { PlannedFilament, PlannedPrototype, DesignPlanningRecord, RealmMaterialReference } from "../types/planning";

export const seedPrototypes: PlannedPrototype[] = [
  {
    id: "P-001",
    designName: "Svartalfheim Headset Stand",
    family: "Modular Desk Chassis",
    collection: "ForgeTech",
    tier: "Hero",
    realm: "Svartalfheim",
    status: "Active Idea",
    priority: "High",
    printerFit: "Neptune + Kobra",
    nextStep: "Define part breakdown and silhouette notes",
    notes: "Primary pilot concept validating base + pillar + cradle + side panel system."
  },
  {
    id: "P-002",
    designName: "Dual Controller Base Add-on",
    family: "Modular Desk Chassis",
    collection: "ForgeTech",
    tier: "Hero",
    realm: "Svartalfheim / Universal",
    status: "Active Idea",
    priority: "High",
    printerFit: "Kobra",
    nextStep: "Choose mount style and attachment method",
    notes: "Validates base-mounted gamer accessory expansion. Should support at least two controllers."
  },
  {
    id: "P-003",
    designName: "Alternate Top Cradle Set",
    family: "Modular Desk Chassis",
    collection: "ForgeTech",
    tier: "Hero",
    realm: "Universal",
    status: "Active Idea",
    priority: "Medium",
    printerFit: "Kobra",
    nextStep: "Define 2-3 top module styles",
    notes: "Validates functional modular top swapping without redesigning the chassis."
  },
  {
    id: "P-004",
    designName: "Yggdrasil Pillar Conversion",
    family: "Modular Desk Chassis",
    collection: "Relics of the Nine Realms",
    tier: "Hero",
    realm: "Vanaheim / Realms",
    status: "Active Idea",
    priority: "High",
    printerFit: "Neptune + Kobra",
    nextStep: "Map coin mount points and branch silhouette",
    notes: "Turns the pillar into a symbolic display spine and connects chassis to the relic line."
  },
  {
    id: "P-005",
    designName: "Helheim Coin Medallion",
    family: "Relic Series",
    collection: "Relics of the Nine Realms",
    tier: "Hero",
    realm: "Helheim",
    status: "In Progress",
    priority: "High",
    printerFit: "Kobra",
    nextStep: "Refine front/reverse and display method",
    notes: "One of the clearest developed coin concepts."
  },
  {
    id: "P-006",
    designName: "Vanaheim Offering Tray",
    family: "Relic Series",
    collection: "Relics of the Nine Realms",
    tier: "Hero",
    realm: "Vanaheim",
    status: "Active Idea",
    priority: "Medium",
    printerFit: "Neptune",
    nextStep: "Define border language and tray proportions",
    notes: "Good Wiccan-friendly altar-object lane fit."
  }
];

export const seedRealmMaterials: RealmMaterialReference[] = [
  { realm: "Midgard", baseCandidates: ["Marble", "Cement Grey", "Fossil Gradient", "Wood-white Oak"], whyTheyFit: "Rugged shrine utility, weathered stone, iron-bound practicality, and old-world resilience.", finishDirection: "Black wash, cold gray drybrush, muted steel details, restrained rune accents.", batchGroup: "Stone batch" },
  { realm: "Svartalfheim", baseCandidates: ["Cement Grey", "Marble", "Ebony Wood", "Wood-black Walnut"], whyTheyFit: "Dwarven engineered forge-tech; darker bases support plated metal, rivets, brass, soot, and forge wear.", finishDirection: "Black wash, gunmetal/brass accents, edge wear, controlled metallic highlights.", batchGroup: "Forge / dark batch" },
  { realm: "Alfheim", baseCandidates: ["Marble", "Yellow Feldspar Rock", "Yellow Pearwood"], whyTheyFit: "Luminous ceremonial elegance; lighter bases support refined surfaces and cleaner paint treatment.", finishDirection: "Softer wash, pale metallic accents, cleaner highlights, subtle luminous detailing.", batchGroup: "Refined / light batch" },
  { realm: "Vanaheim", baseCandidates: ["Bamboo Wood", "Walnut Wood", "Grain Wood", "Yellow Pearwood", "Green Schist"], whyTheyFit: "Living root-woven mystic energy; wood bases and organic stone support rooted, reclaimed, natural forms.", finishDirection: "Black wash, moss/verdigris accents, root-brown highlights, selective green aging.", batchGroup: "Wood / organic batch" },
  { realm: "Asgard", baseCandidates: ["Marble", "Yellow Feldspar Rock", "Wood-white Oak"], whyTheyFit: "Elite divine mastercraft; brighter, cleaner bases support ceremonial refinement.", finishDirection: "Light wash, gold/silver accents, polished edge emphasis, less grime overall.", batchGroup: "Refined / light batch" },
  { realm: "Jotunheim", baseCandidates: ["Marble", "Cement Grey", "Sedimentary/Fossil-style stone tones"], whyTheyFit: "Monumental ancient solemnity; strong stone-family materials fit giant-scale, old, quiet massing.", finishDirection: "Heavier shadow wash, broad drybrush, restrained accents, old-stone feel.", batchGroup: "Stone batch" },
  { realm: "Muspelheim", baseCandidates: ["Brick Red", "Red Limestone", "Rainbow Rock"], whyTheyFit: "Crucible-forged volcanic severity; heat-forward materials already suggest ember and fracture energy.", finishDirection: "Black wash, ember orange/red accents, scorched recesses, sharp heat highlights.", batchGroup: "Heat batch" },
  { realm: "Niflheim", baseCandidates: ["Marble", "Cement Grey", "Fossil Gradient"], whyTheyFit: "Frost-veiled haunted stillness; cooler stone bases support icy finishing.", finishDirection: "Black wash, blue-gray cold highlights, frost drybrush, muted metallics.", batchGroup: "Stone batch" },
  { realm: "Helheim", baseCandidates: ["Marble", "Cement Grey", "Fossil Gradient"], whyTheyFit: "Dead severe funereal cold; stark, frozen, punitive panel language.", finishDirection: "Deep black wash, desaturated cold highlights, crack emphasis, minimal bright accents.", batchGroup: "Stone batch" }
];

export const seedPlannedFilament: PlannedFilament[] = [
  { id: "PF-001", name: "Marble", brand: "Amolen", materialFamily: "Stone", realms: ["Midgard", "Alfheim", "Asgard", "Jotunheim", "Niflheim", "Helheim", "Svartalfheim"], batchGroup: "Stone batch", status: "Need to Order", priority: "High", finishDirection: "General stone base for cold, ancient, ceremonial, and shrine designs.", notes: "Starter stone-family material." },
  { id: "PF-002", name: "Cement Grey", brand: "Amolen", materialFamily: "Stone", realms: ["Midgard", "Svartalfheim", "Jotunheim", "Niflheim", "Helheim"], batchGroup: "Stone batch / Forge dark batch", status: "Need to Order", priority: "High", finishDirection: "Excellent black wash and metallic drybrush base.", notes: "High priority for Svartalfheim and rugged designs." },
  { id: "PF-003", name: "Fossil Gradient", brand: "Amolen", materialFamily: "Stone", realms: ["Midgard", "Jotunheim", "Niflheim", "Helheim"], batchGroup: "Stone batch", status: "Need to Order", priority: "Medium", finishDirection: "Ancient stone, cold relic, and weathered shrine feel.", notes: "Useful for realm coins, plaques, and altar pieces." },
  { id: "PF-004", name: "Bamboo Wood", brand: "Amolen", materialFamily: "Wood", realms: ["Vanaheim"], batchGroup: "Wood / organic batch", status: "Need to Order", priority: "High", finishDirection: "Rooted, living, altar-object base.", notes: "Starter organic Vanaheim material." },
  { id: "PF-005", name: "Walnut Wood", brand: "Amolen", materialFamily: "Wood", realms: ["Vanaheim", "Midgard"], batchGroup: "Wood / organic batch", status: "Need to Order", priority: "Medium", finishDirection: "Darker natural base with brown highlights and moss accents.", notes: "Good for Yggdrasil and ritual pieces." },
  { id: "PF-006", name: "Ebony Wood / Wood-black Walnut", brand: "Amolen", materialFamily: "Forge", realms: ["Svartalfheim"], batchGroup: "Forge / dark batch", status: "Need to Order", priority: "High", finishDirection: "Dark forge-tech base; supports brass, gunmetal, soot, and rivets.", notes: "High-value dark base for ForgeTech hero items." },
  { id: "PF-007", name: "Brick Red", brand: "Amolen", materialFamily: "Heat", realms: ["Muspelheim"], batchGroup: "Heat batch", status: "Need to Order", priority: "Medium", finishDirection: "Black wash with ember orange/red accents and scorched recesses.", notes: "Muspelheim starter heat-family material." },
  { id: "PF-008", name: "Red Limestone", brand: "Amolen", materialFamily: "Heat", realms: ["Muspelheim"], batchGroup: "Heat batch", status: "Need to Order", priority: "Medium", finishDirection: "Volcanic stone base for harsher heat variants.", notes: "Secondary Muspelheim material." },
  { id: "PF-009", name: "Green Schist", brand: "Amolen", materialFamily: "Wood", realms: ["Vanaheim"], batchGroup: "Wood / organic batch", status: "Need to Order", priority: "Medium", finishDirection: "Mossy green aging and living-stone surfaces.", notes: "Good for Vanaheim accents." }
];

export const seedDesignPlanning: DesignPlanningRecord[] = [
  { id: "PP-001", designFamily: "Modular Desk Chassis", baseDesign: "Headset Stand", collection: "ForgeTech", tier: "Hero", sharedChassis: "Yes", coreFunction: "Headphone / headset display", realmVariantSupport: "Yes", coreParts: "Base, pillar, top cradle", variantParts: "Side panels, crest insert, top cradle variants", baseAddOns: "Controller mounts, side-base expansions", topModuleOptions: "Standard cradle, wolf/crest cradle, premium cradle", attachmentTypes: "Finger-bolt, magnets, slide/tab", bestPrinterFit: "Neptune chassis, Kobra panels/inserts", prototypePriority: "High", notes: "Primary pilot concept" },
  { id: "PP-002", designFamily: "Modular Desk Chassis", baseDesign: "Helmet Holder", collection: "ForgeTech", tier: "Hero", sharedChassis: "Yes", coreFunction: "Display stand for helmets/headwear", realmVariantSupport: "Yes", coreParts: "Base, pillar, top support", variantParts: "Side panels, crest insert, top holder variants", baseAddOns: "Controller mounts, side-base expansions", topModuleOptions: "Helmet crown support, display neck, themed top", attachmentTypes: "Finger-bolt, magnets, slide/tab", bestPrinterFit: "Neptune chassis, Kobra inserts", prototypePriority: "High", notes: "Same family as headset stand" },
  { id: "PP-003", designFamily: "Modular Desk Chassis", baseDesign: "Yggdrasil Pillar Display", collection: "Relics of the Nine Realms", tier: "Hero", sharedChassis: "Yes", coreFunction: "Symbolic centerpiece / display object", realmVariantSupport: "Yes", coreParts: "Base, pillar, world-tree top", variantParts: "Side panels, crest insert, realm ring inserts", baseAddOns: "Side-base relic wings, trays, medallion holders", topModuleOptions: "Branch crown, realm-ring top, hanging medallion top", attachmentTypes: "Finger-bolt, magnets, slide/tab", bestPrinterFit: "Neptune main body, Kobra accents", prototypePriority: "High", notes: "Crosses desk decor and altar/display" },
  { id: "PP-004", designFamily: "Relic Series", baseDesign: "Coin / Medallion Insert", collection: "Relics of the Nine Realms", tier: "Hero", sharedChassis: "No", coreFunction: "Collectible / display insert", realmVariantSupport: "Yes", coreParts: "Main coin body", variantParts: "Realm face, reverse design, stand option", baseAddOns: "Optional display stand", topModuleOptions: "N/A", attachmentTypes: "Standard assembly or single-piece", bestPrinterFit: "Kobra", prototypePriority: "High", notes: "Realm identity lives in full face design" }
];
