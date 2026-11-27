/** The right-click menu for a person or a transaction: the catalog's own commands (PRD §10). */
import { useCallback, useRef } from 'preact/hooks';
import { usePopupFocus, usePopupPlace, type CommandCatalog } from '@iouinator/ui';
import { MENUS } from './commands.ts';
import type { AppController, ContextMenu as Menu } from './controller.ts';

export function ContextMenu({
  app,
  catalog,
}: {
  readonly app: AppController;
  readonly catalog: CommandCatalog;
}) {
  const menu = app.menu.value;
  return menu ? (
    <OpenMenu key={`${menu.kind}:${menu.id}:${menu.x}:${menu.y}`} app={app} catalog={catalog} menu={menu} />
  ) : null;
}

/** ↑ ↓ Home End move between the items; Esc and Tab close the menu. */
function onMenuKey(e: KeyboardEvent, close: () => void): void {
  const menu = e.currentTarget as HTMLElement;
  const items = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  const move = (to: number) => items[(to + items.length) % items.length]?.focus();
  if (e.key === 'Escape' || e.key === 'Tab') close();
  else if (e.key === 'ArrowDown') move(i + 1);
  else if (e.key === 'ArrowUp') move(i < 0 ? -1 : i - 1);
  else if (e.key === 'Home') move(0);
  else if (e.key === 'End') move(-1);
  else return;
  e.preventDefault();
  e.stopPropagation();
}

function OpenMenu({
  app,
  catalog,
  menu,
}: {
  readonly app: AppController;
  readonly catalog: CommandCatalog;
  readonly menu: Menu;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => app.closeMenu(), [app]);
  const at = usePopupPlace(ref, menu);
  usePopupFocus(ref, close, at !== null);
  return (
    <div
      ref={ref}
      class="iou-context-menu"
      role="menu"
      aria-label={menu.kind === 'person' ? 'Person actions' : 'Transaction actions'}
      style={{
        left: `${(at ?? menu).x}px`,
        top: `${(at ?? menu).y}px`,
        visibility: at ? 'visible' : 'hidden',
      }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => onMenuKey(e, close)}
    >
      {MENUS[menu.kind].map((id, i) => {
        if (id === '-') return <div key={i} class="iou-context-sep" role="separator" />;
        const c = catalog.get(id);
        if (!c) return null;
        const keys = catalog.keys(c).join('');
        return (
          <button
            key={id}
            type="button"
            role="menuitem"
            class={`iou-context-item${c.danger ? ' iou-danger' : ''}`}
            disabled={!catalog.isEnabled(c)}
            title={catalog.whyDisabled(c) ?? undefined}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => catalog.run(id)}
          >
            <span>{c.title}</span>
            {keys && <kbd>{keys}</kbd>}
          </button>
        );
      })}
    </div>
  );
}
