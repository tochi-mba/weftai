function stripControls(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    out += code < 32 || code === 127 ? " " : ch;
  }
  return out;
}

/**
 * Labels and property values come from application data and land in model-facing text. Newlines
 * and control characters are stripped so a value cannot forge a step header; long values are cut
 * with an ellipsis (the exact original length is not claimed).
 */
export function sanitizeLabel(text: string, maxChars = 120): string {
  const cleaned = stripControls(text).replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return "(unnamed)";
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(1, maxChars - 1))}…`;
}

export function formatProperty(value: unknown): string {
  if (value === undefined || value === null) return "not recorded";
  if (typeof value === "string") return sanitizeLabel(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  try {
    return sanitizeLabel(JSON.stringify(value));
  } catch {
    return "not recorded";
  }
}
