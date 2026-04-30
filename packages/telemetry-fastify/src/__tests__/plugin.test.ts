import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

function makeSdkStub() {
  return {
    options: { controlPlanePath: "/_lantern" },
    beginTestScope: vi.fn().mockResolvedValue({ end: vi.fn().mockResolvedValue(undefined) }),
    metrics: vi.fn().mockReturnValue({ queueLength: 0, scopesActive: 0 }),
    shutdown: vi.fn().mockResolvedValue(undefined),
    runId: "run-1",
  };
}

async function buildApp(): Promise<{ app: FastifyInstance; sdk: ReturnType<typeof makeSdkStub> }> {
  const { lanternPlugin } = await import("../index.js");
  const sdk = makeSdkStub();
  const app = Fastify({ logger: false });
  await app.register(lanternPlugin, { sdk: sdk as never });
  app.get("/ping", async () => ({ pong: true }));
  await app.ready();
  return { app, sdk };
}

describe("lanternPlugin Fastify", () => {
  it("passes through requests without traceparent", async () => {
    const { app, sdk } = await buildApp();
    const res = await app.inject({ method: "GET", url: "/ping" });
    expect(res.statusCode).toBe(200);
    expect(sdk.beginTestScope).not.toHaveBeenCalled();
    await app.close();
  });

  it("calls beginTestScope for a valid traceparent", async () => {
    const { app, sdk } = await buildApp();
    const testId = "aabbccdd00112233aabbccdd00112233";
    const res = await app.inject({
      method: "GET",
      url: "/ping",
      headers: { traceparent: `00-${testId}-aabbccdd00112233-01` },
    });
    expect(res.statusCode).toBe(200);
    expect(sdk.beginTestScope).toHaveBeenCalledWith(expect.objectContaining({ testId }));
    await app.close();
  });

  it("serves /_lantern/health", async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: "GET", url: "/_lantern/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ ok: boolean }>().ok).toBe(true);
    await app.close();
  });

  it("calls sdk.shutdown on app close", async () => {
    const { app, sdk } = await buildApp();
    await app.close();
    expect(sdk.shutdown).toHaveBeenCalled();
  });
});
