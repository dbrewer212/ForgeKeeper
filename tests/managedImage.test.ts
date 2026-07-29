import { describe, expect, it } from "vitest";
import { isDirectImageSource } from "../src/components/assets/ManagedImage";

describe("managed image source detection", () => {
  it("keeps browser-safe image sources in the webview", () => {
    expect(isDirectImageSource("/assets/concepts/emberwhelp.png")).toBe(true);
    expect(isDirectImageSource("https://example.test/emberwhelp.png")).toBe(true);
    expect(isDirectImageSource("data:image/png;base64,AAAA")).toBe(true);
  });

  it("routes native managed-library paths through the desktop reader", () => {
    expect(isDirectImageSource("C:\\ForgekeeperLibrary\\Intake\\concept.png")).toBe(false);
    expect(isDirectImageSource("\\\\workshop\\Foundry\\concept.png")).toBe(false);
  });
});
