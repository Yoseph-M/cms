import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { useSocketStore } from '../../store/socketStore';
import { useAuthStore } from '../../store/authStore';
import { formatDate } from '../../utils/calendar';

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  severity: string;
  isRead: boolean;
  relatedId?: string | null;
  createdAt: string;
}

function linkFor(n: NotificationItem, role: string): string {
  const base = role === 'MANAGER' ? '/manager' : '/owner';
  switch (n.type) {
    case 'MISSING_ATTENDANCE':
      return `${base}/attendance`;
    case 'PAYROLL_PERIOD_DUE':
      return `${base}/payroll`;
    case 'MENU_ITEM_UNAVAILABLE':
      return `${base}/menu`;
    case 'PRINTER_FAILURE':
      return role === 'OWNER' ? '/owner/printers' : '/manager/people';
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
  const { user } = useAuthStore();
  const { socket } = useSocketStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const role = user?.role || 'OWNER';
  const show = role === 'OWNER' || role === 'MANAGER';

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
      setItems((prev) => [n, ...prev].slice(0, 100));
    };
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
  }, [socket, show]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!show) return null;

  const unread = items.filter((i) => !i.isRead).length;

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
    MISSING_ATTENDANCE: 'Attendance', PRINTER_FAILURE: 'Printers',
    PAYROLL_PERIOD_DUE: 'Payroll', MENU_ITEM_UNAVAILABLE: 'Menu', SYSTEM_OVERRIDE: 'System',
  };
  const grouped = items.reduce<Record<string, NotificationItem[]>>((groups, item) => {
    const group = typeLabel[item.type] || 'System';
    (groups[group] ||= []).push(item);
    return groups;
  }, {});

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-4.5 h-4.5 w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[22rem] max-h-[28rem] rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl shadow-black/40 overflow-hidden z-50 flex flex-col">
          <div className="px-3 py-2.5 border-b border-border flex items-center justify-between bg-secondary/30">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                onClick={() => void markAll()}
                className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
              >
                <CheckCheck className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {items.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">No notifications yet.</p>
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
                        <p className="text-sm leading-snug">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                          {formatDate(n.createdAt)}
                        </p>
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
