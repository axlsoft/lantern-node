import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveOptions } from "../config.js";

describe("resolveOptions", () => {
  const valid = {
    collectorEndpoint: "http://localhost:8080",
    apiKey: "test-key",
    projectId: "00000000-0000-0000-0000-000000000001",
  };

  it("accepts valid input and applies defaults", () => {
    const opts = resolveOptions(valid);
    expect(opts.enabled).toBe(true);
    expect(opts.batchSize).toBe(100);
    expect(opts.flushIntervalMs).toBe(5000);
    expect(opts.bufferCapacity).toBe(10_000);
    expect(opts.dropPolicy).toBe("dropOldest");
    expect(opts.httpTimeoutMs).toBe(30_000);
    expect(opts.controlPlanePath).toBe("/_lantern");
    expect(opts.sourceMapsEnabled).toBe(true);
  });

  it("overrides defaults", () => {
    const opts = resolveOptions({ ...valid, batchSize: 50, dropPolicy: "dropNewest" });
    expect(opts.batchSize).toBe(50);
    expect(opts.dropPolicy).toBe("dropNewest");
  });

  it("throws on missing collectorEndpoint", () => {
    expect(() => resolveOptions({ apiKey: "k", projectId: valid.projectId })).toThrow();
  });

  it("throws on invalid UUID for projectId", () => {
    expect(() => resolveOptions({ ...valid, projectId: "not-a-uuid" })).toThrow(/uuid/i);
  });

  describe("env var fallback", () => {
    beforeEach(() => {
      process.env["LANTERN_COLLECTOR_ENDPOINT"] = "http://env-collector";
      process.env["LANTERN_API_KEY"] = "env-key";
      process.env["LANTERN_PROJECT_ID"] = "00000000-0000-0000-0000-000000000002";
    });
    afterEach(() => {
      delete process.env["LANTERN_COLLECTOR_ENDPOINT"];
      delete process.env["LANTERN_API_KEY"];
      delete process.env["LANTERN_PROJECT_ID"];
    });

    it("reads from env vars when no explicit values given", () => {
      const opts = resolveOptions({});
      expect(opts.collectorEndpoint).toBe("http://env-collector");
      expect(opts.apiKey).toBe("env-key");
    });

    it("explicit values beat env vars", () => {
      const opts = resolveOptions({ apiKey: "explicit" });
      expect(opts.apiKey).toBe("explicit");
    });
  });
});
