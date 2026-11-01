// Canonical business identity + dedupe key. A business is one Lead even if it
// exposes several emails; legitimate branches differ by city.

export function canonicalDomain(websiteOrEmail: string): string | null {
  if (!websiteOrEmail) return null;
  let host = websiteOrEmail.trim().toLowerCase();
  if (host.includes("@")) host = host.split("@")[1] ?? "";
  host = host.replace(/^https?:\/\//, "").replace(/^www\./, "");
  host = host.split("/")[0].split("?")[0].split("#")[0].split(":")[0];
  if (!host || !host.includes(".")) return null;
  // Strip a leading subdomain like "mail." but keep registrable-ish domain.
  const parts = host.split(".");
  // Keep last 2 labels for common TLDs, 3 for known second-level (co.uk etc).
  const twoLevel = new Set(["co", "com", "org", "net", "gov", "ac", "edu"]);
  if (parts.length >= 3 && twoLevel.has(parts[parts.length - 2])) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

export function dedupeKey(input: { website?: string; email?: string; businessName: string; city?: string }): string {
  const domain =
    canonicalDomain(input.website || "") || (input.email ? canonicalDomain(input.email) : null);
  const city = (input.city || "").trim().toLowerCase();
  if (domain) return city ? `${domain}|${city}` : domain;
  // No domain: fall back to normalised name + city (weaker identity).
  const name = input.businessName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `name:${name}|${city}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const ROLE_LOCALPARTS = new Set([
  "info", "sales", "contact", "hello", "admin", "office", "support", "enquiries",
  "enquiry", "mail", "team", "help", "bookings", "booking", "reception", "accounts",
]);

export function classifyEmailType(email: string, hasName: boolean): "PERSONAL" | "ROLE" | "GENERIC" | "UNKNOWN" {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (ROLE_LOCALPARTS.has(local)) return "ROLE";
  if (hasName && /[.]/.test(local)) return "PERSONAL"; // first.last@
  if (hasName) return "PERSONAL";
  return "GENERIC";
}
