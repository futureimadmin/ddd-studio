/**
 * A small, generic right-click menu: fixed-position, portalled to <body> (so it is never clipped by
 * the canvas), closes on an outside click / Escape / scroll / resize, and clamps itself inside the
 * viewport. Submenus open as a flyout on hover, flipping to the left when there is no room on the right.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight } from 'lucide-react';

type IconType = ComponentType<{ size?: number }>;

export type MenuItem =
  | { kind: 'item'; key: string; label: string; icon?: IconType; onSelect: () => void; danger?: boolean; disabled?: boolean; active?: boolean }
  | { kind: 'separator'; key: string }
  | { kind: 'submenu'; key: string; label: string; icon?: IconType; items: MenuItem[] };

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y, ready: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      x: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
      ready: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      data-testid="context-menu"
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 200, visibility: pos.ready ? 'visible' : 'hidden' }}
      className="min-w-[220px] border border-border bg-card py-1 text-sm shadow-lg"
    >
      {items.map((item) => (
        <MenuRow key={item.key} item={item} onClose={onClose} />
      ))}
    </div>,
    document.body,
  );
}

function MenuRow({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const rowRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [flipLeft, setFlipLeft] = useState(false);

  if (item.kind === 'separator') return <div role="separator" className="my-1 h-px bg-border" />;

  if (item.kind === 'submenu') {
    return (
      <div
        className="relative"
        onMouseEnter={() => {
          setOpen(true);
          const rect = rowRef.current?.getBoundingClientRect();
          if (rect) setFlipLeft(rect.right + 220 > window.innerWidth);
        }}
        onMouseLeave={() => setOpen(false)}
      >
        <button
          ref={rowRef}
          type="button"
          data-testid={`menu-${item.key}`}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted"
        >
          {item.icon && <item.icon size={13} />}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
        </button>
        {open && (
          <div
            role="menu"
            style={{ zIndex: 201 }}
            className={`absolute top-0 min-w-[200px] border border-border bg-card py-1 text-sm shadow-lg ${flipLeft ? 'right-full' : 'left-full'}`}
          >
            {item.items.map((sub) => (
              <MenuRow key={sub.key} item={sub} onClose={onClose} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={item.disabled}
      onClick={() => {
        item.onSelect();
        onClose();
      }}
      data-testid={`menu-${item.key}`}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 ${
        item.danger ? 'text-destructive hover:bg-destructive/10' : ''
      }`}
    >
      {item.icon && <item.icon size={13} />}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.active && <Check size={12} className="shrink-0" />}
    </button>
  );
}
