import { expect } from 'vitest';
import { writeLedgerText, type Ledger } from '@iouinator/core';
import { MemoryFolder, memorySettings, storageKeep, type Settings } from '@iouinator/ui';
import {
  AppController,
  LedgerFolders,
  buildCommands,
  type ControllerOptions,
  type FolderPlatform,
  type FolderSetup,
  type OpenedFolder,
} from '../src/index.ts';

/** A controller and catalog on in-memory settings and a fake clipboard. */
export function makeApp(settings: Partial<Settings> = {}, options: Partial<ControllerOptions> = {}) {
  const storage = memorySettings(settings);
  const copied: string[] = [];
  const app = new AppController({
    settings: storage,
    version: '0.0.0-test',
    copy: (text) => {
      copied.push(text);
      return Promise.resolve();
    },
    ...options,
  });
  const catalog = buildCommands(app);
  return { app, catalog, storage, copied };
}

/** Adds people by name; returns their ids in order. */
export function people(app: AppController, ...names: string[]): string[] {
  return names.map((name) => {
    expect(app.addPerson(name)).toBeNull();
    return app.ledger.value.people.at(-1)!.id;
  });
}

/** Records `from` owes `to` `dollars`, by name. */
export function owe(
  app: AppController,
  from: string,
  to: string,
  dollars: number,
  description = 'Lunch',
): void {
  const id = (name: string) => app.ledger.value.people.find((p) => p.name === name)!.id;
  expect(
    app.addTransaction({ from: id(from), to: id(to), cents: Math.round(dollars * 100), description }),
  ).toBeNull();
}

/** A ledger file's text, for fixtures. */
export function ledgerFile(ledger: Partial<Ledger>): string {
  return writeLedgerText({ people: [], transactions: [], ...ledger });
}

/** The people's names and the transactions as `from>to cents description`, to compare ledgers. */
export function summary(ledger: Ledger): string[] {
  const name = (id: string) => ledger.people.find((p) => p.id === id)?.name ?? id;
  return [
    ledger.people.map((p) => p.name).join(','),
    ...ledger.transactions.map((t) => `${name(t.from)}>${name(t.to)} ${t.cents} ${t.description}`),
  ];
}

/** A ledger keep on a map, for tests. */
export function memoryKeep() {
  const map = new Map<string, string>();
  const keep = storageKeep({
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  });
  return { keep, map };
}

/** A folder platform in memory: `first` at start, `choice` for the picker, a default folder, and exports. */
export function memoryPlatform(first: OpenedFolder | FolderSetup = { kind: 'first' }) {
  const fallback: OpenedFolder = { folder: new MemoryFolder('IOUinator'), key: 'default' };
  const state = {
    choice: null as OpenedFolder | null,
    defaults: [] as boolean[],
    exported: [] as [string, string][],
    fallback,
  };
  const platform: FolderPlatform = {
    first: () => Promise.resolve(first),
    canChoose: true,
    pickMovesFolder: true,
    choose: () => Promise.resolve(state.choice),
    defaultTitle: 'Use Documents/IOUinator',
    offersDefault: true,
    useDefault: (remember) => {
      state.defaults.push(remember);
      return Promise.resolve(fallback);
    },
    exportLedger: (name, text) => {
      state.exported.push([name, text]);
      return Promise.resolve(true);
    },
    allow: () => Promise.resolve(null),
  };
  return { platform, state };
}

/** An app with ledger folders on a memory platform; every ledger command is in its catalog. */
export function makeFolderApp(first?: OpenedFolder | FolderSetup) {
  const made = makeApp();
  const { platform, state } = memoryPlatform(first);
  const folders = new LedgerFolders(made.app, platform, memoryKeep().keep, {
    retries: [0, 0],
    now: () => new Date(2026, 10, 19, 14, 5, 9),
  });
  const catalog = buildCommands(made.app, folders);
  return { ...made, catalog, folders, state };
}
