import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  Building2,
  CalendarCheck,
  Globe,
  LayoutGrid,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Sun,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { SettingsGroup } from '../../components/ui/SettingsGroup';
import { cn } from '../../lib/utils';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useHeaderStore } from '../../store/headerStore';

import { NotificationPreferencesSection } from '../../components/settings/NotificationPreferencesSection';
import { BusinessProfileSection } from '../../components/settings/BusinessProfileSection';
import { CashierOrderingToggle } from '../../components/settings/CashierOrderingToggle';
import { OwnerAttendanceToggle } from '../../components/settings/OwnerAttendanceToggle';
import { WorkOnSundaysToggle } from '../../components/settings/WorkOnSundaysToggle';
import { LanguagePreferenceSection } from '../../components/settings/LanguagePreferenceSection';
import { ThemePreferenceSection } from '../../components/settings/ThemePreferenceSection';
import { FeatureToggles } from '../../components/settings/FeatureToggles';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  group: 'profile' | 'preferences' | 'access';
}

const NAV_ITEMS: NavItem[] = [
  { id: 'business',      label: 'Business profile',  icon: Building2,      group: 'profile' },
  { id: 'language',      label: 'Language',          icon: Globe,          group: 'preferences' },
  { id: 'appearance',    label: 'Appearance',        icon: Sun,            group: 'preferences' },
  { id: 'notifications', label: 'Notifications',     icon: Bell,           group: 'preferences' },
  { id: 'ordering',      label: 'Cashier ordering',  icon: ShoppingCart,   group: 'access' },
  { id: 'attendance',    label: 'Attendance',        icon: CalendarCheck,  group: 'access' },
  { id: 'features',      label: 'Feature toggles',   icon: SlidersHorizontal, group: 'access' },
];

const GROUP_META: Record<
  NavItem['group'],
  { label: string; icon: LucideIcon; iconClassName: string; iconBgClassName: string }
> = {
  profile:    { label: 'Profile & business',  icon: Building2,        iconClassName: 'text-amber-600 dark:text-amber-400',     iconBgClassName: 'bg-amber-500/10' },
  preferences:{ label: 'Preferences',         icon: Sparkles,         iconClassName: 'text-violet-600 dark:text-violet-400', iconBgClassName: 'bg-violet-500/10' },
  access:     { label: 'Access & permissions',icon: ShieldCheck,      iconClassName: 'text-emerald-600 dark:text-emerald-400', iconBgClassName: 'bg-emerald-500/10' },
};

export const OwnerSettings: React.FC = () => {
  const { t } = useTranslation('owner');
  const { openWizard } = useOnboardingStore();
  const { setPageTitle, setShowDateRange } = useHeaderStore();
  const [activeId, setActiveId] = useState<string>(NAV_ITEMS[0].id);

  // Reflect the current section in the global header.
  useEffect(() => {
    setPageTitle({
      title: t('settings.title', { defaultValue: 'System Settings' }),
      subtitle: t('settings.subtitle', {
        defaultValue: 'Manage your business profile, preferences, and what each role can do across the system.',
      }),
    });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange, t]);

  // Scroll-spy: track which section is currently in view.
  useEffect(() => {
    const sectionIds = NAV_ITEMS.map((n) => n.id);
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the section closest to the top that's intersecting.
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
  }, []);

  const grouped = (['profile', 'preferences', 'access'] as const).map((g) => ({
    group: g,
    meta: GROUP_META[g],
    items: NAV_ITEMS.filter((n) => n.group === g),
  }));

  const handleJump = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top, behavior: 'smooth' });
    setActiveId(id);
  };

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      {/* ─── Hero ──────────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-2xl border border-border/40 bg-card px-6 py-7 shadow-[0_18px_48px_-28px_rgba(15,23,42,0.30),0_4px_12px_-8px_rgba(249,115,22,0.10)] sm:px-8 sm:py-8">
        {/* Soft brand-blue glow accents — keeps it on-brand without overwhelming */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl"
        />

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_24px_-10px_hsl(var(--primary)/0.55)] ring-1 ring-inset ring-white/10">
              <Settings className="h-6 w-6" strokeWidth={2} />
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {t('settings.title', { defaultValue: 'System Settings' })}
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Synced
                </span>
              </div>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {t('settings.subtitle', {
                  defaultValue:
                    'Manage your business profile, preferences, and what each role can do across the system.',
                })}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:self-start">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openWizard(0)}
              leftIcon={<RotateCcw className="h-4 w-4" />}
              className="border-border/60"
            >
              {t('settings.reRunSetup', { defaultValue: 'Re-run Setup Guide' })}
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Page body: grouped sections + sticky TOC rail ─────── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_220px] lg:gap-10">
        <div className="min-w-0 space-y-8">
          {grouped.map(({ group, meta, items }) => {
            const GroupIcon = meta.icon;
            return (
              <div key={group} className="space-y-3">
                {/* Group heading (not a card, just a labeled anchor) */}
                <div className="flex items-center gap-2.5 px-1">
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]',
                      meta.iconBgClassName,
                    )}
                  >
                    <GroupIcon className={cn('h-4 w-4', meta.iconClassName)} />
                  </span>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                    {t(`settings.groups.${group}`, { defaultValue: meta.label })}
                  </h2>
                  <span className="h-px flex-1 bg-gradient-to-r from-border/80 to-transparent" />
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {items.length} {items.length === 1 ? 'setting' : 'settings'}
                  </span>
                </div>

                <div className="space-y-3">
                  {items.map((item) => (
                    <SettingsCardForItem key={item.id} item={item} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* ─── Sticky TOC rail (desktop only) ─── */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-2">
            <p className="flex items-center gap-2 px-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <LayoutGrid className="h-3.5 w-3.5" />
              {t('settings.onThisPage', { defaultValue: 'On this page' })}
            </p>
            <nav className="rounded-xl border border-border/50 bg-card/60 p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              {grouped.map(({ group, meta, items }) => (
                <div key={group} className="px-1 py-1.5">
                  <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    {t(`settings.groups.${group}`, { defaultValue: meta.label })}
                  </p>
                  <ul className="space-y-0.5">
                    {items.map((item) => {
                      const isActive = activeId === item.id;
                      const ItemIcon = item.icon;
                      return (
                        <li key={item.id}>
                          <a
                            href={`#${item.id}`}
                            onClick={(e) => handleJump(e, item.id)}
                            className={cn(
                              'group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors',
                              isActive
                                ? 'bg-primary/10 font-semibold text-primary'
                                : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                            )}
                          >
                            <ItemIcon
                              className={cn(
                                'h-3.5 w-3.5 shrink-0',
                                isActive ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-muted-foreground',
                              )}
                            />
                            <span className="truncate">{item.label}</span>
                            {isActive && (
                              <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            )}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </aside>
      </div>
    </div>
  );
};

/**
 * Wraps a section's content in a SettingsGroup card. Each item in NAV_ITEMS
 * maps to exactly one of the section components below.
 */
const SettingsCardForItem: React.FC<{ item: NavItem }> = ({ item }) => {
  const ItemIcon = item.icon;
  const accent = accentForGroup(item.group);

  return (
    <SettingsGroup
      id={item.id}
      icon={ItemIcon}
      iconClassName={accent.iconClassName}
      iconBgClassName={accent.iconBgClassName}
      title={item.label}
      description={descriptionFor(item.id)}
    >
      {contentFor(item.id)}
    </SettingsGroup>
  );
};

/** Per-item accent — keeps the section badges color-coordinated with their group. */
function accentForGroup(group: NavItem['group']) {
  switch (group) {
    case 'profile':
      return { iconClassName: 'text-amber-700 dark:text-amber-300',     iconBgClassName: 'bg-amber-500/15' };
    case 'preferences':
      return { iconClassName: 'text-violet-700 dark:text-violet-300',   iconBgClassName: 'bg-violet-500/15' };
    case 'access':
      return { iconClassName: 'text-emerald-700 dark:text-emerald-300', iconBgClassName: 'bg-emerald-500/15' };
  }
}

/** Per-item description (matches the i18n keys added earlier; falls back to a clean default). */
function descriptionFor(id: string): string {
  const map: Record<string, string> = {
    business:      'Name, address, and currency shown on receipts and reports.',
    language:      'Choose how the app reads. Saved to your account so it follows you across devices.',
    appearance:    'Switch the app between light and dark. "System" uses the app\'s default light mode.',
    notifications: 'Pick which alerts reach your notification bell on this device.',
    ordering:      'What cashiers can do on their dashboard.',
    attendance:    'Whether the owner can correct historical attendance records and whether Sundays are working days.',
    features:      'Switch optional areas of the app on or off system-wide.',
  };
  return map[id] ?? '';
}

function contentFor(id: string): React.ReactNode {
  switch (id) {
    case 'business':      return <BusinessProfileSection />;
    case 'language':      return <LanguagePreferenceSection />;
    case 'appearance':    return <ThemePreferenceSection />;
    case 'notifications': return <NotificationPreferencesSection />;
    case 'ordering':      return <CashierOrderingToggle />;
    case 'attendance':    return <><OwnerAttendanceToggle /><WorkOnSundaysToggle /></>;
    case 'features':      return <FeatureToggles />;
    default:              return null;
  }
}
