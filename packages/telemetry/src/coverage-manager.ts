import { Session } from "node:inspector/promises";
import { fileURLToPath } from "node:url";
import { relative } from "node:path";
import { mapToSource } from "./source-map.js";

export interface CoverageRange {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  hitCount: number;
}

interface ScriptMeta {
  url: string;
  source: string;
  /** Precomputed offset-to-line mapping (sorted offset list, 0-indexed lines) */
  lineOffsets: number[];
}

export class CoverageManager {
  private session: Session | null = null;
  private scriptMeta = new Map<string, ScriptMeta>();
  private enabled = false;

  constructor(
    private readonly repoRoot: string,
    private readonly sourceMapsEnabled: boolean
  ) {}

  /**
   * Start the inspector session and enable precise V8 coverage.
   * Must be called before any application code runs to get accurate results.
   */
  async start(): Promise<void> {
    if (this.enabled) return;

    this.session = new Session();
    this.session.connect();

    // Cache script source so we can convert offsets to line numbers.
    this.session.on("Debugger.scriptParsed", (msg) => {
      const { scriptId, url, scriptLanguage } = msg.params as {
        scriptId: string;
        url: string;
        scriptLanguage?: string;
      };
      if (scriptLanguage === "WebAssembly") return;
      if (!url || url.startsWith("node:") || url.includes("node_modules")) return;

      this.session!.post("Debugger.getScriptSource", { scriptId })
        .then((result) => {
          const source = (result as { scriptSource: string }).scriptSource;
          this.scriptMeta.set(scriptId, {
            url,
            source,
            lineOffsets: buildLineOffsets(source),
          });
        })
        .catch(() => {
          /* best-effort */
        });
    });

    await this.session.post("Debugger.enable");
    await this.session.post("Profiler.enable");
    await this.session.post("Profiler.startPreciseCoverage", {
      callCount: true,
      detailed: true,
    });

    this.enabled = true;
  }

  async stop(): Promise<void> {
    if (!this.session || !this.enabled) return;
    await this.session.post("Profiler.stopPreciseCoverage");
    await this.session.post("Profiler.disable");
    await this.session.post("Debugger.disable");
    this.session.disconnect();
    this.session = null;
    this.enabled = false;
  }

  /**
   * Capture a snapshot and reset V8's internal counters.
   * In Node 20+, takePreciseCoverage resets counters after each call.
   * Returns coverage ranges for the period since the last snapshot.
   */
  async snapshot(): Promise<CoverageRange[]> {
    if (!this.session || !this.enabled) return [];

    const result = (await this.session.post("Profiler.takePreciseCoverage")) as {
      result: Array<{
        scriptId: string;
        url: string;
        functions: Array<{
          functionName: string;
          isBlockCoverage: boolean;
          ranges: Array<{ startOffset: number; endOffset: number; count: number }>;
        }>;
      }>;
    };

    return this.toRanges(result.result);
  }

  private toRanges(
    scripts: Array<{
      scriptId: string;
      url: string;
      functions: Array<{
        ranges: Array<{ startOffset: number; endOffset: number; count: number }>;
      }>;
    }>
  ): CoverageRange[] {
    const out: CoverageRange[] = [];

    for (const script of scripts) {
      const meta = this.scriptMeta.get(script.scriptId);
      if (!meta) continue;

      const jsPath = urlToFilePath(meta.url);
      if (!jsPath) continue;

      for (const fn of script.functions) {
        for (const range of fn.ranges) {
          if (range.count === 0) continue;

          const jsLineStart = offsetToLine(meta.lineOffsets, range.startOffset);
          const jsLineEnd = offsetToLine(meta.lineOffsets, range.endOffset - 1);

          let filePath: string;
          let lineStart = jsLineStart;
          let lineEnd = jsLineEnd;

          if (this.sourceMapsEnabled) {
            const mappedStart = mapToSource(jsPath, jsLineStart);
            const mappedEnd = mapToSource(jsPath, jsLineEnd);
            if (mappedStart) {
              filePath = toRepoRelative(mappedStart.source, this.repoRoot);
              lineStart = mappedStart.line;
              lineEnd = mappedEnd ? mappedEnd.line : mappedStart.line;
            } else {
              filePath = toRepoRelative(jsPath, this.repoRoot);
            }
          } else {
            filePath = toRepoRelative(jsPath, this.repoRoot);
          }

          out.push({ filePath, lineStart, lineEnd, hitCount: range.count });
        }
      }
    }

    return mergeSameFile(out);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function buildLineOffsets(source: string): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") offsets.push(i + 1);
  }
  return offsets;
}

/** Convert a character offset to a 1-indexed line number. */
function offsetToLine(lineOffsets: number[], offset: number): number {
  let lo = 0;
  let hi = lineOffsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((lineOffsets[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function urlToFilePath(url: string): string | null {
  if (url.startsWith("file://")) {
    try {
      return fileURLToPath(url);
    } catch {
      return null;
    }
  }
  return url.startsWith("/") ? url : null;
}

function toRepoRelative(absPath: string, repoRoot: string): string {
  const rel = relative(repoRoot, absPath);
  return rel.startsWith("..") ? absPath : rel;
}

/** Merge adjacent ranges for the same file into contiguous blocks. */
function mergeSameFile(ranges: CoverageRange[]): CoverageRange[] {
  const byFile = new Map<string, CoverageRange[]>();
  for (const r of ranges) {
    const arr = byFile.get(r.filePath);
    if (arr) arr.push(r);
    else byFile.set(r.filePath, [r]);
  }

  const out: CoverageRange[] = [];
  for (const fileRanges of byFile.values()) {
    fileRanges.sort((a, b) => a.lineStart - b.lineStart);
    let cur = fileRanges[0];
    if (!cur) continue;
    for (let i = 1; i < fileRanges.length; i++) {
      const next = fileRanges[i]!;
      if (next.lineStart <= cur.lineEnd + 1 && next.hitCount === cur.hitCount) {
        cur = { ...cur, lineEnd: Math.max(cur.lineEnd, next.lineEnd) };
      } else {
        out.push(cur);
        cur = next;
      }
    }
    out.push(cur);
  }
  return out;
}

// Exported for testing
export { buildLineOffsets, offsetToLine };
