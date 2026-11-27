// Browser scenarios for each feature in docs/features.md: the built web client, with empty browser storage.
import {
  FIRST_LEDGER,
  addPeople,
  addTransaction,
  diagramPane,
  expect,
  notice,
  openApp,
  peoplePane,
  personField,
  runCommand,
  storedLedger,
  test,
  totals,
  transactionList,
  waitForApp,
} from './fixtures.ts';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const person = (page: Page, name: string) =>
  peoplePane(page).getByRole('button', { name: new RegExp(`^${name} `) });
/** The bar over the list that says which transactions it shows. */
const filterBar = (page: Page) => page.locator('.iou-filter');

/** Presses a key with no text field holding the keyboard, as after clicking an empty part of the window. */
async function pressKey(page: Page, key: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(key);
}

const row = (page: Page, text: string) => transactionList(page).getByRole('option', { name: text });
/** The list's one Tab stop: the chosen row, or the last when none is. */
const currentRow = (page: Page) => transactionList(page).locator('[tabindex="0"]');

/**
 * How the focused element shows focus: `ring` for the app's own outline in the theme's focus colour,
 * `chosen` for a list row drawn in the accent, `browser` for the browser's default outline, `none` for nothing.
 */
function focusLook(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const probe = document.createElement('i');
    probe.style.color = 'var(--iou-focus)';
    document.body.append(probe);
    const focusColour = getComputedStyle(probe).color;
    probe.remove();
    const s = getComputedStyle(el);
    if (s.outlineStyle === 'auto' || (s.outlineStyle !== 'none' && s.outlineColor !== focusColour))
      return 'browser';
    if (s.outlineStyle === 'solid' && parseFloat(s.outlineWidth) >= 2) return 'ring';
    if (el.getAttribute('aria-selected') === 'true' && s.backgroundColor === focusColour) return 'chosen';
    return 'none';
  });
}

/** Sam, Alex and Kim, owing round a loop, and Alex owing Sam a little back. */
async function loop(page: Page): Promise<void> {
  await addPeople(page, 'Sam', 'Alex', 'Kim');
  await addTransaction(page, 'Sam', 'Alex', '10', 'Pizza');
  await addTransaction(page, 'Alex', 'Kim', '10', 'Taxi');
  await addTransaction(page, 'Kim', 'Sam', '15', 'Tickets');
  await addTransaction(page, 'Alex', 'Sam', '4', 'Coffee');
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test.describe('People', () => {
  test('adds people with their balances, refuses a repeated name, renames and removes with Undo', async ({
    page,
  }) => {
    // With fewer than two people the transactions pane says one thing, and the filter hint waits for two.
    await expect(page.getByText('Add at least two people to record a transaction.')).toBeVisible();
    await expect(page.getByText('No transactions yet.')).toBeHidden();
    await addPeople(page, 'Sam');
    await expect(page.getByText('Click a person to see only their transactions.')).toBeHidden();
    await addPeople(page, 'Alex');
    await expect(page.getByText('Click a person to see only their transactions.')).toBeVisible();
    await expect(person(page, 'Sam')).toContainText('settled');
    await personField(page).fill('sam');
    await personField(page).press('Enter');
    await expect(peoplePane(page).getByRole('alert')).toBeVisible();

    await addTransaction(page, 'Sam', 'Alex', '12.50', 'Pizza');
    await expect(person(page, 'Alex')).toContainText('+$12.50');
    await expect(person(page, 'Sam')).toContainText('−$12.50');

    await person(page, 'Sam').click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Rename Person/ }).click();
    const rename = page.getByRole('dialog', { name: 'Rename Sam' });
    await rename.getByLabel('Name').fill('Samira');
    await rename.getByLabel('Name').press('Enter');
    await expect(person(page, 'Samira')).toBeVisible();

    await person(page, 'Samira').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Remove Person' }).click();
    await expect(notice(page)).toContainText('Removed Samira and 1 transaction.');
    await expect(transactionList(page)).toBeHidden();
    await notice(page).getByRole('button', { name: 'Undo' }).click();
    await expect(row(page, 'Samira owes Alex $12.50 for Pizza')).toBeVisible();
  });
});

test.describe('Transactions', () => {
  test('need what they were for; are edited, swapped and deleted from the list', async ({ page }) => {
    await addPeople(page, 'Sam', 'Alex');
    const form = page.getByRole('form', { name: 'New transaction' });
    await form.getByLabel('Amount').fill('5');
    await form.getByLabel('Amount').press('Enter');
    await expect(form.getByRole('alert')).toHaveText('Say what the transaction is for.');
    // The error marks the field it is about and takes the keyboard there.
    await expect(form.getByLabel('For')).toBeFocused();
    await expect(form.getByLabel('For')).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByLabel('Amount')).toHaveAttribute('aria-invalid', 'false');
    await addTransaction(page, 'Sam', 'Alex', '$1,200.5', 'Rent');
    await expect(row(page, 'Sam owes Alex $1,200.50 for Rent')).toBeVisible();
    await expect(form.getByLabel('Amount'), 'focus goes back to Amount').toBeFocused();
    // An error left behind goes when you move on to something else.
    await form.getByLabel('Amount').fill('x');
    await form.getByLabel('Amount').press('Enter');
    await expect(form.getByRole('alert')).toBeVisible();
    await expect(form.getByLabel('Amount')).toHaveAttribute('aria-invalid', 'true');
    await currentRow(page).focus();
    await expect(form.getByRole('alert')).toBeHidden();
    await form.getByLabel('Amount').fill('');

    await row(page, 'Sam owes Alex $1,200.50 for Rent').dblclick();
    const edit = page.getByRole('dialog', { name: 'Edit Transaction' });
    await expect(edit.getByLabel('Amount')).toBeFocused();
    await edit.getByLabel('Amount').fill('1300');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(row(page, 'Sam owes Alex $1,300.00 for Rent')).toBeVisible();

    await row(page, 'Sam owes Alex $1,300.00 for Rent').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Swap Direction' }).click();
    await expect(row(page, 'Alex owes Sam $1,300.00 for Rent')).toBeVisible();

    await addTransaction(page, 'Sam', 'Alex', '3', 'Gum');
    await currentRow(page).focus();
    await page.keyboard.press('ArrowUp');
    await expect(row(page, 'Alex owes Sam $1,300.00 for Rent')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Delete');
    await expect(notice(page)).toContainText('Deleted Rent.');
    await expect(transactionList(page).getByRole('option')).toHaveCount(1);
  });

  test('From and To: while the list is open, Tab and Shift+Tab move through the names', async ({ page }) => {
    await addPeople(page, 'Sam', 'Alex', 'Jo');
    const form = page.getByRole('form', { name: 'New transaction' });
    const from = form.getByRole('combobox', { name: 'From' });
    const to = form.getByRole('combobox', { name: 'To' });
    const chosen = page.getByRole('listbox').getByRole('option', { selected: true });

    // Closed, Tab goes on to the next field.
    await from.focus();
    await page.keyboard.press('Tab');
    await expect(to).toBeFocused();

    await page.keyboard.press('Space');
    await expect(to).toHaveAttribute('aria-expanded', 'true');
    await expect(chosen).toHaveText(/Alex/);
    await page.keyboard.press('Tab');
    await expect(chosen).toHaveText(/Jo/);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(chosen).toHaveText(/Sam/);
    await expect(to, 'focus stays on the picker').toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(to).toHaveAttribute('aria-expanded', 'false');
    await expect(to).toHaveText('Jo');

    // Picking the person in the other picker swaps the two.
    await from.click();
    await page.getByRole('option', { name: 'Jo', exact: true }).click();
    await expect(from).toHaveText('Jo');
    await expect(to).toHaveText('Sam');

    // A letter jumps to a name; Enter while closed adds, like the other fields.
    await to.focus();
    await page.keyboard.press('a');
    await expect(to).toHaveText('Alex');
    await form.getByLabel('Amount').fill('7');
    await form.getByLabel('For').fill('Snacks');
    await to.press('Enter');
    await expect(row(page, 'Jo owes Alex $7.00 for Snacks')).toBeVisible();

    // In Edit Transaction, Escape closes the list, not the dialog.
    await row(page, 'Jo owes Alex $7.00 for Snacks').dblclick();
    const edit = page.getByRole('dialog', { name: 'Edit Transaction' });
    const editTo = edit.getByRole('combobox', { name: 'To' });
    await editTo.focus();
    await page.keyboard.press('ArrowDown');
    await expect(editTo).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(editTo).toHaveAttribute('aria-expanded', 'false');
    await expect(editTo).toHaveText('Alex');
    await expect(edit).toBeVisible();
  });
});

test.describe('Who owes whom', () => {
  test('draws an arrow per debt with its total; an arrow, a person or a Totals row filters the list', async ({
    page,
  }) => {
    await loop(page);
    const drawing = diagramPane(page).locator('.iou-drawing');
    await expect(drawing.locator('.iou-clickable.flowchart-link')).toHaveCount(4);
    await expect(drawing).toContainText('$15.00');
    await expect(totals(page).getByRole('row')).toHaveCount(5);

    await drawing.locator('g.label.iou-clickable').filter({ hasText: '$15.00' }).click();
    await expect(filterBar(page)).toHaveText(/^Showing Kim → Sam/);
    await expect(transactionList(page).getByRole('option')).toHaveCount(1);
    await pressKey(page, 'Escape');
    await expect(transactionList(page).getByRole('option')).toHaveCount(4);

    await drawing.locator('g.node.iou-clickable').filter({ hasText: 'Kim' }).click();
    await expect(filterBar(page)).toHaveText(/^Showing Kim’s transactions/);
    await expect(transactionList(page).getByRole('option')).toHaveCount(2);

    await totals(page)
      .getByRole('button', { name: /Sam owes Alex \$10\.00/ })
      .click();
    await expect(filterBar(page)).toHaveText(/^Showing Sam → Alex/);
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(transactionList(page).getByRole('option')).toHaveCount(4);
  });
});

test.describe('Flattening', () => {
  test('nets each pair and cancels the loop, keeping every balance', async ({ page }) => {
    await loop(page);
    await pressKey(page, 'f');
    await expect(page.getByRole('radio', { name: 'Flattened' })).toBeChecked();
    await expect(diagramPane(page)).toContainText('4 debts → 2 · $26.00 less changing hands.');
    await expect(totals(page).getByRole('row')).toHaveCount(3);
    await expect(totals(page)).toContainText('$4.00');
    await expect(totals(page)).toContainText('$9.00');
    await expect(person(page, 'Sam')).toContainText('+$9.00');
    // An arrow in the flattened view shows the pair's transactions both ways.
    await totals(page)
      .getByRole('button', { name: /Alex owes Kim/ })
      .click();
    await expect(filterBar(page)).toHaveText(/^Showing Alex ↔ Kim/);
    await page.getByRole('radio', { name: 'Raw' }).click();
    await expect(filterBar(page)).toHaveText(/^Showing Alex → Kim/);
  });
});

test.describe('Undo', () => {
  test('⌘Z and ⇧⌘Z step through changes to the ledger', async ({ page }) => {
    await addPeople(page, 'Sam', 'Alex');
    await addTransaction(page, 'Sam', 'Alex', '5', 'Taxi');
    await pressKey(page, 'ControlOrMeta+KeyZ');
    await expect(transactionList(page)).toBeHidden();
    await page.keyboard.press('ControlOrMeta+Shift+KeyZ');
    await expect(row(page, 'Sam owes Alex $5.00 for Taxi')).toBeVisible();
  });
});

test.describe('Ledger files', () => {
  test('saves the ledger as JSON in the browser and opens it again', async ({ page }) => {
    await addPeople(page, 'Sam', 'Alex');
    await addTransaction(page, 'Sam', 'Alex', '7', 'Lunch');
    await expect
      .poll(async () => JSON.parse((await storedLedger(page, FIRST_LEDGER)) ?? '{}').transactions?.length)
      .toBe(1);
    await page.reload();
    await expect(row(page, 'Sam owes Alex $7.00 for Lunch')).toBeVisible();

    await runCommand(page, 'New Ledger');
    await expect(page.getByRole('button', { name: /^Ledger: Ledger 2\./ })).toBeVisible();
    await expect(peoplePane(page)).toContainText('No one yet.');
  });

  test('opens a folder read-only where the browser has no folder picker (Firefox, Safari)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showDirectoryPicker', { value: undefined });
    });
    await page.reload();
    await waitForApp(page);
    const chooser = page.waitForEvent('filechooser');
    await runCommand(page, 'Open Ledger Folder');
    await (await chooser).setFiles(fileURLToPath(new URL('folders/Shared', import.meta.url)));

    await expect(page.getByRole('button', { name: /^Ledger: Trip\./ })).toBeVisible();
    await expect(row(page, 'Sam owes Alex $12.50 for Pizza')).toBeVisible();
    await expect(notice(page)).toContainText('Read-only: Shared');
    await expect(peoplePane(page)).toContainText('only to read it');
    await expect(personField(page)).toBeHidden();
    await expect(page.getByRole('form', { name: 'New transaction' })).toHaveCount(0);

    // Commands that write are off, and say why.
    await page.keyboard.press('ControlOrMeta+KeyK');
    await page.keyboard.type('New Ledger');
    const entry = page.getByRole('option', { name: /New Ledger/ });
    await expect(entry).toHaveAttribute('aria-disabled', 'true');
    await expect(entry).toContainText('Read-only');
    await page.keyboard.press('Enter');
    await expect(notice(page)).toContainText('only to read it');
    await page.keyboard.press('Escape');
    await row(page, 'Sam owes Alex $12.50 for Pizza').dblclick();
    await expect(page.getByRole('dialog', { name: 'Edit Transaction' })).toHaveCount(0);

    // Reading still works: the diagram flattens and the ledger exports.
    await pressKey(page, 'f');
    await expect(totals(page)).toContainText('$12.50');
    const download = page.waitForEvent('download');
    await runCommand(page, 'Export Ledger');
    expect((await download).suggestedFilename()).toBe('Trip.iou.json');

    // The browser's own storage was left alone and is editable again.
    await runCommand(page, 'Keep Ledgers in This Browser');
    await expect(page.getByRole('button', { name: /^Ledger: Ledger\./ })).toBeVisible();
    await addPeople(page, 'Kim');
  });
});

test.describe('Commands and shortcuts', () => {
  test('the command menu runs commands; the Keyboard Shortcuts window lists the keys', async ({ page }) => {
    await addPeople(page, 'Sam', 'Alex');
    await runCommand(page, 'Flatten Debts');
    await expect(page.getByRole('radio', { name: 'Flattened' })).toBeChecked();
    await pressKey(page, 'ControlOrMeta+Slash');
    const shortcuts = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
    await expect(shortcuts).toContainText('New Transaction');
    await page.keyboard.press('Escape');
    await expect(shortcuts).toBeHidden();
    await pressKey(page, 'n');
    await expect(page.getByRole('form', { name: 'New transaction' }).getByLabel('Amount')).toBeFocused();
  });

  test('"press a shortcut" names what a key runs, and Escape or Stop always gives the keys back', async ({
    page,
  }) => {
    await addPeople(page, 'Sam', 'Alex');
    await pressKey(page, 'ControlOrMeta+Slash');
    const shortcuts = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
    const says = shortcuts.getByRole('status');
    await shortcuts.getByRole('button', { name: 'Press a Shortcut…' }).click();
    await page.keyboard.press('f');
    await expect(says).toContainText('Flatten Debts');
    await expect(page.getByRole('radio', { name: 'Raw' })).toBeChecked();
    await page.keyboard.press('ControlOrMeta+j');
    await expect(says).toContainText('No command');
    await page.keyboard.press('ControlOrMeta+Slash');
    await expect(says).toContainText('Keyboard Shortcuts');
    await expect(shortcuts).toBeVisible();
    // Escape leaves the mode and keeps the window open; the next Escape closes it as usual.
    await page.keyboard.press('Escape');
    await expect(says).toHaveText('See what a key does.');
    await expect(shortcuts).toBeVisible();
    await shortcuts.getByRole('button', { name: 'Press a Shortcut…' }).click();
    await shortcuts.getByRole('button', { name: 'Stop' }).click();
    await expect(says).toHaveText('See what a key does.');
    await page.keyboard.press('Escape');
    await expect(shortcuts).toBeHidden();
    await pressKey(page, 'f');
    await expect(page.getByRole('radio', { name: 'Flattened' })).toBeChecked();
  });
});

test.describe('Keyboard focus', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`the app draws every focus itself, never the browser's outline (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await addPeople(page, 'Sam', 'Alex');
      await addTransaction(page, 'Sam', 'Alex', '5', 'Taxi');
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      // Tab through the whole window: every stop shows the app's own focus.
      const seen = new Set<string>();
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        const what = await page.evaluate(() => {
          const el = document.activeElement;
          return el && el !== document.body
            ? `${el.tagName}:${el.getAttribute('aria-label') ?? el.textContent}`
            : '';
        });
        if (!what) continue;
        expect(await focusLook(page), what).toMatch(/^(ring|chosen)$/);
        seen.add(what);
      }
      expect(seen.size, 'Tab reached the controls').toBeGreaterThan(8);
    });
  }

  test('↑ ↓ move the chosen row and the keyboard together; Undo, Delete and a dialog keep them together', async ({
    page,
  }) => {
    await addPeople(page, 'Sam', 'Alex');
    await addTransaction(page, 'Sam', 'Alex', '1', 'One');
    await addTransaction(page, 'Sam', 'Alex', '2', 'Two');
    await addTransaction(page, 'Sam', 'Alex', '3', 'Three');
    const one = row(page, 'for One');
    const two = row(page, 'for Two');
    const three = row(page, 'for Three');
    const chosenAndFocused = async (r: typeof one) => {
      await expect(r).toBeFocused();
      await expect(r).toHaveAttribute('aria-selected', 'true');
      expect(await focusLook(page)).toBe('chosen');
    };

    // One Tab stop, the last row when none is chosen.
    await expect(currentRow(page)).toHaveCount(1);
    await currentRow(page).focus();
    await chosenAndFocused(three);
    await page.keyboard.press('ArrowUp');
    await chosenAndFocused(two);
    await page.keyboard.press('Home');
    await chosenAndFocused(one);
    await page.keyboard.press('End');
    await chosenAndFocused(three);
    await one.click();
    await chosenAndFocused(one);

    // Editing and closing the dialog brings the keyboard back to the same row.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const edit = page.getByRole('dialog', { name: 'Edit Transaction' });
    await expect(edit).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(edit).toBeHidden();
    await chosenAndFocused(two);

    // Delete moves both to the next row; so does undoing the add of the focused row.
    await page.keyboard.press('Delete');
    await chosenAndFocused(three);
    await page.keyboard.press('ControlOrMeta+KeyZ');
    await expect(two).toBeVisible();
    await chosenAndFocused(three);
    await page.keyboard.press('ControlOrMeta+KeyZ');
    await expect(three).toBeHidden();
    await chosenAndFocused(two);

    // From the right-click menu too.
    await one.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete Transaction' }).click();
    await chosenAndFocused(two);
  });

  test('with reduced motion, a menu opened from the keyboard takes it at once, and Esc closes it', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await addPeople(page, 'Sam', 'Alex');
    await addTransaction(page, 'Sam', 'Alex', '5', 'Taxi');
    const taxi = row(page, 'for Taxi');
    await currentRow(page).focus();
    await page.keyboard.press('ContextMenu');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem').first(), 'the menu has the keyboard').toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(taxi).toBeFocused();
    await expect(taxi, 'Esc closed the menu, and left the row chosen').toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('a radio row is one Tab stop and the arrows move the choice and the ring together', async ({
    page,
  }) => {
    const view = page.getByRole('radiogroup', { name: 'Diagram view' });
    await view.getByRole('radio', { checked: true }).focus();
    await expect(view.getByRole('radio', { name: 'Raw' })).toBeFocused();
    await expect(view.locator('[tabindex="0"]')).toHaveCount(1);
    await page.keyboard.press('ArrowRight');
    await expect(view.getByRole('radio', { name: 'Flattened' })).toBeFocused();
    await expect(view.getByRole('radio', { name: 'Flattened' })).toBeChecked();
    expect(await focusLook(page)).toBe('ring');
    // A command changes the choice without taking the keyboard from where it is.
    await pressKey(page, 'f');
    await expect(view.getByRole('radio', { name: 'Raw' })).toBeChecked();
    await expect(view.getByRole('radio', { name: 'Raw' })).not.toBeFocused();
  });
});

test.describe('Settings and appearance', () => {
  test('Settings switches the appearance and the diagram view, and keeps them', async ({ page }) => {
    await runCommand(page, 'Settings');
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('radio', { name: 'Dark' }).click();
    await settings.getByRole('radio', { name: 'Flattened' }).click();
    await settings.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('radio', { name: 'Flattened' })).toBeChecked();
  });
});
