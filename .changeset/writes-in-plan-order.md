---
"weftai": patch
---

A write step now runs on its own, in the order the plan wrote it. It starts after every step written before it has finished, and no step written after it starts until it is done. Two writes with no reference between them used to run at the same moment. Reads with no write between them still run together, and a failed write still skips only the steps that reference it.
