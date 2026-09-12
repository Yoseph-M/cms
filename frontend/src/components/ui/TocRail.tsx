import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface TocRailGroup {
  label: string;
  items: TocRailItem[];
}

export interface TocRailItem {
  id: string;
  label: string;
  icon?: LucideIcon;
}

interface TocRailProps {
  groups: TocRailGroup[];
  activeId: string;
  onJump: (id: string) => void;
  title?: string;
}

/**
 * Sticky "On this page" rail with scroll-spy highlighting. Shared by the
 * Profile and Settings pages so their long-form sections stay navigable.
 */
export const TocRail: React.FC<TocRailProps> = ({
  groups,
  activeId,
  onJump,
  title = 'On this page',
}) => {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-6 space-y-2">
        <p className="flex items-center gap-2 px-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <nav className="rounded-xl border border-border/50 bg-card/60 p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {groups.map((group, gi) => (
            <div key={group.label} className={cn('px-1 py-1.5', gi > 0 && 'border-t border-border/40 mt-1.5 pt-2.5')}>
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = activeId === item.id;
                  const ItemIcon = item.icon;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onJump(item.id)}
                        className={cn(
                          'group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors',
                          isActive
                            ? 'bg-primary/10 font-semibold text-primary'
                            : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                        )}
                      >
                        {ItemIcon && (
                          <ItemIcon
                            className={cn(
                              'h-3.5 w-3.5 shrink-0',
                              isActive
                                ? 'text-primary'
                                : 'text-muted-foreground/70 group-hover:text-muted-foreground',
                            )}
                          />
                        )}
                        <span className="truncate">{item.label}</span>
                        {isActive && (
                          <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
};

/**
 * Hook that tracks which anchored section is currently in view.
 * Sections register themselves via `sectionIds`; pass the returned handler
 * as `onJump` to TocRail for smooth scrolling that stays in sync.
 */
export const useScrollSpy = (sectionIds: string[]): { activeId: string; scrollTo: (id: string) => void } => {
  const [activeId, setActiveId] = React.useState(sectionIds[0] ?? '');
  const clickLockRef = React.useRef<number>(0);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < clickLockRef.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target instanceof HTMLElement) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: 0 },
    );
    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionIds.join('|')]);

  const scrollTo = React.useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    clickLockRef.current = Date.now() + 700; // ignore spy updates while gliding
    const top = el.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top, behavior: 'smooth' });
    setActiveId(id);
  }, []);

  return { activeId, scrollTo };
};
