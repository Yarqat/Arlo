// Minimal correct CSV parser: handles quoted fields, embedded commas/newlines,
// and escaped quotes ("").

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const ALIASES: Record<string, string[]> = {
  businessName: ["business", "business name", "company", "company name", "name", "organisation", "organization"],
  website: ["website", "url", "domain", "web", "site"],
  email: ["email", "e-mail", "email address", "contact email"],
  contactName: ["contact", "contact name", "person", "full name", "first name"],
  role: ["role", "title", "position", "job title"],
  phone: ["phone", "telephone", "tel", "mobile", "phone number"],
  city: ["city", "town"],
  region: ["region", "state", "county", "province"],
  country: ["country"],
  category: ["category", "industry", "type", "sector"],
  address: ["address", "street", "location"],
};

export function autoMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const norm = headers.map((h) => h.trim().toLowerCase());
  for (const [field, aliases] of Object.entries(ALIASES)) {
    const idx = norm.findIndex((h) => aliases.includes(h));
    if (idx !== -1) map[field] = idx;
  }
  return map;
}
