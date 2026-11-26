# Features

IOUinator keeps track of who owes whom. You list the people, record each debt between two of them with what it was for, and a diagram shows the totals. [Controls](controls.md) lists the keys.

## People

Type a name in the People pane and press **Enter**. Names are unique, ignoring case. Each person shows a balance: `+$12.50` when others owe them, `−$4.00` when they owe others, or `settled`. Right-click a person to rename them or remove them. Removing someone also removes every transaction they are in, and the notice's **Undo** brings it all back. Click a person to see only their transactions.

## Transactions

A transaction says one person owes another an amount, for something: "Sam owes Alex $12.50 for Pizza". The form needs all four: From, To, Amount and For. Amounts are dollars and cents, typed as `12.5`, `$12.50` or `1,200`. After you add one, From and To stay as they were and the keyboard goes back to Amount, so a run of debts between the same two people is quick. In the list, **↑** and **↓** choose a transaction, **Enter** or a double-click edits it, and **Delete** removes it, with **Undo** in the notice. Right-click a transaction to swap its direction.

## Who owes whom

The Diagram pane draws each person as a box and each debt as an arrow from the person who owes to the person owed, labelled with the total. The Totals table under it lists the same arrows as rows, for screen readers and for copying. Click an arrow, a Totals row or a person's box to show just those transactions; **Esc** or **Clear** shows all of them again. **⇧⌘C** copies the diagram as Mermaid text, to paste into Markdown.

## Flattening

**Flattened** (or **F**) shows the fewest debts that settle everyone the same way. First each pair is netted: if Sam owes Alex $10 and Alex owes Sam $4, Sam owes Alex $6. Then loops cancel: when Sam owes Alex, Alex owes Kim and Kim owes Sam, the smallest of the three comes off all of them, so at least one arrow drops out. Every balance stays the same. A line above the diagram says how many debts went and how much less money changes hands. **Raw** shows every debt as recorded, in both directions.

## Undo

**⌘Z** undoes the last change to the ledger and **⇧⌘Z** redoes it, back through the last 200 changes. Opening another ledger starts afresh.

## Ledger files

Each ledger is one JSON file, `Name.iou.json`, saved a moment after every change. The desktop app keeps them in a folder you choose (Documents/IOUinator by default); the browser keeps them in its own storage, or in a folder on disk in Chrome and Edge. Firefox and Safari can open a folder only to read it: its ledgers show with their diagram and can be exported, but nothing in them can change, and the browser's own storage stays the place to edit. Click the ledger's name to open another one, or use the **File** menu to make, rename, delete or export one. Deleted ledgers go to the trash, where they can be restored. If the file changes somewhere else while it is open, IOUinator takes the change when nothing is unsaved, or asks which to keep. A file from a newer IOUinator, or a damaged one, is never opened or written over.

## Commands and shortcuts

**⌘K** opens the command menu, which runs any command by name. **⌘/** opens the Keyboard Shortcuts window, built from the same list as the menus. Its **Press a Shortcut…** button shows what any key you press would run, without running it; **Esc** or **Stop** ends it.

## Settings and appearance

Settings (**⌘,**) sets the appearance (System, Light or Dark) and whether the diagram starts Raw or Flattened. Both are kept for next time.

## Keyboard focus

**Tab** moves through the window, and wherever the keyboard is shows in the app's own colour, in light and dark. The transaction list and each row of choices (Raw or Flattened, the appearance) are one Tab stop each: the arrows move inside them, and the keyboard is always on the chosen row or choice. After a delete, an undo or closing a dialog, the keyboard is back on the row the list has chosen.

## Desktop and browser

The same app runs in a browser tab and as a desktop app for macOS, Windows and Linux. The desktop app has a native menu bar, a window without a title bar on macOS, and checks for new releases.
