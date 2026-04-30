import { create, toBinary } from "@bufbuild/protobuf";
import { CoverageBatchSchema } from "./generated/lantern/v1/coverage_pb.js";
import { ResourceSchema } from "./generated/lantern/v1/common_pb.js";
import type { Coverage } from "./generated/lantern/v1/coverage_pb.js";
import type { EventQueue } from "./event-queue.js";
import type { LanternOptions } from "./config.js";

const SDK_NAME = "lantern-node";
const SDK_VERSION = "0.0.1";
const SCHEMA_VERSION = "1";

export interface FlusherDeps {
  queue: EventQueue;
  options: LanternOptions;
  runId: string;
  commitSha: string;
  branch: string;
}

export class Flusher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private readonly endpoint: string;

  constructor(private readonly deps: FlusherDeps) {
    this.endpoint = `${deps.options.collectorEndpoint.replace(/\/$/, "")}/v1/coverage`;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, this.deps.options.flushIntervalMs);
    // Allow the process to exit even if the timer is still active.
    if (this.timer.unref) this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Flush all pending events, retrying once on transient failure. */
  async flush(): Promise<void> {
    if (this.flushing || this.deps.queue.isEmpty) return;
    this.flushing = true;
    try {
      await this.flushBatches();
    } finally {
      this.flushing = false;
    }
  }

  private async flushBatches(): Promise<void> {
    const { queue, options } = this.deps;
    while (!queue.isEmpty) {
      const events = queue.drain(options.batchSize);
      if (events.length === 0) break;
      await this.postWithRetry(events);
    }
  }

  private async postWithRetry(events: Coverage[]): Promise<void> {
    const body = this.encode(events);
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.post(body);
        return;
      } catch (err) {
        lastErr = err;
        if (attempt < 2) {
          // Exponential backoff with jitter: 200ms, 400ms + up to 200ms random
          const delay = (200 << attempt) + Math.random() * 200;
          await sleep(delay);
        }
      }
    }
    // Drop the batch after 3 attempts — do not re-enqueue to avoid thrash.
    console.error("[lantern] failed to flush batch after 3 attempts:", lastErr);
  }

  private async post(body: Uint8Array): Promise<void> {
    const { options } = this.deps;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.httpTimeoutMs);
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-protobuf",
          Authorization: `Bearer ${options.apiKey}`,
          "User-Agent": `${SDK_NAME}/${SDK_VERSION}`,
        },
        body,
        signal: controller.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`collector responded ${res.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private encode(events: Coverage[]): Uint8Array {
    const { options, runId, commitSha, branch } = this.deps;
    const batch = create(CoverageBatchSchema, {
      batchId: crypto.randomUUID(),
      resource: create(ResourceSchema, {
        projectId: options.projectId,
        runId,
        commitSha,
        branch,
        sdkName: SDK_NAME,
        sdkVersion: SDK_VERSION,
        schemaVersion: SCHEMA_VERSION,
      }),
      events,
    });
    return toBinary(CoverageBatchSchema, batch);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
