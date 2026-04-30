import { z } from "zod";

export const LanternOptionsSchema = z.object({
  collectorEndpoint: z.string().url("collectorEndpoint must be a valid URL"),
  apiKey: z.string().min(1, "apiKey is required"),
  projectId: z.string().uuid("projectId must be a valid UUID"),
  enabled: z.boolean().default(true),
  batchSize: z.number().int().positive().default(100),
  flushIntervalMs: z.number().int().positive().default(5000),
  bufferCapacity: z.number().int().positive().default(10_000),
  dropPolicy: z.enum(["dropOldest", "dropNewest"]).default("dropOldest"),
  httpTimeoutMs: z.number().int().positive().default(30_000),
  controlPlanePath: z.string().default("/_lantern"),
  controlPlaneEnabled: z.boolean().default(true),
  repoRoot: z.string().optional(),
  sourceMapsEnabled: z.boolean().default(true),
});

export type LanternOptions = z.infer<typeof LanternOptionsSchema>;

export type LanternOptionsInput = z.input<typeof LanternOptionsSchema>;

/**
 * Resolve options from caller-supplied values and environment variable fallbacks.
 * Environment variables are the lowest-priority fallback — explicit values win.
 */
export function resolveOptions(input: Partial<LanternOptionsInput>): LanternOptions {
  const merged: LanternOptionsInput = {
    collectorEndpoint: input.collectorEndpoint ?? process.env["LANTERN_COLLECTOR_ENDPOINT"] ?? "",
    apiKey: input.apiKey ?? process.env["LANTERN_API_KEY"] ?? "",
    projectId: input.projectId ?? process.env["LANTERN_PROJECT_ID"] ?? "",
    ...input,
  };
  return LanternOptionsSchema.parse(merged);
}
