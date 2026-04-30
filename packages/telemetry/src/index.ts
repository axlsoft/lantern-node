export { LanternSDK } from "./sdk.js";
export type { ScopeHandle, LanternMetrics } from "./sdk.js";

export { resolveOptions } from "./config.js";
export type { LanternOptions, LanternOptionsInput } from "./config.js";

export { withTestScope, currentContext, currentTestId, enterWith } from "./context.js";
export type { LanternContext } from "./context.js";

export { CoverageManager } from "./coverage-manager.js";
export type { CoverageRange } from "./coverage-manager.js";

export { EventQueue } from "./event-queue.js";
export type { DropPolicy } from "./event-queue.js";
