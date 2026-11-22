// What the web app's tests reach. The page itself starts from main.tsx.
export {
  AppController,
  type ContextMenu,
  type ControllerOptions,
  type DialogKind,
  type Filter,
} from './app/controller.ts';
export { NOTICE_ACTION_MS, NOTICE_MS, type Notice } from './app/notices.ts';
export { MENUS, buildCommands } from './app/commands.ts';
export { MAX_UNDO, UndoStack } from './app/undo.ts';
export { menuSender, nativeMenu } from './app/nativeMenu.ts';
export { shortcutGroups, type ShortcutGroup, type ShortcutLine } from './app/shortcuts.ts';
export { balanceText } from './app/PeoplePane.tsx';
export { edgeKey } from './app/mermaidDraw.ts';
export {
  RETRIES,
  OpenLedger,
  type Conflict,
  type Recovery,
  type SaveState,
  type OpenLedgerOptions,
} from './app/openLedger.ts';
export {
  BROWSER_KEY,
  LedgerFolders,
  browserPlatform,
  desktopPlatform,
  inBrowserStorage,
  type FolderPlatform,
  type FolderSetup,
  type OpenedFolder,
} from './app/ledgerFolders.ts';
