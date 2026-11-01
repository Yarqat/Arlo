import { describe, it, expect } from "vitest";
import { canonicalDomain, dedupeKey, classifyEmailType, normalizeEmail } from "@/lib/dedup";
import { parseCsv, autoMap } from "@/lib/csv";
import { classifyBounce } from "@/lib/pipeline/imap";
import { safeFetch, UnsafeUrlError } from "@/lib/net/safe-fetch";
import { scrubOutreach } from "@/lib/pipeline/outreach";

describe("canonical domain + dedupe", () => {
  it("normalises domains", () => {
    expect(canonicalDomain("https://www.Acme.com/contact")).toBe("acme.com");
    expect(canonicalDomain("john@mail.acme.co.uk")).toBe("acme.co.uk");
    expect(canonicalDomain("")).toBeNull();
  });
  it("keeps branches distinct by city but same business one key", () => {
    const a = dedupeKey({ website: "acme.com", businessName: "Acme", city: "London" });
    const b = dedupeKey({ email: "info@acme.com", businessName: "Acme Ltd", city: "London" });
    const c = dedupeKey({ website: "acme.com", businessName: "Acme", city: "Leeds" });
    expect(a).toBe(b); // same domain + city => one lead regardless of email/name
    expect(a).not.toBe(c); // different city => distinct branch
  });
  it("classifies role vs personal emails", () => {
    expect(classifyEmailType("info@x.com", false)).toBe("ROLE");
    expect(classifyEmailType("jane.doe@x.com", true)).toBe("PERSONAL");
    expect(normalizeEmail("  A@B.COM ")).toBe("a@b.com");
  });
});

describe("csv parser", () => {
  it("handles quotes, commas and newlines", () => {
    const rows = parseCsv('name,website\n"Acme, Inc.","acme.com"\n"O""Brien Ltd",obrien.ie\n');
    expect(rows.length).toBe(3);
    expect(rows[1][0]).toBe("Acme, Inc.");
    expect(rows[2][0]).toBe('O"Brien Ltd');
  });
  it("auto-maps common headers", () => {
    const map = autoMap(["Company Name", "URL", "Email Address", "City"]);
    expect(map.businessName).toBe(0);
    expect(map.website).toBe(1);
    expect(map.email).toBe(2);
    expect(map.city).toBe(3);
  });
});

describe("bounce classifier", () => {
  it("treats 5.x.x as permanent", () => {
    const r = classifyBounce("Final-Recipient: rfc822; bob@x.com\nStatus: 5.1.1\nUser unknown");
    expect(r.permanent).toBe(true);
    expect(r.email).toBe("bob@x.com");
  });
  it("treats 4.x.x / greylist as temporary", () => {
    const r = classifyBounce("Final-Recipient: rfc822; bob@x.com\nStatus: 4.2.2\nMailbox full, try again later");
    expect(r.permanent).toBe(false);
  });
  it("does not mark a policy/greylist block as permanent", () => {
    const r = classifyBounce("450 greylisted, please try again (temporary)");
    expect(r.permanent).toBe(false);
  });
});

describe("ssrf guard", () => {
  it("blocks localhost", async () => {
    await expect(safeFetch("http://localhost/")).rejects.toBeInstanceOf(UnsafeUrlError);
  });
  it("blocks cloud metadata ip", async () => {
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(UnsafeUrlError);
  });
  it("blocks private ranges and non-http", async () => {
    await expect(safeFetch("http://10.0.0.5/")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(safeFetch("file:///etc/passwd")).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});

describe("outreach scrubber", () => {
  it("flags prices and invented claims", () => {
    expect(scrubOutreach("We can do it for $500").clean).toBe(false);
    expect(scrubOutreach("20% discount this week").clean).toBe(false);
    expect(scrubOutreach("I noticed your contact form is broken.").clean).toBe(true);
  });
});
