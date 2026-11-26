# Changelog

## Unreleased

### What's new

- **What does this key do?** The Keyboard Shortcuts window has a **Press a Shortcut…** button: press any keys and it names the command each one runs, without running it. Esc or Stop ends it, and so do 30 seconds with no key.

### Improvements

- **Locked-down desktop app.** The packaged app can no longer be started as plain Node or with Node's debugging options, and loads only its own bundled code, which it checks hasn't been changed.
- **Focus you can always see.** Wherever the keyboard is shows in IOUinator's own colour, in light and dark. The transaction list and the Raw/Flattened switch are one Tab stop each, moved with the arrows, and after a delete, an undo or closing a dialog the keyboard is back on the chosen row.

## 1.1.0

### What's new

- **Open a folder in Firefox and Safari.** **Open Ledger Folder…** now works in Firefox and Safari too. They can open a folder only to read it, so its ledgers show with their diagram and can be exported, while commands that would change them are off and say why. Ledgers in the browser's own storage stay editable.

## 1.0.0

The first release of IOUinator, which keeps track of who owes whom in a group. You list the people, record each debt with an amount and what it was for, and a diagram shows the totals between everyone. It runs on macOS, Windows and Linux, and in the browser.

### What's new

- **People.** Add the people in the group, rename them, or remove them with their transactions. Each person shows their balance: what they're owed, what they owe, or settled.
- **Transactions.** Record who owes whom, how much in dollars, and what for. The form keeps **From** and **To** for the next one, and amounts are exact to the cent. Edit, swap or delete a transaction from the list or its right-click menu.
- **From and To from the keyboard.** Open either list with **Space**, then move through the names with **Tab** and **Shift+Tab** or the arrow keys, or type a name's first letter.
- **The diagram.** A Mermaid diagram shows one arrow per direction between two people with its total, and a **Totals** table lists the same totals. Click an arrow, a person or a row to see the transactions behind it. **Copy Diagram as Mermaid** copies the diagram's text for Markdown.
- **Flattening.** **F** or the **Raw / Flattened** switch nets each pair and cancels debts that go round in a loop, and says how much less changes hands. Everyone's balance stays the same, and the transactions themselves never change.
- **Undo.** Every change can be undone with **⌘Z**, and removals say what went with an **Undo** button.
- **Ledgers are JSON files.** Each ledger is a `.iou.json` file in a folder you choose, Documents/IOUinator by default, saved as you go. Rename, export and delete them, with a trash to bring deleted ones back. If another app changes the file while you work, IOUinator asks which version to keep, and unsaved work is restored after a crash.
- **Every command from the keyboard.** **⌘K** runs any command by name, and **⌘/** lists every shortcut.
- **Light and dark.** Follows the system, or pick one in **Settings** (**⌘,**).

### Download

- **macOS:** `IOUinator-1.0.0-mac-arm64.dmg` for Apple silicon or `IOUinator-1.0.0-mac-x64.dmg` for Intel. Drag IOUinator to Applications. The build isn't notarized by Apple, so the first time macOS won't open it: choose **Open Anyway** in System Settings → Privacy & Security.
- **Windows:** the installer, `IOUinator-1.0.0-win-x64.exe`.
- **Linux:** `IOUinator-1.0.0-linux-x86_64.AppImage`. Make it executable and run it: `chmod +x IOUinator-1.0.0-linux-x86_64.AppImage && ./IOUinator-1.0.0-linux-x86_64.AppImage`.

See [Getting started](https://github.com/gridlocdev/iouinator/blob/main/docs/getting-started.md) for running it in the browser and from source.
