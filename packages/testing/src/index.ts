import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createRuntime,
  type ExecuteOptions,
  type ExecutionResult,
  type PlanStep,
  type Registry,
  type Runtime,
  type RuntimeOptions,
  type StepResult,
} from "weftai";

export interface TestRuntime<Ctx> {
  readonly runtime: Runtime<Ctx>;
  readonly ctx: Ctx;
  execute(plan: unknown, extra?: Partial<ExecuteOptions<Ctx>>): Promise<ExecutionResult<Ctx>>;
  runSteps(
    steps: readonly PlanStep[] | readonly Record<string, unknown>[],
    extra?: Partial<ExecuteOptions<Ctx>>,
  ): Promise<ExecutionResult<Ctx>>;
}

export function createTestRuntime<Ctx>(
  registry: Registry<Ctx>,
  ctx: Ctx,
  options: Omit<RuntimeOptions<Ctx>, "registry"> = {},
): TestRuntime<Ctx> {
  const runtime = createRuntime({ registry, ...options });
  return {
    runtime,
    ctx,
    execute: (plan, extra) => runtime.execute(plan, { ctx, ...extra }),
    runSteps: (steps, extra) => runtime.execute({ steps }, { ctx, ...extra }),
  };
}

export function stepById<Ctx>(result: ExecutionResult<Ctx>, id: string): StepResult {
  const step = result.steps.find((candidate) => candidate.id === id);
  if (step === undefined) {
    const known = result.steps.map((candidate) => candidate.id).join(", ") || "(none)";
    throw new Error(`No step '${id}' in the result. Steps: ${known}.`);
  }
  return step;
}

export function toHaveMatched<Ctx>(result: ExecutionResult<Ctx>, id: string, n: number): void {
  const step = stepById(result, id);
  if (step.count !== n) {
    throw new Error(`Expected step '${id}' to have matched ${n}, got ${step.count ?? "no count"}.`);
  }
}

export function toHaveNotice<Ctx>(
  result: ExecutionResult<Ctx>,
  id: string,
  pattern: string | RegExp,
): void {
  const step = stepById(result, id);
  const hit = step.notices.some((notice) =>
    typeof pattern === "string" ? notice.includes(pattern) : pattern.test(notice),
  );
  if (!hit) {
    throw new Error(
      `Expected step '${id}' to have a notice matching ${String(pattern)}. Notices: ${step.notices.join(" | ") || "(none)"}.`,
    );
  }
}

export function toHaveFailed<Ctx>(
  result: ExecutionResult<Ctx>,
  id: string,
  pattern: string | RegExp,
): void {
  const step = stepById(result, id);
  if (step.status !== "error") {
    throw new Error(`Expected step '${id}' to fail, but it was '${step.status}'.`);
  }
  const message = step.error ?? "";
  const hit = typeof pattern === "string" ? message.includes(pattern) : pattern.test(message);
  if (!hit) {
    throw new Error(`Expected step '${id}' to fail matching ${String(pattern)}. Error: ${message}`);
  }
}

/** The model-facing string; use with Vitest snapshots. */
export function formatSnapshot<Ctx>(result: ExecutionResult<Ctx>): string {
  return result.text;
}

export function loadFixture<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as T;
}
