// Shared scenario setup. Every page starts with empty browser storage, so settings and the ledger start fresh.
import { expect, test as base, type Locator, type Page } from '@playwright/test';

export { expect };

/** Every page fails its test if it logged an error or threw one. */
export const test = base.extend<{ checkErrors: void }>({
  checkErrors: [
    async ({ page }, use) => {
      const errors = watchErrors(page);
      await use();
      expect(errors, 'errors on the page').toEqual([]);
    },
    { auto: true },
  ],
});

/** The name of the ledger the app makes in an empty folder. */
export const FIRST_LEDGER = 'Ledger';

/** Open the app the way a user does, and wait until it has drawn. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await waitForApp(page);
}

/** The app has drawn its panes. */
export async function waitForApp(page: Page): Promise<void> {
  await expect(personField(page)).toBeVisible();
}

export const personField = (page: Page) => page.getByRole('textbox', { name: 'Name of a person to add' });
export const peoplePane = (page: Page) => page.getByRole('region', { name: 'People' });
export const transactionsPane = (page: Page) => page.getByRole('region', { name: 'Transactions' });
export const diagramPane = (page: Page) => page.getByRole('region', { name: 'Who owes whom' });
export const transactionList = (page: Page) => page.getByRole('listbox', { name: 'Transactions' });
export const totals = (page: Page) => page.getByRole('table', { name: 'Totals' });

/** Adds people by typing each name and pressing Enter. */
export async function addPeople(page: Page, ...names: string[]): Promise<void> {
  for (const name of names) {
    await personField(page).fill(name);
    await personField(page).press('Enter');
    await expect(peoplePane(page).getByRole('button', { name: new RegExp(`^${name} `) })).toBeVisible();
  }
}

/** Records a transaction with the form: `from` owes `to` `amount` for `description`. */
/** Picks a name in a From or To picker with the mouse. */
export async function choosePerson(picker: Locator, name: string): Promise<void> {
  await picker.click();
  await picker.page().getByRole('option', { name, exact: true }).click();
  await expect(picker).toHaveText(name);
}

export async function addTransaction(
  page: Page,
  from: string,
  to: string,
  amount: string,
  description: string,
): Promise<void> {
  const form = page.getByRole('form', { name: 'New transaction' });
  await choosePerson(form.getByRole('combobox', { name: 'From' }), from);
  await choosePerson(form.getByRole('combobox', { name: 'To' }), to);
  await form.getByLabel('Amount').fill(amount);
  await form.getByLabel('For').fill(description);
  await form.getByLabel('For').press('Enter');
  await expect(form.getByLabel('For')).toHaveValue('');
}

/** Collect uncaught errors and console errors on the page. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

/** The ⌘K menu: a dialog named "Command menu" holding a combobox, with an option for each entry. */
export const commandMenu = (page: Page) => page.getByRole('dialog', { name: 'Command menu' });

/** Run a command from ⌘K by its name, typing the way a person does. */
export async function runCommand(page: Page, name: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+KeyK');
  const menu = commandMenu(page);
  await expect(menu.getByRole('combobox')).toBeFocused();
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
}

/** A ledger file's text in the browser's own storage, or null when there is none. */
export function storedLedger(page: Page, name: string): Promise<string | null> {
  return page.evaluate(async (file) => {
    const root = await navigator.storage.getDirectory();
    try {
      const ledgers = await root.getDirectoryHandle('ledgers');
      return await (await (await ledgers.getFileHandle(file)).getFile()).text();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') return null;
      throw e;
    }
  }, `${name}.iou.json`);
}

/** The status bar's notice. */
export const notice = (page: Page) => page.locator('.iou-notice');
