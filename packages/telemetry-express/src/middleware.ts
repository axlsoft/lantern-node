import type { RequestHandler, Request, Response, NextFunction } from "express";
import { Router as createRouter } from "express";
import { withTestScope } from "@lantern/telemetry";
import type { LanternSDK, LanternContext } from "@lantern/telemetry";

declare module "express" {
  interface Request {
    lanternContext?: LanternContext;
  }
}

export interface LanternMiddlewareOptions {
  controlPlanePath?: string;
}

const TRACEPARENT_RE = /^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

function parseTraceparent(header: string): string | null {
  const m = TRACEPARENT_RE.exec(header.trim());
  return m ? (m[1] ?? null) : null;
}

export function lantern(sdk: LanternSDK, opts: LanternMiddlewareOptions = {}): RequestHandler {
  const basePath = opts.controlPlanePath ?? "/_lantern";
  const controlPlane = buildControlPlane(sdk, basePath);

  const middleware: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
    if (req.path.startsWith(basePath)) {
      controlPlane(req, res, next);
      return;
    }

    const traceparent = req.headers["traceparent"];
    if (!traceparent || typeof traceparent !== "string") {
      next();
      return;
    }

    const testId = parseTraceparent(traceparent);
    if (!testId) {
      next();
      return;
    }

    const context: LanternContext = { testId };
    req.lanternContext = context;

    withTestScope(context, () => {
      sdk
        .beginTestScope(context)
        .then((handle) => {
          res.once("finish", () => {
            void handle.end();
          });
          next();
        })
        .catch(next);
    });
  };

  return middleware;
}

function buildControlPlane(sdk: LanternSDK, basePath: string): RequestHandler {
  const router = createRouter();

  router.post(`${basePath}/test/start`, ((req: Request, res: Response): void => {
    const { testId, testName, suite, workerId } = req.body as {
      testId?: string;
      testName?: string;
      suite?: string;
      workerId?: string;
    };
    if (!testId) {
      res.status(400).json({ error: "testId required" });
      return;
    }
    const context: LanternContext = {
      testId,
      ...(testName !== undefined && { testName }),
      ...(suite !== undefined && { suite }),
      ...(workerId !== undefined && { workerId }),
    };
    req.lanternContext = context;
    void sdk.beginTestScope(context).then(() => {
      res.json({ ok: true, testId });
    });
  }) as RequestHandler);

  router.post(`${basePath}/test/stop`, ((_req: Request, res: Response): void => {
    res.json({ ok: true });
  }) as RequestHandler);

  router.get(`${basePath}/health`, ((_req: Request, res: Response): void => {
    res.json({ ok: true, ...sdk.metrics() });
  }) as RequestHandler);

  return router;
}
