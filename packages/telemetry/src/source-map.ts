import { readFileSync, existsSync } from "node:fs";
import { SourceMapConsumer } from "source-map";

interface MappedPosition {
  source: string;
  line: number;
}

const consumerCache = new Map<string, SourceMapConsumer | null>();

function loadConsumer(jsPath: string): SourceMapConsumer | null {
  if (consumerCache.has(jsPath)) return consumerCache.get(jsPath) ?? null;

  const mapPath = `${jsPath}.map`;
  if (!existsSync(mapPath)) {
    consumerCache.set(jsPath, null);
    return null;
  }

  try {
    const raw = JSON.parse(readFileSync(mapPath, "utf8")) as object;
    const consumer = new SourceMapConsumer(
      raw as ConstructorParameters<typeof SourceMapConsumer>[0]
    );
    consumerCache.set(jsPath, consumer);
    return consumer;
  } catch {
    consumerCache.set(jsPath, null);
    return null;
  }
}

/**
 * Map a JS line (1-indexed) to the original TypeScript source line.
 * Returns null when no source map is available or the mapping is absent.
 */
export function mapToSource(jsPath: string, jsLine: number): MappedPosition | null {
  const consumer = loadConsumer(jsPath);
  if (!consumer) return null;

  const pos = consumer.originalPositionFor({ line: jsLine, column: 0 });
  if (!pos.source || pos.line == null) return null;

  return { source: pos.source, line: pos.line };
}

/** Clear the in-process source map cache (useful in tests). */
export function clearSourceMapCache(): void {
  consumerCache.clear();
}
