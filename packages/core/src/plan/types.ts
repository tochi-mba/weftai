import { z } from "zod";

/** How long a step's note may be: one sentence, not a paragraph. */
export const NOTE_MAX_CHARS = 200;

/**
 * The wire format the model produces: one tool call, one or more named steps. Unknown keys are
 * rejected so a mis-named field (`operation` instead of `op`) is reported, not silently ignored.
 */
export const PlanStepSchema = z.strictObject({
  id: z.string(),
  op: z.string(),
  input: z.record(z.string(), z.unknown()).default({}),
  present: z.enum(["auto", "preview", "full"]).optional(),
  /** One plain sentence saying what this step is for, written for a person. Never executed. */
  note: z.string().max(NOTE_MAX_CHARS).optional(),
});

/**
 * A plan is its steps, or, with `rerun`, an earlier plan run again: `rerun` names one of that
 * plan's steps and `steps` holds only the steps to replace or add, so it may be empty. `null` is
 * the same as leaving it out, for strict schemas where every property is required.
 */
export const PlanSchema = z
  .strictObject({
    steps: z.array(PlanStepSchema),
    rerun: z.string().nullable().optional(),
  })
  .superRefine((plan, context) => {
    if (plan.steps.length === 0 && (plan.rerun === undefined || plan.rerun === null)) {
      context.addIssue({
        code: "custom",
        path: ["steps"],
        message: "Too small: expected array to have >=1 items",
      });
    }
  });

export type PlanStep = z.output<typeof PlanStepSchema>;
export type Plan = z.output<typeof PlanSchema>;
export type PlanInput = z.input<typeof PlanSchema>;
