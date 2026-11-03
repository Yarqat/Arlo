import { Queue, JobsOptions } from "bullmq";
import { connection } from "./redis";
import { env } from "./env";

export const QUEUE_NAMES = {
  discovery: "discovery",
  research: "research",
  verify: "verify",
  outreach: "outreach", // drafting + sending
  followup: "followup",
  imap: "imap", // mailbox sync
  reply: "reply", // classification + drafting
  maintenance: "maintenance", // revalidation, scheduling sweeps
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const prefix = () => env().BULLMQ_PREFIX;

const queues = new Map<string, Queue>();

export function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection, prefix: prefix() });
    queues.set(name, q);
  }
  return q;
}

export async function enqueue(
  name: QueueName,
  jobName: string,
  data: Record<string, unknown>,
  opts: JobsOptions = {},
) {
  const q = getQueue(name);
  // Deduplicate by the entity the job acts on: while a job for this
  // (queue, jobName, id) is still waiting/active, re-enqueuing is a no-op. This
  // stops the 60s tick from piling thousands of duplicate jobs for the same
  // leads. removeOnComplete/Fail: true clears a finished job immediately so a
  // later, legitimate re-enqueue is still allowed.
  const key = (data.leadId ?? data.messageId ?? data.actionId ?? data.campaignId ?? data.mailboxId) as
    | string
    | undefined;
  const dedup = key
    ? { jobId: `${name}:${jobName}:${key}`, removeOnComplete: true as const, removeOnFail: true as const }
    : {};
  return q.add(jobName, data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 604800, count: 1000 },
    ...dedup,
    ...opts,
  });
}

export const defaultWorkerOpts = () => ({
  connection,
  prefix: prefix(),
  concurrency: 2,
});
