# IOUinator glossary

IOUinator keeps track of who owes whom. These are the words it uses for its own things, in the UI, the docs and the code.

## Language

### People and transactions

**Person**: Someone in the group, with a name unique in the **ledger**. Transactions refer to a person by id, so renaming keeps them. _Avoid_: member, user, participant

**Transaction**: One debt: **From** owes **To** an **amount** for a **description**. "Sam owes Alex $10 for Pizza." _Avoid_: payment, entry, IOU, record

**From**: The person who owes in a **transaction**, where its arrow starts. _Avoid_: payer, debtor, sender

**To**: The person who is owed in a **transaction**, where its arrow ends. _Avoid_: payee, creditor, receiver

**Amount**: A dollar value kept as whole cents and shown as `$1,250.00`. `cents` in the code. _Avoid_: value, sum

**Description**: What a **transaction** is for, required. Shown as **For** in the form. _Avoid_: memo, note, label

**Balance**: What a **person** is owed minus what they owe, over every **transaction**: "+$12.50", "−$4.00" or "settled". It is the same in the **raw** and **flattened** views. _Avoid_: net, total

### The diagram

**Debt**: One arrow in the diagram and one row of **Totals**: what one **person** owes another in the current view. `Debt` in the code. _Avoid_: edge, link, total (for the arrow itself)

**Raw view**: The diagram with one **debt** per direction between two people, the sum of every **transaction** that way. The default. _Avoid_: original, unflattened

**Flattened view**: The diagram after **flattening**. **Flatten Debts** and the Raw / Flattened switch turn it on. `view: 'flat'` in the code. _Avoid_: simplified, optimised, settled view

**Flattening**: Netting each pair of people, then cancelling **loops** by subtracting each loop's smallest debt from every debt in it. **Transactions** never change. _Avoid_: simplifying, settling up, optimising

**Loop**: Debts that go round and come back: A owes B, B owes C, C owes A. _Avoid_: cycle (in the UI and docs; the code may say cycle)

**Totals**: The table under the diagram that lists the same **debts** as rows. It is the keyboard and screen-reader way to the diagram.

**Filter**: Showing only some **transactions**: those behind a **debt** ("Sam → Alex") or those a **person** is in. **Clear** shows them all again. _Avoid_: search

### Ledgers

**Ledger**: One group's **people** and **transactions**, kept in one **ledger file**. One is open at a time. _Avoid_: group, book, sheet, project

**Ledger file**: A JSON file, `<name>.iou.json`, holding one **ledger**. _Avoid_: document, save file

**Ledger folder**: The folder that holds the **ledger files**: Documents/IOUinator or one you choose on desktop, or the browser's own storage. _Avoid_: library, workspace

**Read-only folder**: A **ledger folder** that Firefox or Safari opened with the file input: its **ledgers** can be read and exported but not changed. _Avoid_: locked, view-only

**Trash**: Where a deleted **ledger** goes, `.iouinator/trash/` in the **ledger folder**, until **Open Trash…** restores it. _Avoid_: recycle bin

**Conflict**: A **ledger file** that changed or was deleted elsewhere while the **ledger** had unsaved changes. IOUinator asks whether to save yours as a copy, keep yours or use theirs.

**Snapshot**: A copy of an unsaved **ledger** kept in the app's storage, offered for restoring on the next start. _Avoid_: backup, autosave file

### The app

**Command**: One action the app can do, with its title and shortcut. The command menu, the shortcuts, the context menus, the menu bar and the Keyboard Shortcuts window all come from one list of commands. _Avoid_: action

**Command menu**: The search box opened with **⌘K** that finds and runs a **command**. _Avoid_: command palette

**Chosen transaction**: The one row of the transaction list that Enter, Delete and the context menu act on. `chosen` in the code. _Avoid_: selected, active, current

**Status bar**: The strip at the bottom of the window with **notices** and the Settings button.

**Notice**: A short message in the **status bar**, sometimes with an action such as **Undo**. _Avoid_: toast, snackbar

## Relationships

- A **ledger folder** holds many **ledger files**; each **ledger file** holds one **ledger**.
- A **ledger** holds **people** and **transactions**; each **transaction** names two different **people**.
- **Debts** come from the **transactions**: summed per direction in the **raw view**, netted and with **loops** cancelled in the **flattened view**.
- Every **person** has the same **balance** in both views.

## Flagged ambiguities

- "Debt" is the arrow in the diagram, not a single **transaction**: one **debt** can sum many **transactions**.
- "From owes To": the arrow points the way the money is owed, not the way it was paid. A transaction for money Sam lent Alex is From Alex, To Sam.
- "Cycle" and "loop" mean the same thing; the UI and docs say **loop**.
