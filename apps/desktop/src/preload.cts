// Sandboxed preload: CommonJS, and it may only require('electron'), so the channel names from
// bridge.ts are repeated here. Keep them in step. It exposes exactly one object, `iouinatorNative`.
import type { NativeMenuItem } from './bridge.ts';

const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '';

contextBridge.exposeInMainWorld('iouinatorNative', {
  version: arg('iouinator-version'),
  chrome: arg('iouinator-chrome'),
  onFullScreen: (fn: (full: boolean) => void) =>
    ipcRenderer.on('iouinator:full-screen', (_e, full: boolean) => fn(full)),
  setMenu: (items: readonly NativeMenuItem[]) => ipcRenderer.send('iouinator:set-menu', items),
  onCommand: (fn: (id: string) => void) => ipcRenderer.on('iouinator:command', (_e, id: string) => fn(id)),
  folderInfo: () => ipcRenderer.invoke('iouinator:folder-info'),
  useDefaultFolder: () => ipcRenderer.invoke('iouinator:use-default-folder'),
  chooseFolder: () => ipcRenderer.invoke('iouinator:choose-folder'),
  folder: (op: string, args: readonly unknown[]) => ipcRenderer.invoke('iouinator:folder', op, args),
  exportLedger: (name: string, text: string) => ipcRenderer.invoke('iouinator:export-ledger', name, text),
  latestRelease: () => ipcRenderer.invoke('iouinator:latest-release'),
});
