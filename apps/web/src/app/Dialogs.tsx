import { useMemo, useRef, useState } from 'preact/hooks';
import { amountText, personById } from '@iouinator/core';
import {
  Dialog,
  ListPopup,
  THEMES,
  VIEWS,
  filterEntries,
  isMac,
  useKeyCapture,
  type CommandCatalog,
  type MenuEntry,
  type Theme,
  type View,
} from '@iouinator/ui';
import type { AppController } from './controller.ts';
import { describeKeyPress, shortcutGroups, type KeyPress } from './shortcuts.ts';
import { TransactionFields, useTransactionDraft } from './TransactionFields.tsx';

/** The open dialog, if any; one at a time. */
export function Dialogs({ app, catalog }: { readonly app: AppController; readonly catalog: CommandCatalog }) {
  switch (app.dialog.value) {
    case 'commands':
      return <CommandMenu app={app} catalog={catalog} />;
    case 'shortcuts':
      return <ShortcutsDialog app={app} catalog={catalog} />;
    case 'settings':
      return <SettingsDialog app={app} />;
    case 'editTransaction':
      return <EditTransactionDialog app={app} />;
    case 'renamePerson':
      return <RenamePersonDialog app={app} />;
    // The ledger folder's dialogs are drawn by LedgerDialogs.
    case 'ledgers':
    case 'rename':
    case 'trash':
    case 'conflict':
    case 'recovery':
    case 'folder':
    case null:
      return null;
  }
}

interface Entry extends MenuEntry {
  readonly keys: string;
  readonly enabled: boolean;
  /** Why it's off, when the user should be told (a read-only folder). */
  readonly why: string | null;
}

/** ⌘K: every command, recent ones first (PRD §10). */
function CommandMenu({ app, catalog }: { readonly app: AppController; readonly catalog: CommandCatalog }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const entries = useMemo<Entry[]>(
    () =>
      catalog.all
        .filter((c) => !c.hidden && c.id !== 'help.commands')
        .map((c) => ({
          id: c.id,
          title: c.title,
          group: c.group,
          keywords: `${c.keywords ?? ''} ${c.description}`,
          keys: catalog.keys(c).join(' '),
          enabled: catalog.isEnabled(c),
          why: catalog.whyDisabled(c),
        })),
    [catalog],
  );
  const results = filterEntries(entries, query, catalog.recentIds).slice(0, 80);
  const pick = (i: number) => {
    const entry = results[i];
    if (entry?.why) app.say(entry.why, { tone: 'error' });
    if (!entry?.enabled) return;
    app.close();
    // Let the menu close (and focus go back) before the command runs.
    queueMicrotask(() => catalog.run(entry.id));
  };
  return (
    <ListPopup
      label="Command menu"
      placeholder="Type a command…"
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
          aria-disabled={!e.enabled}
          class={e.enabled ? undefined : 'iou-disabled'}
          title={e.why ?? undefined}
          onPointerMove={() => setIndex(i)}
          onClick={() => pick(i)}
        >
          <span class="iou-palette-title">{e.title}</span>
          {e.why && <span class="iou-palette-why">Read-only</span>}
          <span class="iou-palette-group">{e.group}</span>
          {e.keys && <kbd>{e.keys}</kbd>}
        </li>
      ))}
    </ListPopup>
  );
}

/** ⌘/: every shortcut, made from the catalog (PRD §10). */
function ShortcutsDialog({
  app,
  catalog,
}: {
  readonly app: AppController;
  readonly catalog: CommandCatalog;
}) {
  const groups = shortcutGroups(catalog, isMac);
  const [pressing, setPressing] = useState(false);
  const [heard, setHeard] = useState<KeyPress | null>(null);
  const endedBy = useRef<KeyboardEvent | null>(null);
  useKeyCapture(
    pressing,
    (e) => {
      const press = describeKeyPress(catalog, e, isMac);
      if (press) setHeard(press);
    },
    (escape) => {
      endedBy.current = escape;
      setPressing(false);
    },
  );
  return (
    <Dialog
      title="Keyboard Shortcuts"
      class="iou-dialog-wide"
      // The Escape that ended "press a shortcut" (which never takes it) goes on here, and shouldn't also close.
      onClose={() => {
        if ((endedBy.current?.eventPhase ?? Event.NONE) === Event.NONE) app.close();
      }}
      actions={
        <button type="button" class="iou-button iou-button-primary" onClick={() => app.close()}>
          Close
        </button>
      }
    >
      <div class="iou-press">
        <button
          type="button"
          class="iou-button"
          aria-pressed={pressing}
          onClick={() => {
            setHeard(null);
            setPressing(!pressing);
          }}
        >
          {pressing ? 'Stop' : 'Press a Shortcut…'}
        </button>
        <p class="iou-press-says" role="status">
          {!pressing ? (
            'See what a key does.'
          ) : heard ? (
            <>
              <kbd>{heard.keys}</kbd> {heard.says}
              {heard.note && <span class="iou-press-note"> {heard.note}</span>}
            </>
          ) : (
            `Press any keys to see what they do. ${isMac ? '⎋' : 'Esc'} or Stop ends this.`
          )}
        </p>
      </div>
      <div class="iou-shortcuts">
        {groups.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <dl>
              {g.lines.map((l) => (
                <div key={l.title} class="iou-shortcut">
                  <dt>{l.title}</dt>
                  <dd>
                    {l.keys.map((way, i) => (
                      <span key={i} class="iou-way">
                        {i > 0 && <span class="iou-or">or</span>}
                        {way.map((k, j) => (
                          <kbd key={j}>{k}</kbd>
                        ))}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

const THEME_TITLES: Readonly<Record<Theme, string>> = { system: 'System', light: 'Light', dark: 'Dark' };
const VIEW_TITLES: Readonly<Record<View, string>> = { raw: 'Raw', flat: 'Flattened' };

/** A row of radio buttons. */
export function Choice<T extends string>(props: {
  readonly id: string;
  readonly label: string;
  readonly items: readonly T[];
  readonly titles: Readonly<Record<T, string>>;
  readonly value: T;
  readonly onPick: (value: T) => void;
}) {
  return (
    <div class="iou-field">
      <span id={props.id}>{props.label}</span>
      <div class="iou-segmented" role="radiogroup" aria-labelledby={props.id}>
        {props.items.map((item) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={props.value === item}
            onClick={() => props.onPick(item)}
          >
            {props.titles[item]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Settings (PRD §11). Every change applies at once and is kept; there is nothing to save or cancel. */
function SettingsDialog({ app }: { readonly app: AppController }) {
  const s = app.settings.value;
  return (
    <Dialog
      title="Settings"
      onClose={() => app.close()}
      actions={
        <button type="button" class="iou-button iou-button-primary" onClick={() => app.close()}>
          Done
        </button>
      }
    >
      <div class="iou-settings">
        <Choice
          id="iou-theme-label"
          label="Appearance"
          items={THEMES}
          titles={THEME_TITLES}
          value={s.theme}
          onPick={(t) => app.update({ theme: t })}
        />
        <Choice
          id="iou-view-label"
          label="Diagram"
          items={VIEWS}
          titles={VIEW_TITLES}
          value={s.view}
          onPick={(v) => app.setView(v)}
        />
      </div>
    </Dialog>
  );
}

/** Edit Transaction… (PRD §4.3): the same fields as the form, with Save and Cancel. */
function EditTransactionDialog({ app }: { readonly app: AppController }) {
  const t = app.ledger.value.transactions.find((x) => x.id === app.editing.value);
  const draft = useTransactionDraft(
    app,
    t ? { from: t.from, to: t.to, amount: amountText(t.cents), description: t.description } : undefined,
  );
  if (!t) return null;
  const submit = () => {
    const fields = draft.fields();
    if ('error' in fields) return draft.setError(fields.error);
    const error = app.updateTransaction(t.id, fields);
    if (error === null) app.close();
    else draft.setError(error);
  };
  return (
    <Dialog
      title="Edit Transaction"
      onClose={() => app.close()}
      onSubmit={submit}
      actions={
        <>
          <button type="button" class="iou-button" onClick={() => app.close()}>
            Cancel
          </button>
          <button type="submit" class="iou-button iou-button-primary">
            Save
          </button>
        </>
      }
    >
      <TransactionFields app={app} draft={draft} idPrefix="iou-edit" autofocus="amount" />
    </Dialog>
  );
}

/** Rename Person… (PRD §3). */
function RenamePersonDialog({ app }: { readonly app: AppController }) {
  const id = app.renaming.value;
  const person = id === null ? undefined : personById(app.ledger.value, id);
  const [name, setName] = useState(person?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  if (!person) return null;
  const submit = () => {
    const problem = app.renamePerson(person.id, name);
    if (problem === null) app.close();
    else setError(problem);
  };
  return (
    <Dialog
      title={`Rename ${person.name}`}
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
          maxLength={200}
          aria-invalid={error !== null}
          aria-describedby={error ? 'iou-rename-person-error' : undefined}
          onInput={(e) => {
            setName(e.currentTarget.value);
            setError(null);
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
      {error && (
        <p id="iou-rename-person-error" class="iou-field-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
