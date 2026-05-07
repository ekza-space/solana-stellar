import { enumKey, enumValue } from "./utils";

export const LICENSE_KIND_LABELS = {
  unknown: "Unknown",
  allRightsReserved: "All rights reserved",
  cc0: "CC0",
  ccBy4: "CC BY 4.0",
  ccBySa4: "CC BY-SA 4.0",
  ccByNc4: "CC BY-NC 4.0",
  ccByNcSa4: "CC BY-NC-SA 4.0",
  mit: "MIT",
  custom: "Custom",
} as const;

export type LicenseKindKey = keyof typeof LICENSE_KIND_LABELS;

export function licenseKind(value?: string | null) {
  const normalized = normalizeLicenseKind(value);
  return enumValue(normalized);
}

export function normalizeLicenseKind(value?: string | null): LicenseKindKey {
  const key = String(value || "")
    .trim()
    .replace(/[\s._-]+/g, "")
    .toLowerCase();

  if (key === "allrightsreserved" || key === "copyright") {
    return "allRightsReserved";
  }
  if (key === "cc0" || key === "creativecommonszero") return "cc0";
  if (key === "ccby4" || key === "ccby40" || key === "ccby") return "ccBy4";
  if (key === "ccbysa4" || key === "ccbysa40" || key === "ccbysa") {
    return "ccBySa4";
  }
  if (key === "ccbync4" || key === "ccbync40" || key === "ccbync") {
    return "ccByNc4";
  }
  if (key === "ccbyncsa4" || key === "ccbyncsa40" || key === "ccbyncsa") {
    return "ccByNcSa4";
  }
  if (key === "mit") return "mit";
  if (key === "custom") return "custom";

  return "unknown";
}

export function licenseKindKey(value: unknown): LicenseKindKey {
  return normalizeLicenseKind(enumKey(value));
}

export function licenseKindLabel(value: unknown): string {
  return LICENSE_KIND_LABELS[licenseKindKey(value)];
}
