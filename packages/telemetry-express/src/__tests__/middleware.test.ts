import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { LanternSDK } from "@lantern/telemetry";

function makeSdkStub(): LanternSDK {
  return {
    beginTestScope: vi.fn().mockResolvedValue({ end: vi.fn().mockResolvedValue(undefined) }),
    metrics: vi.fn().mockReturnValue({ queueLength: 0, scopesActive: 0 }),
    runId: "run-1",
  } as unknown as LanternSDK;
}

describe("lantern Express middleware", async () => {
  const { lantern } = await import("../index.js");

  let sdk: LanternSDK;
  let app: express.Application;

  beforeEach(() => {
    sdk = makeSdkStub();
    app = express();
    app.use(express.json());
    app.use(lantern(sdk));
    app.get("/ping", (_req, res) => res.json({ pong: true }));
  });

  it("passes through requests without traceparent", async () => {
    const res = await request(app).get("/ping");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pong: true });
    expect(sdk.beginTestScope).not.toHaveBeenCalled();
  });

  it("calls beginTestScope for a valid traceparent", async () => {
    const testId = "aabbccdd00112233aabbccdd00112233";
    const res = await request(app)
      .get("/ping")
      .set("traceparent", `00-${testId}-aabbccdd00112233-01`);
    expect(res.status).toBe(200);
    expect(sdk.beginTestScope).toHaveBeenCalledWith(expect.objectContaining({ testId }));
  });

  it("ignores a malformed traceparent", async () => {
    const res = await request(app).get("/ping").set("traceparent", "not-valid");
    expect(res.status).toBe(200);
    expect(sdk.beginTestScope).not.toHaveBeenCalled();
  });

  it("serves /_lantern/health", async () => {
    const res = await request(app).get("/_lantern/health");
    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });

  it("POST /_lantern/test/start returns 400 without testId", async () => {
    const res = await request(app).post("/_lantern/test/start").send({});
    expect(res.status).toBe(400);
  });

  it("POST /_lantern/test/start calls beginTestScope", async () => {
    const res = await request(app).post("/_lantern/test/start").send({ testId: "my-test" });
    expect(res.status).toBe(200);
    expect(sdk.beginTestScope).toHaveBeenCalledWith(expect.objectContaining({ testId: "my-test" }));
  });
});
