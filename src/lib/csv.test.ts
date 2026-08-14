import { describe, expect, it } from "vitest";
import { csvText, toCsvValue } from "./csv";

describe("CSV export", () => {
  it("escapes quotes and commas for spreadsheet-safe output", () => {
    expect(toCsvValue('Shelf A, 2" rack')).toBe('"Shelf A, 2"" rack"');
  });

  it("creates a header and Windows-compatible row endings", () => {
    const result = csvText([
      { brand: "Elegoo", colorName: "Black" },
      { brand: "Overture", colorName: "Space Gray" },
    ]);

    expect(result).toBe(
      '"brand","colorName"\r\n"Elegoo","Black"\r\n"Overture","Space Gray"',
    );
  });
});
