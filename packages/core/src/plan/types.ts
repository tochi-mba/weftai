import { z } from "zod";

/**
 * The wire format the model produces: one tool call, one or more named steps. Unknown keys are
 * rejected so a mis-named field (`operation` instead of `op`) is reported, not silently ignored.
 */
export const PlanStepSchema = z.strictObject({
  id: z.string(),
  op: z.string(),
  input: z.record(z.string(), z.unknown()).default({}),
  present: z.enum(["auto", "preview", "full"]).optional(),
});

export const PlanSchema = z.strictObject({
  steps: z.array(PlanStepSchema).min(1),
});

export type PlanStep = z.output<typeof PlanStepSchema>;
export type Plan = z.output<typeof PlanSchema>;
export type PlanInput = z.input<typeof PlanSchema>;
