import { LimitExceededError } from "../errors.js";

export interface BoundSignal {
  readonly signal: AbortSignal;
  dispose(): void;
}

const NEVER = new AbortController().signal;

export function whenAborted(signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) return Promise.resolve(signal.reason);
  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(signal.reason), { once: true });
  });
}

/** Aborts when any of `signals` abort. Already-aborted sources abort immediately. */
export function mergeAbort(signals: readonly AbortSignal[]): AbortController {
  const controller = new AbortController();
  const abortFrom = (signal: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(signal.reason);
  };
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => abortFrom(signal), { once: true });
  }
  return controller;
}

function isFiniteTimeout(ms: number | undefined): ms is number {
  return ms !== undefined && Number.isFinite(ms);
}

/**
 * A signal that aborts when `parent` aborts or when `timeoutMs` elapses. `dispose` clears the
 * timer so a finished step does not later abort a reused controller.
 */
export function bindTimeout(
  parent: AbortSignal | undefined,
  timeoutMs: number | undefined,
  onTimeout: () => unknown,
): BoundSignal {
  const controller = new AbortController();
  const parentSignal = parent ?? NEVER;

  const abortFromParent = () => {
    if (!controller.signal.aborted) controller.abort(parentSignal.reason);
  };

  if (parentSignal.aborted) {
    controller.abort(parentSignal.reason);
    return { signal: controller.signal, dispose() {} };
  }

  parentSignal.addEventListener("abort", abortFromParent, { once: true });

  let timer: ReturnType<typeof setTimeout> | undefined;
  if (isFiniteTimeout(timeoutMs)) {
    const ms = timeoutMs;
    timer = setTimeout(() => {
      if (!controller.signal.aborted) controller.abort(onTimeout());
    }, ms);
  }

  return {
    signal: controller.signal,
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      parentSignal.removeEventListener("abort", abortFromParent);
    },
  };
}

export function planTimeoutError(timeoutMs: number): LimitExceededError {
  return new LimitExceededError(
    "planTimeoutMs",
    timeoutMs,
    timeoutMs,
    `The plan timed out after ${timeoutMs}ms. Split the work across calls or raise the plan timeout.`,
  );
}

export function stepTimeoutError(stepId: string, timeoutMs: number): LimitExceededError {
  return new LimitExceededError(
    "stepTimeoutMs",
    timeoutMs,
    timeoutMs,
    `Step '${stepId}' timed out after ${timeoutMs}ms. Narrow the query or raise the step timeout.`,
  );
}
