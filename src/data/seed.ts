import { seedCanonRecords as baseSeedCanonRecords } from "./seed-base";
import { canonPreloadRecords } from "./canonPreload";

export {
  defaultSettings,
  defaultControlCenter,
  seedLibraryAssets,
  seedProducts,
  seedStls,
  seedConcepts,
  seedVariants,
  seedCollections,
  seedReleases,
  legacySeedOrders,
  legacySeedFilament,
  seedOrders,
  seedFilamentProfiles,
  seedFilament,
  seedPrinters,
} from "./seed-base";

export const seedCanonRecords = [...baseSeedCanonRecords, ...canonPreloadRecords];
