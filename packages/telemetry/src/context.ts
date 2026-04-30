import { AsyncLocalStorage } from "node:async_hooks";

export interface LanternContext {
  readonly testId: string;
  readonly testName?: string;
  readonly suite?: string;
  readonly workerId?: string;
}

const storage = new AsyncLocalStorage<LanternContext>();

/**
 * Run fn with the given context active. Returns whatever fn returns.
 * Propagates correctly through await, Promise chains, setTimeout, and setImmediate.
 *
 * Known limitation: EventEmitter callbacks created *before* enterWith do not
 * inherit context. Use enterWith() + manual cleanup as the escape hatch.
 */
export function withTestScope<T>(context: LanternContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentContext(): LanternContext | undefined {
  return storage.getStore();
}

export function currentTestId(): string | undefined {
  return storage.getStore()?.testId;
}

/**
 * Advanced escape hatch: mutates the current async context to hold ctx.
 * Use only when withTestScope is not applicable (e.g. EventEmitter roots).
 * Caller is responsible for restoring or exiting the context.
 */
export function enterWith(context: LanternContext): void {
  storage.enterWith(context);
}

export function exitContext(): void {
  storage.disable();
}
