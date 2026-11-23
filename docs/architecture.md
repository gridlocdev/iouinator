# Architecture

IOUinator is one TypeScript code base with two hosts. The browser and the Electron app run the same UI on the same engine.

```
     ┌──────────────── apps/web (Preact + signals, one Vite build) ────────────────┐
     │  App · PeoplePane · TransactionsPane · DiagramPane · Dialogs · ContextMenu   │
     │  AppController (settings, ledger, filter, debts, dialogs, notices, undo)     │
     │  OpenLedger · LedgerFolders · commands.ts (the catalog) · mermaidDraw.ts     │
     └─────────────────────────────────────┬────────────────────────────────────────┘
                                           │ imports
     ┌──────────────────── packages/ui (Preact + signals) ─────────────────────┐
     │  CommandCatalog · listenForKeys · Dialog · ListPopup · focusTrap · Icon   │
     │  settings · schedule · domHooks · Folder and its adapters                │
     └─────────────────────────────────────┬───────────────────────────────────┘
                                           │
     ┌──────────────────── packages/core (pure TS) ────────────────────┐
     │  money · ledger · debts · ledgerFile · mermaid                     │◄──── apps/desktop
     └──────────────────────────────────────────────────────────────────┘
```

## Layering

- `packages/core` has no DOM and no Node APIs. ESLint rejects `window`, `document`, `localStorage` and `process` there, so the engine runs the same in a browser and the tests.
- `packages/ui` knows the DOM but nothing about debts.
- Other packages import only through `@iouinator/<package>`, and tests only through their own package's `src/index.ts`; the architecture test rejects deep imports.
- `test/architecture.test.ts` also keeps platform APIs in one place each: key listeners in `packages/ui/src/commands/`, timers in `packages/ui/src/schedule.ts`, browser storage in `packages/ui/src/settings.ts` and `packages/ui/src/platform/`, and effect hooks in the dialog and popup components and `packages/ui/src/components/domHooks.ts`.

## Core (`packages/core`)

- `money.ts`: amounts as whole cents, read from what the user typed (`$1,250.00`, `12.5`) and shown as `$1,250.00` (PRD §4.2).
- `ledger.ts`: the ledger as an immutable value of people and transactions, and every edit to it: add, rename and remove people (with their transactions), add, edit, swap and delete transactions. An edit that changes nothing returns the same ledger (PRD §3, §4).
- `debts.ts`: what the diagram shows: the raw totals per direction, the flattened debts (pairs netted, then loops cancelled), the flatten summary and everyone's balance (PRD §5, §6).
- `ledgerFile.ts`: the `.iou.json` format. `classifyFile` sorts any text into a ledger, a newer format or damaged; `writeLedgerText` writes it back byte for byte (PRD §8.1).
- `mermaid.ts`: the diagram's Mermaid text, a left-to-right flowchart with one node per person and one labelled arrow per debt (PRD §5).

## UI (`packages/ui`)

- `commands/`: the `CommandCatalog`. Shortcuts are parsed once; `listenForKeys` is the one key listener.
- `settings.ts`: the per-device settings and where they are kept (PRD §11).
- `platform/`: `Folder`, the one way the app reaches files, with versions (SHA-256 of the bytes) and conflicts; its adapters for the browser's own storage, a folder picked with the File System Access API, a read-only snapshot of a folder picked with `<input webkitdirectory>` in Firefox and Safari (`fileListFolder.ts`; `Folder.readOnly` says why, and the catalog turns off every command marked `writes`), memory and the desktop app's bridge; and `LedgerLibrary`, the ledgers and trash in a folder (PRD §8).
- `components/`: `Dialog` (focus trap, Escape, one at a time), `ListPopup` for ⌘K, `Icon`, and `domHooks.ts`, which keeps focus, scrolling, popup placement and the drawn diagram in step with the model.
- `schedule.ts`: the page's only timers.

## App (`apps/web`)

- `controller.ts`: `AppController` holds the app's state as signals: settings, the ledger, the filter, the chosen transaction, the debts and balances, the open dialog and menu, and the notice. Every key, button and command calls one of its methods.
- `undo.ts`: undo and redo of whole ledgers (PRD §7). `notices.ts`: the status bar's notices and the live region.
- `openLedger.ts`: the open ledger and its file: saved at once, one save at a time, retried, conflicts asked about, outside changes picked up, crash snapshots (PRD §8.3). `ledgerFolders.ts` switches between folders.
- `mermaidDraw.ts`: loads Mermaid the first time it is needed and draws the text from core in the app's colours. `DiagramPane.tsx` marks the arrows and people that can be clicked.
- `commands.ts`: every command, its shortcut, when it's enabled and the context menus; `nativeMenu.ts` builds the menu bar from it and `shortcuts.ts` the Keyboard Shortcuts window. `docs/controls.md` is checked against it by `apps/web/test/controls.test.ts`.
- `native.ts`: the `iouinatorNative` bridge when the page runs in the desktop app.

## Desktop (`apps/desktop`)

The Electron main process loads the built web client from `app://iouinator/` in a sandboxed renderer with context isolation. It serves no other app:// host, keeps every frame on those pages, and grants the page one permission, writing to the clipboard. The preload script exposes `iouinatorNative`: the version, the menu bar and menu commands, the ledger folder (`ledgerFolder.ts`: atomic writes and a lock file, inside the folder the user chose in `folderChoice.ts`), exporting a ledger, and the update check (`updates.ts`). The main process keeps the window's place and size (`windowState.ts`, saved atomically). For automated checks, `--headless` (or `IOUINATOR_HEADLESS=1`) renders offscreen and muted, with no window or Dock icon, on a fresh profile in the system's temporary folder unless `IOUINATOR_USER_DATA` names one. It puts nothing on the screen: the right-click menu, folder dialogs and links to open are recorded in `globalThis.iouinatorHeadless` instead, and an uncaught exception or unhandled promise rejection in the main process is written to stderr and exits the app with code 1 rather than showing Electron's error dialog (`crashGuard.ts`). `headlessStart.ts` sets this up as the first import of `main.ts`, before any other module runs.

## Tests

- Unit tests sit in each package's `test/` folder and run with Vitest. `packages/core/test/debts.test.ts` flattens random ledgers and checks that every balance is kept, no loop is left and only people who transacted are linked. `packages/ui/test/folderContract.ts` runs the same checks against every `Folder` adapter.
- `test/architecture.test.ts` checks the layering rules, and `test/features.test.ts` checks that every section of `docs/features.md` has a scenario.
- `e2e/` holds Playwright scenarios against the built web client and a headless desktop smoke test.
