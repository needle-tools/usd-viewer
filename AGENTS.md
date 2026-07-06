# Agent Notes

- Avoid full OpenUSD/wasm rebuilds unless they are required to prove a source-level change, produce release artifacts, or the user explicitly asks for one. They take a long time and can block the machine.
- Prefer incremental rebuilds, focused tests, metadata inspection, or narrowly updating generated metadata when behavior is already proven and only bookkeeping changed.
- Before starting any full rebuild, state why it is necessary and check whether a cheaper verification path would answer the same question.
