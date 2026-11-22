/** The ledger folder's dialogs (PRD §8.2, §8.3): the ledger list, Rename, the trash, conflicts, recovery, setup. */
import { useState } from 'preact/hooks';
import { Dialog, ListPopup, filterEntries } from '@iouinator/ui';
import type { AppController } from './controller.ts';
import type { FolderSetup, LedgerFolders } from './ledgerFolders.ts';
import type { OpenLedger } from './openLedger.ts';

interface Props {
  readonly app: AppController;
  readonly folders: LedgerFolders;
}

/** Runs an open ledger task from a click, reporting a failure in the status bar. */
function run(app: AppController, what: string, task: () => Promise<unknown>): void {
  task().catch((e: unknown) => {
    console.warn(e);
    app.say(`Couldn’t ${what}: ${e instanceof Error ? e.message : String(e)}`, { tone: 'error' });
  });
}

export function LedgerDialogs({ app, folders }: Props) {
  const current = folders.current.value;
  const kind = app.dialog.value;
  if (kind === 'folder') return <FolderDialog folders={folders} />;
  if (!current) return null;
  switch (kind) {
    case 'ledgers':
      return <LedgersDialog app={app} current={current} />;
    case 'rename':
      return <RenameDialog app={app} current={current} />;
    case 'trash':
      return <TrashDialog app={app} current={current} />;
    case 'conflict':
      return <ConflictDialog app={app} current={current} />;
    case 'recovery':
      return <RecoveryDialog app={app} current={current} />;
    case 'commands':
    case 'shortcuts':
    case 'settings':
    case 'editTransaction':
    case 'renamePerson':
    case null:
      return null;
  }
}

interface OpenLedgerProps {
  readonly app: AppController;
  readonly current: OpenLedger;
}

/** Open Ledger…: the folder's ledgers, filtered as you type. */
function LedgersDialog({ app, current }: OpenLedgerProps) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const open = current.name.value;
  const entries = current.names.value.map((name) => ({ id: name, title: name, group: '', keywords: '' }));
  const results = filterEntries(entries, query, []);
  const pick = (i: number) => {
    const entry = results[i];
    if (!entry) return;
    app.close();
    if (entry.id !== open) run(app, `open ${entry.id}`, () => current.open(entry.id));
  };
  return (
    <ListPopup
      label="Open Ledger"
      placeholder="Type a ledger’s name…"
      query={query}
      onQuery={(q) => {
        setQuery(q);
        setIndex(0);
      }}
      index={index}
      onIndex={setIndex}
      count={results.length}
      onPick={pick}
      onClose={() => app.close()}
    >
      {results.map((e, i) => (
        <li
          key={e.id}
          id={`iou-palette-${i}`}
          role="option"
          aria-selected={i === index}
          aria-current={e.id === open ? 'true' : undefined}
          onPointerMove={() => setIndex(i)}
          onClick={() => pick(i)}
        >
          <span class="iou-palette-title">{e.title}</span>
          {e.id === open && <span class="iou-palette-group">Open</span>}
        </li>
      ))}
    </ListPopup>
  );
}

/** Rename Ledger…: the file's new name, with what's wrong with it. */
function RenameDialog({ app, current }: OpenLedgerProps) {
  const [name, setName] = useState(current.name.value ?? '');
  const [error, setError] = useState<string | null>(null);
  const submit = () =>
    run(app, 'rename the ledger', async () => {
      const problem = await current.rename(name);
      if (problem === null) app.close();
      else setError(problem);
    });
  return (
    <Dialog
      title="Rename Ledger"
      onClose={() => app.close()}
      onSubmit={submit}
      actions={
        <>
          <button type="button" class="iou-button" onClick={() => app.close()}>
            Cancel
          </button>
          <button type="submit" class="iou-button iou-button-primary">
            Rename
          </button>
        </>
      }
    >
      <label class="iou-field iou-field-wide">
        <span>Name</span>
        <input
          type="text"
          value={name}
          data-autofocus
          aria-invalid={error !== null}
          aria-describedby={error ? 'iou-rename-error' : undefined}
          onInput={(e) => {
            setName(e.currentTarget.value);
            setError(null);
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
      {error && (
        <p id="iou-rename-error" class="iou-field-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

/** Open Trash…: deleted ledgers, each with Restore. */
function TrashDialog({ app, current }: OpenLedgerProps) {
  const names = current.trashed.value;
  const close = () => app.close();
  return (
    <Dialog
      title="Trash"
      onClose={close}
      actions={
        <button type="button" class="iou-button iou-button-primary" onClick={close}>
          Done
        </button>
      }
    >
      {names.length === 0 ? (
        <p>The trash is empty.</p>
      ) : (
        <ul class="iou-trash">
          {names.map((name) => (
            <li key={name}>
              <span>{name}</span>
              <button
                type="button"
                class="iou-button"
                aria-label={`Restore ${name}`}
                onClick={() => {
                  close();
                  run(app, `restore ${name}`, () => current.restoreTrashed(name));
                }}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** A save found the file changed or deleted elsewhere: nothing is saved until the user picks one (PRD §8.3). */
function ConflictDialog({ app, current }: OpenLedgerProps) {
  const conflict = current.conflict.value;
  if (!conflict) return null;
  const choose = (task: () => Promise<void>) => {
    app.close();
    run(app, 'save the ledger', task);
  };
  return (
    <Dialog
      title={`${conflict.name} ${conflict.kind === 'changed' ? 'changed' : 'was deleted'} somewhere else`}
      // The question waits for an answer: closing it would leave the ledger unsaved with no way back.
      onClose={() => undefined}
      actions={
        <>
          <button type="button" class="iou-button" onClick={() => choose(() => current.useTheirs())}>
            Use Theirs
          </button>
          <button type="button" class="iou-button" onClick={() => choose(() => current.keepMine())}>
            Keep Mine
          </button>
          <button
            type="button"
            class="iou-button iou-button-primary"
            data-autofocus
            onClick={() => choose(() => current.saveMineAsCopy())}
          >
            Save Mine as a Copy
          </button>
        </>
      }
    >
      <p>
        {conflict.kind === 'changed'
          ? `Another app changed ${conflict.name} while you were working on it. IOUinator has stopped saving it until you choose:`
          : `Another app deleted ${conflict.name} while you were working on it. IOUinator has stopped saving it until you choose:`}
      </p>
      <ul class="iou-choices">
        <li>
          <strong>Save Mine as a Copy</strong> keeps your ledger in a new file
          {conflict.kind === 'changed' ? ` and opens ${conflict.name} as it is now.` : '.'}
        </li>
        <li>
          <strong>Keep Mine</strong>{' '}
          {conflict.kind === 'changed'
            ? 'writes your ledger over the other changes.'
            : 'saves your ledger again.'}
        </li>
        <li>
          <strong>Use Theirs</strong>{' '}
          {conflict.kind === 'changed'
            ? 'drops your changes and opens the file as it is now.'
            : 'drops your ledger and opens another.'}
        </li>
      </ul>
    </Dialog>
  );
}

const timeOf = (at: number) =>
  new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Unsaved changes kept from an earlier visit (PRD §8.3). */
function RecoveryDialog({ app, current }: OpenLedgerProps) {
  const recovery = current.recovery.value;
  if (!recovery) return null;
  return (
    <Dialog
      title={`Restore unsaved changes to ${recovery.name}?`}
      onClose={() => undefined}
      actions={
        <>
          <button
            type="button"
            class="iou-button"
            onClick={() => {
              app.close();
              current.discard();
            }}
          >
            Discard
          </button>
          <button
            type="button"
            class="iou-button iou-button-primary"
            data-autofocus
            onClick={() => {
              app.close();
              current.restore();
            }}
          >
            Restore
          </button>
        </>
      }
    >
      <p>
        IOUinator kept changes to {recovery.name} from {timeOf(recovery.snapshot.at)} that never reached its
        file. Restore puts them back in the ledger, and Undo takes them off again.
      </p>
    </Dialog>
  );
}

function folderText(setup: FolderSetup): { title: string; body: string } {
  switch (setup.kind) {
    case 'first':
      return {
        title: 'Where should IOUinator keep ledgers?',
        body: 'Each ledger is a plain text file in this folder, which other apps can open too.',
      };
    case 'missing':
      return {
        title: 'The ledger folder isn’t there',
        body: `IOUinator keeps ledgers in ${setup.folder}, which can’t be found. It may be on a drive that isn’t connected.`,
      };
    case 'allow':
      return {
        title: `Open ${setup.name} again?`,
        body: `The browser needs your permission to use the ledger folder ${setup.name} again.`,
      };
    case 'failed':
      return { title: 'Couldn’t open the ledger folder', body: setup.message };
  }
}

/** The folder question at start (PRD §8.2). */
function FolderDialog({ folders }: { readonly folders: LedgerFolders }) {
  const setup = folders.setup.value;
  if (!setup) return null;
  const text = folderText(setup);
  const { platform } = folders;
  const primary = setup.kind === 'allow' ? 'allow' : 'default';
  return (
    <Dialog
      title={text.title}
      onClose={() => folders.dismissSetup()}
      actions={
        <>
          {(setup.kind === 'missing' || setup.kind === 'failed') && (
            <button type="button" class="iou-button" onClick={() => void folders.start()}>
              Try Again
            </button>
          )}
          {platform.canChoose && setup.kind !== 'allow' && (
            <button type="button" class="iou-button" onClick={() => void folders.choose()}>
              Choose Folder…
            </button>
          )}
          <button
            type="button"
            class={primary === 'default' ? 'iou-button iou-button-primary' : 'iou-button'}
            data-autofocus={primary === 'default' ? true : undefined}
            onClick={() => void folders.useDefault(setup.kind !== 'allow')}
          >
            {setup.kind === 'allow' ? 'Not Now' : platform.defaultTitle}
          </button>
          {setup.kind === 'allow' && (
            <button
              type="button"
              class="iou-button iou-button-primary"
              data-autofocus
              onClick={() => void folders.allow()}
            >
              Allow
            </button>
          )}
        </>
      }
    >
      <p>{text.body}</p>
    </Dialog>
  );
}
