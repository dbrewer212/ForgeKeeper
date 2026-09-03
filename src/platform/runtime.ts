export type FoundryRuntimePlatform = "android" | "ios" | "desktop" | "web";

export function getFoundryRuntimePlatform(): FoundryRuntimePlatform {
  if (typeof navigator === "undefined") return "web";

  const userAgent = navigator.userAgent ?? "";
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";

  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  return isTauri ? "desktop" : "web";
}

export function isFoundryMobileRuntime(): boolean {
  const platform = getFoundryRuntimePlatform();
  return platform === "android" || platform === "ios";
}

export function isFoundryDesktopRuntime(): boolean {
  return getFoundryRuntimePlatform() === "desktop";
}
