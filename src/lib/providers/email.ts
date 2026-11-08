import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { decryptJson } from "@/lib/crypto";
import { Mailbox } from "@prisma/client";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}
export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export function smtpOf(mb: Mailbox): SmtpConfig | null {
  return mb.smtpConfigEnc ? decryptJson<SmtpConfig>(mb.smtpConfigEnc) : null;
}
export function imapOf(mb: Mailbox): ImapConfig | null {
  return mb.imapConfigEnc ? decryptJson<ImapConfig>(mb.imapConfigEnc) : null;
}

function transport(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

export async function testSmtp(cfg: SmtpConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const t = transport(cfg);
    await t.verify();
    t.close();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function testImap(cfg: ImapConfig): Promise<{ ok: boolean; error?: string; folders?: number }> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
    socketTimeout: 20_000,
  });
  try {
    await client.connect();
    const list = await client.list();
    await client.logout();
    return { ok: true, folders: list.length };
  } catch (e) {
    try { await client.close(); } catch {}
    return { ok: false, error: (e as Error).message };
  }
}

export interface SendInput {
  from: string; // "Name <email>"
  replyTo?: string; // route replies to a single monitored address
  to: string;
  subject: string;
  text: string;
  html?: string;
  messageId: string; // we generate and set this for threading
  inReplyTo?: string;
  references?: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; path: string }[];
}

export interface SendResult {
  accepted: boolean;
  providerMessageId: string;
  response: string;
}

export async function sendViaMailbox(mb: Mailbox, input: SendInput): Promise<SendResult> {
  const cfg = smtpOf(mb);
  if (!cfg) throw new Error("Mailbox has no SMTP configuration.");
  const t = transport(cfg);
  try {
    const info = await t.sendMail({
      from: input.from,
      replyTo: input.replyTo,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      messageId: input.messageId,
      inReplyTo: input.inReplyTo,
      references: input.references,
      headers: input.headers,
      attachments: input.attachments,
    });
    const accepted = (info.accepted ?? []).length > 0 && (info.rejected ?? []).length === 0;
    return { accepted, providerMessageId: info.messageId || input.messageId, response: info.response || "" };
  } finally {
    t.close();
  }
}

export function buildMessageId(domain: string): string {
  const rand = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const host = (domain || "agent.yarqat.com").replace(/[^a-z0-9.-]/gi, "");
  return `<${rand}@${host}>`;
}
