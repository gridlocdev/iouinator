# Changelog

## Unreleased

The first version of IOUinator, which keeps track of who owes whom in a group. It runs on macOS, Windows and Linux, and in the browser.

### What's new

- **People.** Add the people in the group, rename them, or remove them with their transactions. Each person shows their balance: what they're owed, what they owe, or settled.
- **Transactions.** Record who owes whom, how much in dollars, and what for. The form keeps From and To for the next one, and amounts are exact to the cent. Edit, swap or delete a transaction from the list or its right-click menu.
- **The diagram.** A Mermaid diagram shows one arrow per direction between two people with its total, and a Totals table lists the same totals. Click an arrow, a person or a row to see the transactions behind it. **Copy Diagram as Mermaid** copies the diagram's text for Markdown.
- **Flattening.** **F** or the Raw / Flattened switch nets each pair and cancels debts that go round in a loop, and says how much less changes hands. The transactions themselves never change.
- **Undo.** Every change can be undone with **⌘Z**, and removals say what went with an **Undo** button.
- **Ledgers are JSON files.** Each ledger is a `.iou.json` file in a folder you choose, Documents/IOUinator by default, saved as you go. Rename, export and delete them, with a trash to bring deleted ones back. If another app changes the file while you work, IOUinator asks which version to keep, and unsaved work is restored after a crash.
- **Every command from the keyboard.** **⌘K** runs any command by name, and **⌘/** lists every shortcut.
- **Light and dark.** Follows the system, or pick one in **Settings** (**⌘,**).
