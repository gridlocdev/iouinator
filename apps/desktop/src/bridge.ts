/**
 * The channels between the main process and the preload. The sandboxed preload can't import this file,
 * so it repeats the names: keep the two in step.
 */
export const Channels = {
  setMenu: 'iouinator:set-menu',
  command: 'iouinator:command',
  folderInfo: 'iouinator:folder-info',
  useDefaultFolder: 'iouinator:use-default-folder',
  chooseFolder: 'iouinator:choose-folder',
  folder: 'iouinator:folder',
  exportLedger: 'iouinator:export-ledger',
  latestRelease: 'iouinator:latest-release',
  fullScreen: 'iouinator:full-screen',
} as const;

/** One item of the menu bar the page sends, as `NativeMenuItem` in @iouinator/ui. */
export interface NativeMenuItem {
  readonly type?: 'separator' | 'checkbox';
  readonly role?: string;
  readonly label?: string;
  readonly command?: string;
  readonly accelerator?: string;
  readonly enabled?: boolean;
  readonly checked?: boolean;
  readonly submenu?: readonly NativeMenuItem[];
}
