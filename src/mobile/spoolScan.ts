export type ScanFields = { brand: string; material: string; color: string; diameter_mm: number | null; nominal_grams: number | null };
export const blankFields = (): ScanFields => ({ brand: "", material: "", color: "", diameter_mm: null, nominal_grams: null });
export const materials = ["PLA", "PLA+", "PETG", "ABS", "ASA", "TPU", "Nylon", "PC", "Other"];

export function extractLabel(raw: string): Partial<ScanFields> {
  const text = raw.slice(0, 4000).replace(/\r/g, "");
  const fields: Partial<ScanFields> = {};
  const brand = text.match(/\b(Bambu\s*Lab|Polymaker|Prusament|SUNLU|eSUN|ELEGOO|Anycubic|Creality|Overture|Hatchbox|JAYO|Inland|Duramic|Voxelab)\b/i);
  if (brand) fields.brand = brand[0];
  const material = text.match(/\b(PLA\s*(?:\+|PLUS)|PETG|ABS|ASA|TPU|NYLON|PA6|PA12|PLA|PC)(?=\s|$|[,;:])/i);
  if (material) {
    const value = material[0].toUpperCase().replace(/\s/g, "").replace("PLUS", "+");
    fields.material = /^(NYLON|PA6|PA12)$/.test(value) ? "Nylon" : value;
  }
  const color = text.match(/(?:colou?r\s*[:：]\s*)([^\n]{1,60})/i) ?? text.match(/\b((?:matte |silk )?(?:black|white|red|blue|green|orange|yellow|purple|silver|gray|grey|gold|transparent|natural))\b/i);
  if (color) fields.color = color[1].trim();
  const diameter = text.match(/\b(1[.,]75|2[.,]85|3[.,]00)\s*mm\b/i);
  if (diameter) fields.diameter_mm = Number(diameter[1].replace(",", "."));
  const weight = text.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i);
  if (weight) {
    const grams = Number(weight[1].replace(",", ".")) * (weight[2].toLowerCase() === "kg" ? 1000 : 1);
    if (grams >= 1 && grams <= 100000) fields.nominal_grams = grams;
  }
  return fields;
}

export function validGtin(value: string) {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false;
  const digits = [...value].map(Number); const check = digits.pop()!;
  return (10 - digits.reverse().reduce((sum, digit, index) => sum + digit * (index % 2 ? 1 : 3), 0) % 10) % 10 === check;
}

export function scanIdentity(value: string) {
  const text = value.trim();
  if (/^FF-SP-[A-Z0-9-]{4,60}$/i.test(text)) return { kind: "spool" as const, value: text.toUpperCase() };
  if (validGtin(text)) return { kind: "product" as const, value: text };
  return { kind: "unknown" as const, value: text.slice(0, 256) };
}

export function complete(fields: ScanFields) {
  return Boolean(fields.brand.trim() && fields.color.trim() && materials.includes(fields.material)
    && fields.diameter_mm !== null && fields.diameter_mm >= .5 && fields.diameter_mm <= 5
    && fields.nominal_grams !== null && fields.nominal_grams > 0 && fields.nominal_grams <= 100000);
}
