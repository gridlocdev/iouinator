# IOUinator — agent guide

IOUinator keeps track of who owes whom: people, transactions between them in dollars with a description, and a Mermaid diagram of the totals, raw or flattened. One UI runs in the browser and in the Electron app. There is no NAS server and no CLI (PRD §2). The spec is [docs/plans/prd.md](docs/plans/prd.md), the code layout is [docs/architecture.md](docs/architecture.md), and the commands are in [docs/development.md](docs/development.md).

## Gates

- `just check` (= `pnpm check`) must pass before you commit: Prettier check, ESLint, `tsc -b`, Vitest (including the architecture rules in `test/architecture.test.ts`), and the build.
- When you change behaviour, add or update a test in the package's `test/` folder, and update the PRD section the code cites (`PRD §n`).
- Every bug fix keeps its reproduction: a unit test, a pinned random-operation seed, or a scenario in `e2e/` for what only shows in the running app. A UI change runs `just e2e`.
- When the owner corrects something, turn the correction into a rule in `test/architecture.test.ts` or a test, not a comment or a line here.
- Never add a `test/architecture-baseline.json`: fix the violation. A comment is never permission: a deliberate exception (`ignoreError(promise, 'why')`, an `eslint-disable`, a `@ts-expect-error`) goes in `test/architecture-exceptions.json` only after the owner agrees.
- Features are named as in [docs/features.md](docs/features.md); every section has a `test.describe` with its name in `e2e/`, and `test/features.test.ts` keeps them in step.
- Use the terms in [GLOSSARY.md](GLOSSARY.md) in code, docs and commit messages, and add a term there when a new concept appears.
- Reports on UI changes include the screenshots that show the change, and what wasn't checked.
- Check UI changes headlessly: Playwright in the background for the web build, or the desktop app with `--headless`, which runs muted on a throwaway profile and puts no window, menu or dialog on the screen. Never open a visible window or browser to check your work. Any native UI you add (a dialog, a menu, a notification, a prompt) is skipped in headless mode and recorded in `globalThis.iouinatorHeadless` for the checks. When a run ends, make sure no Electron process it started is left.

## Layout

| Path | What it is |
| --- | --- |
| `packages/core` | The pure engine: amounts in cents, the ledger and its edits, debts and flattening, the ledger file and the Mermaid text. No DOM or Node (ESLint enforces it). |
| `packages/ui` | Preact and signals: the command catalog, dialogs, ⌘K, settings, the scheduler, the DOM hooks and the `Folder` store with its adapters. |
| `apps/web` | The app shell: `AppController`, the People, Transactions and Diagram panes, the open ledger and its saving, the list of commands and the Vite entry point. One static build serves the browser and the desktop app. |
| `apps/desktop` | The Electron shell: main process, sandboxed preload bridge, the ledger folder on disk, native menu, window state. |

## Golden rules

1. **The engine stays pure.** It has no UI, DOM or Node APIs, and runs the same in a browser and in Node tests.
2. **Whole cents.** Amounts are integers in cents; no floating point touches money.
3. **Flattening keeps balances.** Every person's balance is the same raw and flattened, and the random-ledger test checks it. Flattening never changes the transactions.
4. **One command catalog.** The command menu, shortcuts, context menus, the Electron menu bar, the Keyboard Shortcuts window and `docs/controls.md` all read it. Don't wire a key or a menu item past it.
5. **Files only through `Folder`.** The app never knows whether a ledger is on disk, in the browser's storage or in memory. Saves are atomic, versioned, and never overwrite a file changed elsewhere without asking.
6. **Security.** The Electron renderer is sandboxed with context isolation; its only native access is the `iouinatorNative` bridge.
7. **Dependencies.** The runtime dependencies are Preact, `@preact/signals` and Mermaid. Don't add a package without the owner's approval. Pin versions exactly.
8. **Nothing left to interpretation.** If a behaviour isn't in the PRD, stop and ask, then record the answer in the PRD.

## TypeScript conventions

- Strict mode with `noUncheckedIndexedAccess` and `erasableSyntaxOnly`: no enums, parameter properties or namespaces. Use union types and `const` objects.
- Relative imports end in `.ts`. Use `import type` for types only.
- Each package's `src/index.ts` names its exports one by one. Other packages import only through `@iouinator/<package>`; the architecture test rejects deep imports.
- The file system may be case-insensitive: two files in one folder can't differ only in case.

## Git workflow

- Keep commits small and coherent. Write the message as a plain imperative sentence about the user-visible effect.
- Commit only when `just check` is green and no questions are outstanding.
