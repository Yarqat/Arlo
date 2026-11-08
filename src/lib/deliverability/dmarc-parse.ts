// Parse DMARC aggregate reports (RFC 7489). Reports arrive as email attachments,
// gzip- or zip-compressed XML. Dependency-free: zlib for decompression and a
// tolerant reader for the fixed report schema.
import zlib from "node:zlib";

export type DmarcRow = {
  sourceIp: string;
  count: number;
  dkim: string; // policy-evaluated (alignment) result: pass | fail
  spf: string;
  disposition: string; // none | quarantine | reject
  headerFrom: string;
};

export type ParsedDmarc = {
  reportId: string;
  orgName: string;
  domain: string;
  begin: number; // unix seconds
  end: number;
  policyP: string; // published policy
  rows: DmarcRow[];
};

// Extract the first (usually only) file from a ZIP by reading its central
// directory — robust against the streamed data-descriptor case that trips up
// naive local-header parsing.
function unzipFirst(buf: Buffer): Buffer | null {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cdOffset) !== 0x02014b50) return null;
  const method = buf.readUInt16LE(cdOffset + 10);
  const compSize = buf.readUInt32LE(cdOffset + 20);
  const localOffset = buf.readUInt32LE(cdOffset + 42);
  if (buf.readUInt32LE(localOffset) !== 0x04034b50) return null;
  const lNameLen = buf.readUInt16LE(localOffset + 26);
  const lExtraLen = buf.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + lNameLen + lExtraLen;
  const data = buf.subarray(dataStart, dataStart + compSize);
  if (method === 0) return Buffer.from(data);
  if (method === 8) return zlib.inflateRawSync(data);
  return null;
}

export function decompress(filename: string, contentType: string, buf: Buffer): Buffer | null {
  const name = (filename || "").toLowerCase();
  const ct = (contentType || "").toLowerCase();
  try {
    if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) return zlib.gunzipSync(buf);
    if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) return unzipFirst(buf);
    if (name.endsWith(".gz") || ct.includes("gzip")) return zlib.gunzipSync(buf);
    if (name.endsWith(".zip") || ct.includes("zip")) return unzipFirst(buf);
    if (name.endsWith(".xml") || ct.includes("xml")) return buf;
    const head = buf.subarray(0, 200).toString("utf8");
    if (head.includes("<?xml") || head.includes("<feedback")) return buf;
  } catch {
    return null;
  }
  return null;
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1].trim() : "";
}
function block(xml: string, name: string): string {
  return tag(xml, name);
}

export function parseDmarcXml(xml: string): ParsedDmarc | null {
  if (!/<feedback[\s>]/i.test(xml)) return null;
  const meta = block(xml, "report_metadata");
  const policy = block(xml, "policy_published");
  const reportId = tag(meta, "report_id") || tag(xml, "report_id");
  if (!reportId) return null;

  const rows: DmarcRow[] = [];
  const recordRe = /<record[^>]*>([\s\S]*?)<\/record>/gi;
  let m: RegExpExecArray | null;
  while ((m = recordRe.exec(xml))) {
    const rec = m[1];
    const row = block(rec, "row");
    const pe = block(rec, "policy_evaluated");
    const ids = block(rec, "identifiers");
    rows.push({
      sourceIp: tag(row, "source_ip"),
      count: parseInt(tag(row, "count") || "0", 10) || 0,
      dkim: (tag(pe, "dkim") || "").toLowerCase(),
      spf: (tag(pe, "spf") || "").toLowerCase(),
      disposition: (tag(pe, "disposition") || "").toLowerCase(),
      headerFrom: tag(ids, "header_from"),
    });
  }

  return {
    reportId,
    orgName: tag(meta, "org_name"),
    domain: tag(policy, "domain"),
    begin: parseInt(tag(meta, "begin") || "0", 10) || 0,
    end: parseInt(tag(meta, "end") || "0", 10) || 0,
    policyP: (tag(policy, "p") || "").toLowerCase(),
    rows,
  };
}
