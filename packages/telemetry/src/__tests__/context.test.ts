import { describe, it, expect } from "vitest";
import { withTestScope, currentContext, currentTestId } from "../context.js";

const ctx = { testId: "test-abc", testName: "my test", suite: "suite-1" };

describe("withTestScope", () => {
  it("makes context visible inside the callback", () => {
    withTestScope(ctx, () => {
      expect(currentContext()).toEqual(ctx);
      expect(currentTestId()).toBe("test-abc");
    });
  });

  it("clears context outside the callback", () => {
    withTestScope(ctx, () => {
      /* inside */
    });
    expect(currentContext()).toBeUndefined();
  });

  it("propagates through await", async () => {
    await withTestScope(ctx, async () => {
      await Promise.resolve();
      expect(currentTestId()).toBe("test-abc");
    });
  });

  it("propagates through Promise chains", async () => {
    let captured: string | undefined;
    await withTestScope(ctx, () =>
      Promise.resolve()
        .then(() => Promise.resolve())
        .then(() => {
          captured = currentTestId();
        })
    );
    expect(captured).toBe("test-abc");
  });

  it("propagates through setTimeout", async () => {
    const result = await withTestScope(
      ctx,
      () =>
        new Promise<string | undefined>((resolve) => {
          setTimeout(() => resolve(currentTestId()), 0);
        })
    );
    expect(result).toBe("test-abc");
  });

  it("propagates through setImmediate", async () => {
    const result = await withTestScope(
      ctx,
      () =>
        new Promise<string | undefined>((resolve) => {
          setImmediate(() => resolve(currentTestId()));
        })
    );
    expect(result).toBe("test-abc");
  });

  it("nests correctly — inner context is visible inside", () => {
    const inner = { testId: "inner-test" };
    withTestScope(ctx, () => {
      withTestScope(inner, () => {
        expect(currentTestId()).toBe("inner-test");
      });
      // Outer context restored after inner scope exits
      expect(currentTestId()).toBe("test-abc");
    });
  });

  it("returns the value from fn", () => {
    const val = withTestScope(ctx, () => 42);
    expect(val).toBe(42);
  });
});
