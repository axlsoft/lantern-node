import { create } from "@bufbuild/protobuf";
import { AttributionMode } from "./generated/lantern/v1/common_pb.js";
import { CoverageSchema } from "./generated/lantern/v1/coverage_pb.js";
import { resolveOptions } from "./config.js";
import type { LanternOptionsInput } from "./config.js";
import { withTestScope, currentTestId } from "./context.js";
import type { LanternContext } from "./context.js";
import { CoverageManager } from "./coverage-manager.js";
import { EventQueue } from "./event-queue.js";
import { Flusher } from "./flusher.js";
import { detectRepoRoot, detectGitBranch, detectCommitSha } from "./git.js";

export interface ScopeHandle {
  end(): Promise<void>;
}

export interface LanternMetrics {
  queueLength: number;
  scopesActive: number;
}

export class LanternSDK {
  private readonly options;
  private readonly coverageManager: CoverageManager;
  private readonly queue: EventQueue;
  private readonly flusher: Flusher;
  private activeScopes = 0;
  private started = false;

  readonly runId: string;
  readonly commitSha: string;
  readonly branch: string;
  readonly repoRoot: string;

  constructor(input: Partial<LanternOptionsInput> = {}) {
    this.options = resolveOptions(input);
    this.runId = crypto.randomUUID();
    this.commitSha = detectCommitSha();
    this.branch = detectGitBranch();
    this.repoRoot = this.options.repoRoot ?? detectRepoRoot();

    this.coverageManager = new CoverageManager(this.repoRoot, this.options.sourceMapsEnabled);
    this.queue = new EventQueue(this.options.bufferCapacity, this.options.dropPolicy);
    this.flusher = new Flusher({
      queue: this.queue,
      options: this.options,
      runId: this.runId,
      commitSha: this.commitSha,
      branch: this.branch,
    });
  }

  async start(): Promise<void> {
    if (!this.options.enabled || this.started) return;
    await this.coverageManager.start();
    this.flusher.start();
    this.started = true;
    this.registerShutdownHooks();
  }

  async shutdown(): Promise<void> {
    if (!this.started) return;
    this.flusher.stop();
    await this.coverageManager.stop();
    await this.flusher.flush();
    this.started = false;
  }

  /**
   * Begin a test scope: snapshot coverage baseline, run fn, snapshot again,
   * emit delta as coverage events. Returns a handle that ends the scope.
   *
   * For request-driven attribution (traceparent header), use the adapter
   * middleware instead of calling this directly.
   */
  async beginTestScope(context: LanternContext): Promise<ScopeHandle> {
    this.activeScopes++;
    // Snapshot to reset counters for this scope's baseline.
    if (this.options.enabled) await this.coverageManager.snapshot();

    return {
      end: async () => {
        try {
          if (this.options.enabled) {
            const ranges = await this.coverageManager.snapshot();
            const testId = currentTestId() ?? context.testId;
            this.emitRanges(ranges, testId);
          }
        } finally {
          this.activeScopes--;
        }
      },
    };
  }

  /**
   * Run fn inside a named test scope. Coverage for the duration of fn is
   * attributed to context.testId.
   */
  async runInScope<T>(context: LanternContext, fn: () => Promise<T>): Promise<T> {
    return withTestScope(context, async () => {
      const handle = await this.beginTestScope(context);
      try {
        return await fn();
      } finally {
        await handle.end();
      }
    });
  }

  metrics(): LanternMetrics {
    return {
      queueLength: this.queue.length,
      scopesActive: this.activeScopes,
    };
  }

  private emitRanges(
    ranges: import("./coverage-manager.js").CoverageRange[],
    testId: string
  ): void {
    for (const r of ranges) {
      const event = create(CoverageSchema, {
        filePath: r.filePath,
        lineStart: r.lineStart,
        lineEnd: r.lineEnd,
        hitCount: r.hitCount,
        testId,
        attributionMode: AttributionMode.SERIALIZED,
      });
      this.queue.enqueue(event);
    }
    if (this.queue.length >= this.options.batchSize) {
      void this.flusher.flush();
    }
  }

  private registerShutdownHooks(): void {
    const flush = () => {
      this.flusher.stop();
      void this.flusher.flush().then(() => {
        // Re-raise after flush so the process can exit normally.
        process.exit(0);
      });
    };
    process.once("SIGINT", flush);
    process.once("SIGTERM", flush);
    process.once("beforeExit", () => {
      void this.flusher.flush();
    });
  }
}
