# Getting started

IOUinator runs as a desktop app on macOS, Windows and Linux, and in a modern browser.

## Download

Download the desktop app from [Releases](https://github.com/gridlocdev/iouinator/releases): a `.dmg` or `.zip` for macOS (Apple silicon or Intel), an `.exe` installer for Windows, or an AppImage for Linux.

Drag IOUinator to Applications. The macOS app isn't notarized by Apple, so the first time macOS won't open it: open System Settings → Privacy & Security and choose **Open Anyway** next to the message about IOUinator. After that it opens normally.

## Run from source

You need Node 22.18 or later, pnpm (through corepack) and [just](https://github.com/casey/just).

```bash
just setup         # install the dependencies
just run-desktop   # the desktop app
just run-web       # the browser version on http://localhost:5173
```

## The first start

The desktop app asks where to keep your ledgers: **Use Documents/IOUinator**, or **Choose Folder…** for another folder. **⌘O** (**Ctrl+O**) picks another folder later. An empty folder gets a new ledger called Ledger.

The browser keeps ledgers in its own storage, and the status bar says "Stored in this browser". In Chrome and Edge, **Open Ledger Folder…** in the command menu (**⌘K**) keeps them in a folder on disk instead.

## A first ledger

1. Type a name in **Add a person** and press Enter. Add everyone in the group the same way.
2. In the transaction form, pick who owes (**From**) and whom (**To**), type the amount and what it was for, and press Enter.
3. The diagram on the right shows the totals. Press **F** to flatten them.

## Where your data lives

- **Ledgers:** one JSON file per ledger, `*.iou.json`, in the ledger folder. Other apps can read and change them.
- **Trash:** deleted ledgers go to `.iouinator/trash/` inside the ledger folder, until you restore them with **Open Trash…**.
- **Settings:** kept by the app on this device (in the browser, per site). Unsaved work is kept there too, to restore after a crash.
