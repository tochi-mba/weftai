---
"weftai": minor
---

A plan may rerun an earlier one with some steps changed: `rerun` names a step of an earlier plan in the session and `steps` holds only the steps to replace or add. Steps that succeeded and read nothing that changed are reused, not run; a write that succeeded never repeats unless the rerun names it. `buildRerun`, `createMemoryPlanStore`, `PlanStore` and `PlanRecord` are new, and runtimes take a `plans` option.
