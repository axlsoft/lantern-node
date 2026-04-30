import fp from "fastify-plugin";
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { withTestScope } from "@lantern/telemetry";
import type { LanternSDK, LanternContext, LanternOptionsInput } from "@lantern/telemetry";

const TRACEPARENT_RE = /^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

function parseTraceparent(header: string): string | null {
  const m = TRACEPARENT_RE.exec(header.trim());
  return m ? (m[1] ?? null) : null;
}

declare module "fastify" {
  interface FastifyRequest {
    lanternContext?: LanternContext;
  }
}

export interface LanternPluginOptions extends Partial<LanternOptionsInput> {
  sdk?: LanternSDK;
}

const pluginImpl: FastifyPluginAsync<LanternPluginOptions> = async (
  fastify: FastifyInstance,
  opts: LanternPluginOptions
): Promise<void> => {
  let sdk: LanternSDK;
  if (opts.sdk) {
    sdk = opts.sdk;
  } else {
    const { LanternSDK } = await import("@lantern/telemetry");
    sdk = new LanternSDK(opts);
    await sdk.start();
  }

  fastify.addHook("onRequest", async (request: FastifyRequest) => {
    const traceparent = request.headers["traceparent"];
    if (!traceparent || typeof traceparent !== "string") return;

    const testId = parseTraceparent(traceparent);
    if (!testId) return;

    const context: LanternContext = { testId };
    request.lanternContext = context;

    await new Promise<void>((resolve) => {
      withTestScope(context, () => {
        sdk
          .beginTestScope(context)
          .then(() => resolve())
          .catch(() => resolve());
      });
    });
  });

  fastify.addHook("onClose", async () => {
    await sdk.shutdown();
  });

  const prefix = "/_lantern";

  fastify.post(`${prefix}/test/start`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { testId, testName, suite, workerId } = request.body as {
      testId?: string;
      testName?: string;
      suite?: string;
      workerId?: string;
    };
    if (!testId) {
      return reply.status(400).send({ error: "testId required" });
    }
    const context: LanternContext = {
      testId,
      ...(testName !== undefined && { testName }),
      ...(suite !== undefined && { suite }),
      ...(workerId !== undefined && { workerId }),
    };
    request.lanternContext = context;
    await sdk.beginTestScope(context);
    return reply.send({ ok: true, testId });
  });

  fastify.post(`${prefix}/test/stop`, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ ok: true });
  });

  fastify.get(`${prefix}/health`, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ ok: true, ...sdk.metrics() });
  });
};

export const lanternPlugin = fp(pluginImpl, {
  fastify: ">=4",
  name: "@lantern/telemetry-fastify",
});
