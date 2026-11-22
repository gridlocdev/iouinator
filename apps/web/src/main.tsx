import { effect, signal } from '@preact/signals';
import { render } from 'preact';
import '@iouinator/ui/styles.css';
import './app.css';
import { every, listenForKeys, localKeep, localSettings } from '@iouinator/ui';
import { App } from './app/App.tsx';
import { buildCommands } from './app/commands.ts';
import { AppController } from './app/controller.ts';
import { nativeBridge, type Release } from './app/native.ts';
import { menuSender, nativeMenu, watchMenuInputs } from './app/nativeMenu.ts';
import { LedgerFolders, browserPlatform, desktopPlatform } from './app/ledgerFolders.ts';
import pkg from '../package.json';

const root = document.getElementById('app')!;
const native = nativeBridge();

function start(): void {
  const app = new AppController({
    settings: localSettings(),
    version: native?.version ?? pkg.version,
  });
  const folders = new LedgerFolders(app, native ? desktopPlatform(native) : browserPlatform(), localKeep());
  const catalog = buildCommands(app, folders);
  const release = signal<Release | null>(null);
  render(<App app={app} catalog={catalog} folders={folders} release={release} />, root);
  void folders.start();
  native
    ?.latestRelease()
    .then((r) => (release.value = r))
    .catch((e: unknown) => console.warn('Could not check for updates:', e));
  watchLedgerFolder(folders);

  // The theme lives on <html>, so dialogs and the body follow it too (PRD §11).
  effect(() => {
    const { theme } = app.settings.value;
    const html = document.documentElement;
    if (theme === 'system') delete html.dataset.theme;
    else html.dataset.theme = theme;
  });

  listenForKeys(
    window,
    catalog,
    () => app.blocked() || app.menu.value !== null || folders.current.value === null,
  );
  if (import.meta.env.DEV) Object.assign(globalThis, { iouinator: { app, catalog, folders } });

  if (native?.chrome === 'unified') {
    document.documentElement.classList.add('iou-unified');
    native.onFullScreen((full) => document.documentElement.classList.toggle('iou-fullscreen', full));
  }

  if (native) {
    const menu = menuSender((items) => native.setMenu(items));
    native.onCommand((id) => {
      // A clicked checkbox item flips its own checkmark; send the menu again so it shows the real state.
      menu.forget();
      queueMicrotask(() => menu.send(nativeMenu(catalog)));
      // Menu accelerators reach the app before the page. In a text field, Undo and Redo undo the typing
      // (PRD §7). Single-key shortcuts are only shown in the menu, not registered, so every other item runs.
      const inText = !!document.activeElement?.closest('input, textarea, select');
      if (inText && (id === 'edit.undo' || id === 'edit.redo')) {
        document.execCommand(id === 'edit.undo' ? 'undo' : 'redo');
        return;
      }
      catalog.run(id);
    });
    addEventListener('focus', () => {
      menu.forget();
      menu.send(nativeMenu(catalog));
    });
    watchMenuInputs(app, () => menu.send(nativeMenu(catalog)), [folders.current]);
    menu.send(nativeMenu(catalog));
  }
}

/**
 * Picks up changes made elsewhere when the window comes to the front and every 15 s while it's in front, and
 * keeps a snapshot of unsaved work every 30 s and when the page goes away (PRD §8.3).
 */
function watchLedgerFolder(folders: LedgerFolders): void {
  const inFront = () => document.visibilityState === 'visible' && document.hasFocus();
  const check = () => {
    folders.current.value?.check().catch((e: unknown) => console.warn('Couldn’t check the ledger file:', e));
  };
  const snapshot = () => folders.current.value?.snapshot();
  addEventListener('focus', check);
  every(15_000, () => {
    if (inFront()) check();
  });
  every(30_000, snapshot);
  addEventListener('pagehide', snapshot);
}

try {
  start();
} catch (e: unknown) {
  console.error(e);
  root.textContent = `IOUinator couldn't start: ${e instanceof Error ? e.message : String(e)}`;
}
