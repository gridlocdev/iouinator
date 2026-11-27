import type { ReadonlySignal } from '@preact/signals';
import type { CommandCatalog } from '@iouinator/ui';
import { Icon, RadioRow } from '@iouinator/ui';
import { ContextMenu } from './ContextMenu.tsx';
import type { AppController } from './controller.ts';
import { DiagramPane } from './DiagramPane.tsx';
import { Dialogs } from './Dialogs.tsx';
import { LedgerDialogs } from './LedgerDialogs.tsx';
import { inBrowserStorage, type LedgerFolders } from './ledgerFolders.ts';
import type { Release } from './native.ts';
import { PeoplePane } from './PeoplePane.tsx';
import { TransactionsPane } from './TransactionsPane.tsx';

const VIEW_SWITCH = { raw: 'Raw', flat: 'Flattened' } as const;

/** The top bar (PRD §9): the ledger's name, which opens the ledger list, and the Raw / Flattened switch. */
function TopBar({
  app,
  catalog,
  name,
}: {
  readonly app: AppController;
  readonly catalog: CommandCatalog;
  readonly name: string | null;
}) {
  const view = app.settings.value.view;
  const flatten = catalog.get('view.flatten');
  const keys = flatten ? catalog.keys(flatten).join('') : '';
  return (
    <header class="iou-top">
      {name !== null ? (
        <button
          type="button"
          class="iou-ledger-name"
          aria-label={`Ledger: ${name}. Open another ledger`}
          title="Open Ledger…"
          onClick={() => app.open('ledgers')}
        >
          <span>{name}</span>
          <Icon name="chevron-down" />
        </button>
      ) : (
        <span class="iou-ledger-name">IOUinator</span>
      )}
      <RadioRow
        class="iou-view-switch"
        label="Diagram view"
        items={['raw', 'flat'] as const}
        titles={VIEW_SWITCH}
        value={view}
        title={keys ? `Flatten Debts (${keys})` : undefined}
        onPick={(v) => app.setView(v)}
      />
    </header>
  );
}

/**
 * The status bar: the latest notice with its action, a failed save until a save works, and in the browser's
 * own storage or a read-only folder the storage note (PRD §8.2, §8.3), and the live region for screen readers
 * (PRD §14).
 */
function StatusBar({
  app,
  folders,
  release,
}: {
  readonly app: AppController;
  readonly folders?: LedgerFolders;
  readonly release?: Release | null;
}) {
  const notice = app.notice.value;
  const current = folders?.current.value ?? null;
  const failed = current?.state.value === 'failed' ? current.name.value : null;
  return (
    <footer class="iou-status">
      <div class={`iou-notice${notice?.tone === 'error' || (!notice && failed) ? ' iou-notice-error' : ''}`}>
        {!notice && failed !== null && current && (
          <>
            <span>Couldn’t save {failed}.</span>
            <button
              type="button"
              class="iou-link-button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => void current.save()}
            >
              Try Again
            </button>
          </>
        )}
        {!notice && failed === null && release && (
          <>
            <span>IOUinator {release.version} is available.</span>
            <a class="iou-link-button" href={release.url} target="_blank" rel="noopener noreferrer">
              Download
            </a>
          </>
        )}
        {!notice && failed === null && !release && inBrowserStorage(current) && (
          <span class="iou-storage-note">Stored in this browser</span>
        )}
        {!notice &&
          failed === null &&
          !release &&
          current !== null &&
          !inBrowserStorage(current) &&
          current.folder.readOnly === undefined && (
            <span class="iou-storage-note">Ledgers in {current.folder.label}</span>
          )}
        {!notice && failed === null && !release && current?.folder.readOnly !== undefined && (
          <span class="iou-storage-note" title={current.folder.readOnly}>
            Read-only: {current.folder.label}
          </span>
        )}
        {notice && (
          <>
            <span>{notice.text}</span>
            {notice.action && (
              <button
                type="button"
                class="iou-link-button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  const run = notice.action!.run;
                  app.dismissNotice();
                  run();
                }}
              >
                {notice.action.label}
              </button>
            )}
          </>
        )}
      </div>
      <button type="button" class="iou-status-button" onClick={() => app.open('settings')}>
        <Icon name="settings" />
        Settings
      </button>
      <div class="iou-live" role="status" aria-live="polite" aria-atomic="true">
        {app.announcement.value}
      </div>
    </footer>
  );
}

export function App(props: {
  readonly app: AppController;
  readonly catalog: CommandCatalog;
  /** The ledger folders; without them (tests) the ledger lives in memory only. */
  readonly folders?: LedgerFolders;
  /** A newer release, from the desktop app's update check (PRD §12). */
  readonly release?: ReadonlySignal<Release | null>;
}) {
  const { app, catalog, folders, release } = props;
  const current = folders?.current.value ?? null;
  // Nothing to edit until a ledger is open: edits would change a ledger about to be replaced.
  const ready = !folders || current !== null;
  return (
    <div class="iou-app">
      <TopBar app={app} catalog={catalog} name={current?.name.value ?? null} />
      <div class="iou-body">
        {ready && (
          <>
            <PeoplePane app={app} />
            <TransactionsPane app={app} />
            <DiagramPane app={app} />
          </>
        )}
      </div>
      <StatusBar app={app} release={release?.value ?? null} {...(folders ? { folders } : {})} />
      <ContextMenu app={app} catalog={catalog} />
      <Dialogs app={app} catalog={catalog} />
      {folders && <LedgerDialogs app={app} folders={folders} />}
    </div>
  );
}
