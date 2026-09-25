import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCheck } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { axiosClient } from '../../api/axiosClient';
import { useSocketStore } from '../../store/socketStore';
import { useAuthStore } from '../../store/authStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { formatDate } from '../../utils/calendar';

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  severity: string;
  isRead: boolean;
  relatedId?: string | null;
  createdAt: string;
  /** null means "everyone who can approve"; otherwise it targets one role. */
  recipientRole?: string | null;
}

function linkFor(n: NotificationItem, role: string): string {
  const base =
    role === 'MANAGER' ? '/manager' : role === 'CASHIER' ? '/cashier' : '/owner';
  switch (n.type) {
    case 'MISSING_ATTENDANCE':
      return `${base}/attendance`;
    case 'PAYROLL_PERIOD_DUE':
      return `${base}/payroll`;
    case 'MENU_ITEM_UNAVAILABLE':
      return `${base}/menu`;
    case 'PRINTER_FAILURE':
      return role === 'CASHIER' ? '/cashier/printers' : role === 'OWNER' ? '/owner/printers' : '/manager/printers';
    case 'DAILY_CLOSE_REQUESTED':
      return role === 'MANAGER' ? '/manager/reconciliation' : '/owner';
    case 'DAILY_CLOSE_DECISION':
      return role === 'CASHIER' ? '/cashier/end-of-day' : base;
    case 'SYSTEM_OVERRIDE':
      return role === 'OWNER' ? '/owner/audit' : `${base}/attendance`;
    default:
      return base;
  }
}

const severityTone: Record<string, string> = {
  critical: 'border-l-destructive bg-destructive/5',
  warning: 'border-l-[hsl(var(--warning))] bg-[hsl(var(--warning))]/5',
  info: 'border-l-primary bg-primary/5',
};

export const NotificationBell: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { socket } = useSocketStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const role = user?.role || 'OWNER';
  // Cashiers carry a bell too: they are told when a manager approves or
  // disapproves the End of Day request they sent.
  const show = role === 'OWNER' || role === 'MANAGER' || role === 'CASHIER';

  // The owner can switch off their own ability to record attendance. With it
  // off, "please mark their attendance" alerts aren't theirs to act on, so the
  // owner's bell withholds them (managers keep theirs — recording today's
  // attendance is still their job).
  const ownerCanEditQuery = useSystemSettingQuery('ownerCanEditAttendance', show);
  const hideAttendanceAlerts = role === 'OWNER' && ownerCanEditQuery.data?.value === 'false';

  // A cashier's bell is about the counter: tickets that failed to print and the
  // answer to their End of Day request. Attendance, payroll and menu reminders
  // are the manager's and owner's to act on.
  const cashierRelevant = useCallback(
    (n: NotificationItem) => n.type === 'PRINTER_FAILURE' || n.type === 'DAILY_CLOSE_DECISION',
    [],
  );

  const visibleItems = useMemo(() => {
    let list = role === 'CASHIER' ? items.filter(cashierRelevant) : items;
    if (hideAttendanceAlerts) list = list.filter((i) => i.type !== 'MISSING_ATTENDANCE');
    return list;
  }, [items, role, cashierRelevant, hideAttendanceAlerts]);

  const fetchItems = useCallback(async () => {
    try {
      const res = await axiosClient.get('/notifications');
      setItems(res.data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!show) return;
    void fetchItems();
  }, [show, fetchItems]);

  useEffect(() => {
    if (!socket || !show) return;
    const onNew = (n: NotificationItem) => {
      // Broadcasts (no recipientRole) are for every approver; a role-targeted
      // notification must not leak into another role's bell.
      if (n.recipientRole && n.recipientRole !== role) return;
      if (role === 'CASHIER' && !cashierRelevant(n)) return;
      setItems((prev) => [n, ...prev].slice(0, 100));
    };
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
  }, [socket, show, role, cashierRelevant]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!show) return null;

  const unread = visibleItems.filter((i) => !i.isRead).length;

  const markRead = async (id: string) => {
    try {
      await axiosClient.patch(`/notifications/${id}/read`);
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isRead: true } : i)));
    } catch {
      /* ignore */
    }
  };

  const markAll = async () => {
    try {
      await axiosClient.patch('/notifications/read-all');
      setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
    } catch {
      /* ignore */
    }
  };

  const typeLabel: Record<string, string> = {
    MISSING_ATTENDANCE: t('notifications.groupAttendance'), PRINTER_FAILURE: t('notifications.groupPrinters'),
    PAYROLL_PERIOD_DUE: t('notifications.groupPayroll'), MENU_ITEM_UNAVAILABLE: t('notifications.groupMenu'), SYSTEM_OVERRIDE: t('notifications.groupSystem'),
    DAILY_CLOSE_REQUESTED: t('notifications.groupEndOfDay'), DAILY_CLOSE_DECISION: t('notifications.groupEndOfDay'),
  };

  // Short, plain-language headline per type so a glance is enough to know what
  // a notification is about before reading the sentence below it.
  const typeTitle: Record<string, string> = {
    MISSING_ATTENDANCE: t('notifications.titleAttendance'),
    PRINTER_FAILURE: t('notifications.titlePrinter'),
    PAYROLL_PERIOD_DUE: t('notifications.titlePayroll'),
    MENU_ITEM_UNAVAILABLE: t('notifications.titleMenu'),
    SYSTEM_OVERRIDE: t('notifications.titleSystem'),
    DAILY_CLOSE_REQUESTED: t('notifications.titleCloseRequested'),
    DAILY_CLOSE_DECISION: t('notifications.titleCloseDecision'),
  };
  const grouped = visibleItems.reduce<Record<string, NotificationItem[]>>((groups, item) => {
    const group = typeLabel[item.type] || t('notifications.groupSystem');
    (groups[group] ||= []).push(item);
    return groups;
  }, {});

  return (
    <div className="relative" ref={ref}>
      <Tooltip label={t('notifications.title')} side="bottom" align="end">
        <button
          onClick={() => setOpen((o) => !o)}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label={t('notifications.title')}
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </Tooltip>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-[22rem] max-h-[28rem] rounded-xl border border-border bg-popover text-popover-foreground shadow-xl overflow-hidden z-50 flex flex-col">
          <div className="px-3 py-2.5 border-b border-border flex items-center justify-between bg-secondary/30">
            <p className="text-sm font-semibold">{t('notifications.title')}</p>
            {unread > 0 && (
              <button
                onClick={() => void markAll()}
                className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
              >
                <CheckCheck className="w-3 h-3" /> {t('notifications.markAllRead')}
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {visibleItems.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">{t('notifications.noneYet')}</p>
            ) : (
              <>
              {Object.entries(grouped).map(([group, groupItems]) => (
                  <div key={group}>
                    <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {group}
                    </p>
                    {groupItems.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          void markRead(n.id);
                          setOpen(false);
                          navigate(n.type === 'MISSING_ATTENDANCE' && n.relatedId ? `${linkFor(n, role)}?staff=${n.relatedId}` : linkFor(n, role));
                        }}
                        className={`w-full text-left px-3 py-2.5 border-l-2 border-b border-border/60 hover:bg-secondary/40 transition-colors ${
                          severityTone[n.severity] || severityTone.info
                        } ${n.isRead ? 'opacity-60' : ''}`}
                      >
                        {/* Headline on the left, the time it landed on the right —
                            the eye reads "what" and "when" in one pass. */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            {typeTitle[n.type] && (
                              <p className="text-[11px] font-bold text-foreground">{typeTitle[n.type]}</p>
                            )}
                            <p className="text-sm leading-snug text-muted-foreground">{n.message}</p>
                          </div>
                          <span className="shrink-0 pt-0.5 text-right text-[10px] font-mono leading-tight text-muted-foreground">
                            <span className="block font-semibold text-foreground/80">
                              {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="block">{formatDate(n.createdAt)}</span>
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
              ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
