---
"weftai": minor
---

`validatePlan` reports a whole reference written into a plain field (`ref.in_plain_field`)
when it names a step in the plan or a stored result. Plain fields are still never resolved;
the plan used to run with the operation handed the reference's own text.
