# p.e.t implementation plan

Approved contract: ../DESIGN.md. No commits, publication, or permission changes.

- [x] Pure validated settings model, ordered max-five frames, queued atomic persistence and deterministic motion; targeted Node tests.
- [x] Sandboxed Electron pet/settings windows, scoped IPC, normalized local imports, isolated keyboard process and permission preflight.
- [x] Supplied default PNG frames and Korean settings, independent rAF bounce/frame clocks, pixel hit testing with cursor polling fallback, bounded dragging.
- [x] Typecheck/build; temporary-profile Playwright Electron smoke covering imports, security, relaunch, screenshots and window sizing.
- [x] Attempt arm64/x64 mac ZIP/DMG and Windows NSIS; document exact evidence and blockers in QA.md and Korean installation instructions in README.md.

Plain TypeScript, native form controls, esbuild, Node test runner. Only necessary dependencies. Execute inline; no additional approval or commit step because implementation and packaging are already authorized.
