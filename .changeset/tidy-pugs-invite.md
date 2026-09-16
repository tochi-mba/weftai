---
"@weftai/providers": patch
---

Stop publishing `dist/fixture.js`. It is the shared test fixture, it was never reachable through
the package exports, and it built a runtime and registry that no consumer could use.
