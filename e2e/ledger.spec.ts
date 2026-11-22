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
} from './fixtures.ts';
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
    await addPeople(page, 'Sam', 'Alex');
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
    await addTransaction(page, 'Sam', 'Alex', '$1,200.5', 'Rent');
    await expect(row(page, 'Sam owes Alex $1,200.50 for Rent')).toBeVisible();
    await expect(form.getByLabel('Amount'), 'focus goes back to Amount').toBeFocused();

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
    await transactionList(page).focus();
    await page.keyboard.press('ArrowUp');
    await expect(row(page, 'Alex owes Sam $1,300.00 for Rent')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Delete');
    await expect(notice(page)).toContainText('Deleted Rent.');
    await expect(transactionList(page).getByRole('option')).toHaveCount(1);
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
