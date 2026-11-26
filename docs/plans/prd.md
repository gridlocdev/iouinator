# IOUinator — product requirements

IOUinator keeps track of who owes whom among a group of people. You list the people, record each debt with an amount in dollars and a description, and a diagram shows the totals between them. A flattened view cancels debts that go round in a loop. It runs as a desktop app (Electron) and in the browser, on the same engine. Code cites this document as `PRD §n`.

## §1 Goals

1. Record debts between people quickly from the keyboard: who owes, whom, how much, what for.
2. See every total at a glance in a diagram, one arrow per direction between two people.
3. Flatten the debts so that money that goes round a loop (A owes B, B owes C, C owes A) is cancelled, leaving fewer and smaller debts with the same balance for everyone.
4. Never lose a ledger: atomic saves, conflicts shown and chosen by the user, a trash, undo.

## §2 Non-goals for 1.0

- Currencies other than US dollars, and exchange rates.
- Splitting one bill among several people in one entry (enter one transaction per person).
- Settling up with the fewest payments between people who never transacted (the flattened view only cancels loops, §6).
- Dates on transactions, attachments, payment links.
- A NAS server, a CLI and an iOS app. The browser build can still be hosted anywhere as static files.

## §3 People

- A ledger has a list of people, in the order they were added. A name is 1 to 60 characters after trimming spaces, unique in the ledger ignoring case. Errors: "A person needs a name.", "A name can have up to 60 characters.", "There's already someone called Sam."
- **Add Person** (P outside a text field) puts focus in the add field at the top of the People list; Enter adds the name and keeps focus there for the next one.
- **Rename Person…** gives a person another name under the same rules. Their transactions follow, since transactions refer to people by id.
- **Remove Person** removes the person and every transaction they are in, as one undo step, with the notice "Removed Sam and 3 transactions." and **Undo**.
- The People list shows each person's balance: "+$12.50" (is owed overall), "−$4.00" (owes overall), or "settled".

## §4 Transactions

### §4.1 What a transaction is

- A transaction says **From** owes **To** an **Amount** in dollars, **For** a description. "From Sam, To Alex, $10, Pizza" means Sam owes Alex $10 for pizza.
- From and To are two different people of the ledger.
- The description is required, 1 to 200 characters after trimming. Errors: "Say what the transaction is for.", "The description can have up to 200 characters."
- Transactions keep the order they were added; the list shows the newest last.

### §4.2 Amounts

- Amounts are kept as a whole number of cents; no floating point anywhere.
- The Amount field accepts `12`, `12.5`, `12.50`, `$12.50`, `1,250.00`, with spaces around. It refuses a third decimal place, a negative or zero amount, and more than $1,000,000,000.00. Errors: "Enter an amount like 12.50.", "The amount must be more than $0.", "The amount can be up to $1,000,000,000."
- Amounts are shown as `$1,250.00`: a dollar sign, grouping commas, two decimals.

### §4.3 Adding and editing

- The transaction form sits above the list: From, To, Amount, For, and **Add**. Enter in any field adds. After adding, From and To stay, Amount and For are cleared, and focus goes to Amount. An error shows under the form and nothing is added.
- From and To are pickers with the page's own list of the ledger's people, not native selects (a native select's open list on macOS takes no keys from the page). Space, ↓ or ↑ opens the list, with the current person highlighted and checked. While it is open, Tab and ↓ move down and Shift+Tab and ↑ move up, stopping at the ends; Home and End go to the first and last; a letter jumps to the next name starting with it; Enter or Space picks; Esc closes without picking, and inside a dialog doesn't close the dialog. Focus stays on the picker. While it is closed, Tab and Shift+Tab move between fields as usual, Enter adds the transaction, and a letter picks the next name starting with it. Picking the person shown in the other picker swaps the two.
- With fewer than two people the form is replaced by the line "Add at least two people to record a transaction."
- **New Transaction** (N outside a text field) puts focus in the form's Amount field.
- Choosing a transaction in the list and pressing Enter, or double-clicking it, opens **Edit Transaction**, with the same fields and Save / Cancel. Saving with no field changed changes nothing (no undo step, no save).
- **Delete Transaction** (Delete or Backspace on the chosen transaction) removes it with the notice "Deleted Pizza." and **Undo**.
- **Swap Direction** turns "Sam owes Alex" into "Alex owes Sam" for the chosen transaction.
- The list moves with ↑/↓, Home/End; the chosen transaction has a visible focus ring.

### §4.4 Filtering

- Picking an arrow in the diagram, or a row in the Totals table (§5), filters the list to the transactions behind that total: "Sam → Alex" with **Clear**. In the flattened view, the filter is the pair in both directions. Picking a person in the diagram, or **Show Their Transactions**, filters to every transaction they are in.
- **Clear Filter** (Esc in the list) shows every transaction again. A filter whose people are removed clears itself.

## §5 The diagram

- The diagram pane shows the ledger as a Mermaid flowchart, left to right. Each person is a node with their name. Each arrow goes from the person who owes to the person owed, labelled with the total, `$42.50`.
- **Raw** view: one arrow per direction between two people, with the sum of every transaction that way. If Sam owes Alex $10 and Alex owes Sam $4, both arrows show.
- **Flattened** view: §6.
- People with no arrows still show as nodes, so the whole group is visible.
- Under the diagram, a **Totals** table lists the same arrows as rows (From, To, Amount), each a button that filters the list (§4.4). It is the keyboard and screen-reader way to the same totals.
- The diagram redraws after each change. Mermaid loads only when the pane first needs it. If drawing fails, the pane says "Couldn't draw the diagram." and the Totals table still shows.
- **Copy Diagram as Mermaid** copies the diagram's Mermaid text, for pasting into Markdown.
- A ledger with no people shows "Add people to see who owes whom."

## §6 Flattening

**Flatten Debts** (F outside a text field, and the Raw / Flattened switch above the diagram) switches the diagram and the Totals table to the flattened view. The transactions themselves never change.

1. **Net each pair.** For each two people, the two directions are netted: Sam owes Alex $10 and Alex owes Sam $4 becomes Sam owes Alex $6. A pair that nets to $0 has no arrow.
2. **Cancel loops.** While the debts contain a loop (A owes B, B owes C, C owes A, of any length), subtract the smallest debt in the loop from every debt in it. That debt becomes $0 and its arrow goes; the others shrink. Repeat until no loop is left.
3. Everyone's balance (what they are owed minus what they owe) is the same before and after; tests check this for random ledgers.
4. The result is the same every time for the same ledger: loops are looked for starting from people in list order, following debts in list order of the person owed.
5. Above the diagram, the flattened view says what it cancelled: "3 debts → 1 · $30.00 less changing hands." With nothing to cancel: "Nothing to flatten."

## §7 Undo

- Every change to the ledger (people and transactions) is one undo step: ⌘Z and ⇧⌘Z, up to 200 steps. Opening a ledger clears undo.
- Undo while typing in a text field undoes the typing, not the ledger.

## §8 Ledger files

### §8.1 Format

- A ledger is a UTF-8 JSON file with the extension `.iou.json`:

  ```json
  {
    "format": "iouinator",
    "version": 1,
    "people": [{ "id": "p1", "name": "Sam" }],
    "transactions": [{ "id": "t1", "from": "p1", "to": "p2", "cents": 1000, "description": "Pizza" }]
  }
  ```

- Written with two-space indentation and a final newline, keys in this order, so the file diffs well. A file read and written with no change is byte-identical when IOUinator wrote it.
- Reading (`classifyFile`) strips a byte-order mark, then sorts the text into: a ledger; a newer format (`version` above 1), which is never opened or saved over: IOUinator says "Trip was made by a newer IOUinator." and opens another ledger; or damaged (not JSON, the wrong shape, a transaction naming a missing person, `from` equal to `to`, a bad amount, duplicate ids, duplicate names). A damaged file is never overwritten: IOUinator says "Trip is damaged and wasn't opened." and opens another ledger.
- An empty file (0 bytes) is an empty ledger.

### §8.2 The ledger folder

- The desktop app and the browser keep ledgers in a folder; each `*.iou.json` directly in it is a ledger, named without the extension. First start on desktop asks **Use Documents/IOUinator** (created when chosen) or **Choose Folder…**; a missing remembered folder (an unplugged drive) is named in the same question and nothing is created in its place.
- The browser starts with ledgers in its own storage, and the status bar says "Stored in this browser". Where the browser has the File System Access API (`showDirectoryPicker`), **Open Ledger Folder…** (⌘O) picks a folder on disk, which is remembered (the browser may ask to allow it again on a later visit), and **Keep Ledgers in This Browser** goes back.
- Where it hasn't (Firefox, Safari) but has `<input type="file" webkitdirectory>`, **Open Ledger Folder…** picks a folder with that input, which hands over a snapshot of its files, so the folder is **read-only** and is forgotten when the page closes. Its ledgers open to read: the diagram, Flattened, Copy Diagram as Mermaid, Open Ledger… and Export Ledger… work. Every command that changes a ledger or the folder (adding, editing and removing people and transactions, Undo and Redo, New, Rename and Delete Ledger, Open Trash…) is off: the command menu marks it "Read-only", and the People pane and the status bar ("Read-only: <folder>") say why: "This browser can open a folder only to read it, so this ledger is read-only." A folder with no ledgers is refused ("There are no ledgers (.iou.json files) in <folder>."). The browser's own storage is untouched and editable; **Keep Ledgers in This Browser** goes back to it. A browser with neither says "This browser can't open a folder. The IOUinator desktop app keeps ledgers in a folder on your computer." It never tells the user to change browsers. **Export Ledger…** downloads the `.iou.json`; on desktop it asks where to save it.
- A new ledger is named `Ledger`, then `Ledger 2`…; **Rename Ledger…** gives it any other name. An empty folder gets one new ledger on first start (no welcome card).
- The ledger's name in the top bar opens a list of the folder's ledgers (also **Open Ledger…**). **New Ledger** (⌘N) makes a new ledger and opens it; **Delete Ledger** moves it to `.iouinator/trash/` with the notice "Moved Trip to the trash." and **Undo**. **Open Trash…** lists trashed ledgers with **Restore**; restoring a name that's taken adds ` 2`.
- The open ledger is remembered per folder and reopened on start.

### §8.3 Saving

- Every ledger change is saved immediately; saves to one file never overlap (a change during a save is saved right after it). Saves are atomic (temp file beside it, then rename), and the desktop app holds a `.<name>.lock` file while checking the version and writing.
- A failed save is retried twice (300 ms, 600 ms), then the status bar shows "Couldn't save <ledger>." with **Try Again** until a save works.
- Every read returns a version (SHA-256 of the bytes); a save with a stale version fails with a conflict. The conflict dialog, "<Ledger> changed somewhere else", offers **Save Mine as a Copy** (default; writes `<name> copy <YYYY-MM-DD-HHmmss>.iou.json` and loads the file on disk), **Keep Mine** and **Use Theirs**. Nothing merges and nothing is overwritten without the user choosing. A file deleted elsewhere offers the same three choices under "<Ledger> was deleted somewhere else".
- Changes made elsewhere (another window, a synced folder) are picked up when the window comes to the front and every 15 s while it's in front, when the ledger has nothing unsaved; they are one undo step with "Updated <ledger> with changes made elsewhere." and **Undo**.
- Every 30 s while anything is unsaved, and on closing, the unsaved ledger is written to the app's storage as a snapshot. On start, a snapshot newer than its file opens the recovery dialog: **Restore** (default) or **Discard**.

## §9 The window

- A top bar with the ledger's name (a button that opens the ledger list) and the Raw / Flattened switch.
- Three panes from left to right: **People** (narrow), **Transactions** (the form and the list), **Diagram** (the diagram and the Totals table). Below 900 px wide the Diagram pane moves under the Transactions pane; below 600 px all three stack.
- The status bar at the bottom holds notices and, in the browser, the storage note, then the Settings button.
- Desktop: default window 1200 × 760, minimum 480 × 400; it remembers its size and position.

## §10 Commands and keys

All commands are in one catalog, which feeds the keyboard, ⌘K, the menu bar, context menus, the Keyboard Shortcuts window (⌘/) and `docs/controls.md`.

The Keyboard Shortcuts window lists every key by group. Its **Press a Shortcut…** button starts a mode where each key press shows what it runs, read from the same catalog ("⌘K Command Menu", "⌘J No command", with "Not available right now." for a command that is off); the key runs nothing meanwhile. Escape always ends the mode and is never taken (it doesn't also close the window), and so do the **Stop** button, closing the window, any error while handling a key, and 30 seconds with no key pressed.

| Group | Command | Keys |
| --- | --- | --- |
| File | New Ledger | ⌘N |
| File | Open Ledger… |  |
| File | Open Ledger Folder… (desktop, and browsers with the File System Access API) | ⌘O |
| File | Keep Ledgers in This Browser (those browsers) |  |
| File | Rename Ledger…, Delete Ledger, Export Ledger…, Open Trash… |  |
| File | Settings… | ⌘, |
| Edit | Undo, Redo | ⌘Z, ⇧⌘Z |
| Edit | Add Person | P |
| Edit | Rename Person…, Show Their Transactions, Remove Person |  |
| Edit | New Transaction | N |
| Edit | Edit Transaction… | Enter (on the chosen transaction) |
| Edit | Swap Direction |  |
| Edit | Delete Transaction | Delete, Backspace (on the chosen transaction) |
| Edit | Copy Diagram as Mermaid | ⇧⌘C |
| View | Flatten Debts | F |
| View | Clear Filter | Esc (in the list) |
| View | System / Light / Dark Appearance |  |
| Help | Command Menu | ⌘K |
| Help | Keyboard Shortcuts | ⌘/ |

Context menus:

- A person in the People list: Rename Person…, Show Their Transactions, then Remove Person.
- A transaction in the list: Edit Transaction…, Swap Direction, then Delete Transaction.

## §11 Settings

Stored in the app's own storage (desktop: its data folder; browser: local storage), not in the ledger folder:

- Theme: System (default), Light, Dark.
- View: Raw (default) or Flattened.

In the browser, a change in one tab reaches the other open tabs at once.

## §12 Desktop

- Electron, with the web build inside. Native menu bar from the command catalog. One window. Closing the window quits on every platform.
- On macOS the window has no title bar: the traffic lights sit in the app's own top bar, which drags the window. Windows and Linux keep their own frame and menu bar.
- `IOUINATOR_HEADLESS=1` runs with no visible window, for checks.
- Updates: the app checks GitHub releases on start (once a day at most) and says "IOUinator X.Y is available." with **Download** in the status bar; nothing installs on its own.

## §13 Browser

- One static build, served from any path. Works offline once loaded; Mermaid is bundled, never fetched from a CDN.

## §14 Accessibility

- Every control is reachable with Tab and has an accessible name. The Totals table is the accessible form of the diagram; the diagram has the label "Who owes whom".
- Notices are announced in a live region. Reduced motion turns off transitions.

## §15 Decisions

- Cents as integers: totals add up exactly.
- The raw view keeps both directions so nothing is hidden; netting happens only in the flattened view.
- Flattening cancels loops instead of computing the fewest payments, so every remaining debt is between people who actually transacted.
- Mermaid for the diagram, lazy-loaded and pinned, because it lays out graphs well and its text can be copied into Markdown.
- JSON files: an open format that diffs well and holds people with no transactions.

## §16 Open questions

- None at the moment.
