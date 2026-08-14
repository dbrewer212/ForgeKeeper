export const reconciliationPolicy = {
  authoritativeBase: "foundry-mesh-core",
  preserve: ["mesh", "bastion", "watcher", "production-steward", "commissioning", "materials-0.2", "generation-providers"],
  restore: ["design-projects", "production-jobs", "production-batches", "forgepack-history", "workspace-persistence"],
  retire: ["catalog-navigation", "orders-navigation"],
} as const;
