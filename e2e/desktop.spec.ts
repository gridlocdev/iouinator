// Desktop smoke test: the built Electron app starts headless (no window, Dock icon or system dialog) on a
// throwaway profile and records a debt. `just e2e-desktop` builds it first. The throwaway profile matters: the app
// must never read the owner's settings or window state.
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { addPeople, addTransaction, expect, personField, test, waitForApp, watchErrors } from './fixtures.ts';

const DESKTOP = fileURLToPath(new URL('../apps/desktop', import.meta.url));

/** True while the process is still running. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Closes the app and checks that its main process is gone (Electron's helpers exit with it). */
async function closeApp(app: ElectronApplication): Promise<void> {
  const pid = app.process().pid!;
  await app.close();
  await expect.poll(() => alive(pid), { message: 'no Electron process is left running' }).toBe(false);
}

/** A first start on a fresh profile asks where to keep ledgers: take Documents/IOUinator (inside the profile). */
async function firstStart(window: Page): Promise<void> {
  const question = window.getByRole('dialog', { name: 'Where should IOUinator keep ledgers?' });
  await question.getByRole('button', { name: 'Use Documents/IOUinator' }).click();
  await expect(question).toBeHidden();
  await waitForApp(window);
}

test.describe('Desktop and browser', () => {
  test('the desktop app starts headless, records a debt, keeps its settings and grants nothing but the clipboard', async () => {
    // realpath: macOS's temp folder is behind a symlink, and the app may report the real path.
    const temp = realpathSync(mkdtempSync(path.join(tmpdir(), 'iouinator-e2e-')));
    const profile = path.join(temp, 'profile');
    const launch = () =>
      electron.launch({
        cwd: DESKTOP,
        // The main script by name (the built one package.json points at), so nothing else is read as an argument.
        args: ['out/main.js'],
        env: { ...process.env, IOUINATOR_HEADLESS: '1', IOUINATOR_USER_DATA: profile },
      });
    try {
      const app = await launch();
      try {
        expect(await app.evaluate(({ app }) => app.getPath('userData')), 'the throwaway profile').toBe(
          profile,
        );
        const window = await app.firstWindow();
        const errors = watchErrors(window);
        await firstStart(window);
        // The status bar names the folder the ledgers are in.
        await expect(window.locator('.iou-status')).toContainText('Ledgers in IOUinator');
        if (process.platform === 'darwin') {
          // No title bar: the page's top row drags the window, and the buttons in it still click.
          const chrome = await window.evaluate(() => {
            const region = (selector: string) =>
              getComputedStyle(document.querySelector(selector)!).getPropertyValue('-webkit-app-region');
            return {
              unified: document.documentElement.classList.contains('iou-unified'),
              top: region('.iou-top'),
              button: region('.iou-top button'),
            };
          });
          expect(chrome).toMatchObject({ unified: true, top: 'drag', button: 'no-drag' });
        }
        await addPeople(window, 'Sam', 'Alex');
        await addTransaction(window, 'Sam', 'Alex', '12.50', 'Pizza');
        // The one ledger, `Ledger.iou.json`, saved as JSON.
        const file = path.join(profile, 'Documents', 'IOUinator', 'Ledger.iou.json');
        const saved = () => {
          try {
            return JSON.parse(readFileSync(file, 'utf8')) as { transactions: { cents: number }[] };
          } catch {
            return null;
          }
        };
        await expect
          .poll(() => saved()?.transactions.map((t) => t.cents), { message: 'the ledger is saved' })
          .toEqual([1250]);
        // The page may write to the clipboard (Copy Result) and nothing else.
        const permission = (name: string) =>
          window.evaluate(
            async (n) => (await navigator.permissions.query({ name: n as PermissionName })).state,
            name,
          );
        expect(await permission('clipboard-write')).toBe('granted');
        expect(await permission('geolocation')).toBe('denied');
        expect(await permission('notifications')).toBe('denied');
        // Flatten Debts from the menu bar: the page follows, and the menu keeps the tick.
        const flattenChecked = () =>
          app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('view.flatten')?.checked);
        await expect.poll(flattenChecked).toBe(false);
        await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('view.flatten')?.click());
        await expect(window.getByRole('radio', { name: 'Flattened' })).toBeChecked();
        await expect.poll(flattenChecked).toBe(true);
        expect(
          await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.isVisible())),
          'no window shows on the screen',
        ).toBe(false);
        expect(errors).toEqual([]);
      } finally {
        await closeApp(app);
      }

      const again = await launch();
      try {
        const window = await again.firstWindow();
        const errors = watchErrors(window);
        await waitForApp(window);
        await expect(
          window.getByRole('radio', { name: 'Flattened' }),
          'the view is remembered',
        ).toBeChecked();
        await expect(
          window.getByRole('option', { name: 'Sam owes Alex $12.50 for Pizza' }),
          'the ledger is reopened',
        ).toBeVisible();
        expect(errors).toEqual([]);
      } finally {
        await closeApp(again);
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  test('--headless alone runs muted on a throwaway profile and shows no native UI', async () => {
    // The app's temporary folder goes in one of the test's own, which the test removes afterwards.
    const temp = realpathSync(mkdtempSync(path.join(tmpdir(), 'iouinator-e2e-')));
    const { IOUINATOR_HEADLESS: _headless, IOUINATOR_USER_DATA: _userData, ...inherited } = process.env;
    const env = { ...inherited, TMPDIR: temp };
    const app = await electron.launch({ cwd: DESKTOP, args: ['out/main.js', '--headless'], env });
    try {
      const profile = realpathSync(await app.evaluate(({ app }) => app.getPath('userData')));
      expect(path.dirname(profile), 'a profile made for this run').toBe(temp);
      expect(path.basename(profile)).toMatch(/^iouinator-headless-/);
      const window = await app.firstWindow();
      const errors = watchErrors(window);
      await firstStart(window);
      expect(
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]!.webContents.isAudioMuted(),
        ),
      ).toBe(true);
      // A right-click is recorded, not shown as a menu on the screen.
      await personField(window).click({ button: 'right' });
      await expect
        .poll(() =>
          app.evaluate(
            () =>
              (globalThis as { iouinatorHeadless?: { contextMenus: string[][] } }).iouinatorHeadless
                ?.contextMenus.length,
          ),
        )
        .toBe(1);
      expect(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.isVisible())),
        'no window shows on the screen',
      ).toBe(false);
      expect(errors).toEqual([]);
    } finally {
      await closeApp(app);
      rmSync(temp, { recursive: true, force: true });
    }
  });

  test('a newer release shows in the status bar, and Download opens its page', async () => {
    const temp = realpathSync(mkdtempSync(path.join(tmpdir(), 'iouinator-e2e-')));
    const page = 'https://github.com/gridlocdev/iouinator/releases/tag/v99.0.0';
    const app = await electron.launch({
      cwd: DESKTOP,
      args: ['out/main.js'],
      env: {
        ...process.env,
        IOUINATOR_HEADLESS: '1',
        IOUINATOR_USER_DATA: path.join(temp, 'profile'),
        IOUINATOR_TEST_RELEASE: JSON.stringify({ tag_name: 'v99.0.0', html_url: page }),
      },
    });
    try {
      const window = await app.firstWindow();
      const errors = watchErrors(window);
      await firstStart(window);
      await expect(window.locator('.iou-notice')).toContainText('IOUinator 99.0.0 is available.');
      await window.getByRole('link', { name: 'Download' }).click();
      await expect
        .poll(() =>
          app.evaluate(
            () =>
              (globalThis as { iouinatorHeadless?: { openedLinks: string[] } }).iouinatorHeadless
                ?.openedLinks,
          ),
        )
        .toEqual([page]);
      expect(errors).toEqual([]);
    } finally {
      await closeApp(app);
      rmSync(temp, { recursive: true, force: true });
    }
  });

  for (const [kind, crash] of [
    ['an uncaught exception', 'throw'],
    ['an unhandled rejection', 'reject'],
  ] as const) {
    test(`${kind} in a headless run exits instead of showing a dialog`, async () => {
      const temp = realpathSync(mkdtempSync(path.join(tmpdir(), 'iouinator-e2e-')));
      const app = await electron.launch({
        cwd: DESKTOP,
        args: ['out/main.js', '--headless'],
        env: { ...process.env, IOUINATOR_USER_DATA: path.join(temp, 'profile') },
      });
      const child = app.process();
      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      try {
        await firstStart(await app.firstWindow());
        const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
        await app.evaluate((_electron, how) => {
          setTimeout(() => {
            const error = new Error('a deliberate error from the check');
            if (how === 'throw') throw error;
            void Promise.reject(error);
          });
        }, crash);
        expect(await exited, 'the app exits with an error code').toBe(1);
        expect(stderr).toContain('a deliberate error from the check');
      } finally {
        if (child.exitCode === null) child.kill();
        rmSync(temp, { recursive: true, force: true });
      }
      await expect
        .poll(() => alive(child.pid!), { message: 'no Electron process is left running' })
        .toBe(false);
    });
  }
});
