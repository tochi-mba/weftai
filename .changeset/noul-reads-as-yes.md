---
"weftai": patch
---

`Gate` and `Decomposition` now read a noul as the probability of yes. An answer's probability is the probability of the value it gives. So a noul answered no with 0.95 used to clear a 0.8 gate, and it added 0.95 to a weighted score as if it were a confident yes. A confident no now fails open at a gate and pulls a score down. The docs that described a noul's probability as the probability of yes now say what an answer actually carries.
