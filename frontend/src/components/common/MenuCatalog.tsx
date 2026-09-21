import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { axiosClient } from '../../api/axiosClient';
import { extractErrorMessage } from '../../utils/errorHandler';
import { fileToCompressedDataUrl } from '../../utils/imageResize';
import { useToastStore } from '../../store/toastStore';
import { useSocketStore } from '../../store/socketStore';
import { useHeaderStore } from '../../store/headerStore';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';
import { Input } from '../ui/Input';
import { Sheet } from '../ui/Sheet';
import { Tooltip } from '../ui/Tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/Dropdown';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { motion, AnimatePresence } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  Plus,
  Pencil,
  Trash2,
  UtensilsCrossed,
  Search,
  Upload,
  ArrowUpDown,
  CheckSquare,
  Check,
  Coffee,
  CakeSlice,
  Sparkles,
  LayoutGrid,
  List,
  Banknote,
  Layers,
  CircleCheck,
  EyeOff,
  Languages,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '../../utils/currency';
import { useMenuQuery } from '../../hooks/useCachedQueries';
import { cn } from '../../lib/utils';

interface MenuItem {
  id: string;
  name: string;
  nameAmharic?: string | null;
  category: 'FOOD' | 'DRINK' | 'DESSERT' | 'OTHER';
  price: number;
  isAvailable: boolean;
  imageUrl?: string;
}

const CATEGORIES = ['All', 'FOOD', 'DRINK', 'DESSERT', 'OTHER'] as const;

type MenuCategory = Exclude<(typeof CATEGORIES)[number], 'All'>;

const CATEGORY_META: Record<MenuCategory, { label: string; icon: LucideIcon; badge: 'success' | 'default' | 'warning' | 'neutral'; tint: string }> = {
  FOOD: { label: 'Food', icon: UtensilsCrossed, badge: 'success', tint: 'bg-[hsl(var(--success))]/10 text-success' },
  DRINK: { label: 'Drink', icon: Coffee, badge: 'default', tint: 'bg-primary/10 text-primary' },
  DESSERT: { label: 'Dessert', icon: CakeSlice, badge: 'warning', tint: 'bg-[hsl(var(--warning))]/10 text-warning' },
  OTHER: { label: 'Other', icon: Sparkles, badge: 'neutral', tint: 'bg-secondary text-muted-foreground' },
};

const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'price-asc', label: 'Price (Low → High)' },
  { value: 'price-desc', label: 'Price (High → Low)' },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]['value'];

// Both names are shown in the form and both are mandatory: an item that is
// missing either language is unusable to whichever language the operator is
// running, so the form refuses to save a half-named item instead of silently
// seeding one name from the other.
const menuFormSchema = z.object({
  name: z.string().trim().min(1, 'English name is required.'),
  nameAmharic: z
    .string()
    .trim()
    .min(1, 'Amharic name is required.')
    .max(200, 'Amharic name is too long.'),
  category: z.enum(['FOOD', 'DRINK', 'DESSERT', 'OTHER'], { message: 'Category is required.' }),
  price: z.coerce.number().positive('Price must be a positive number.'),
});

const EMPTY_FORM = {
  name: '',
  nameAmharic: '',
  category: 'FOOD' as MenuItem['category'],
  price: '',
  imageUrl: '',
  isAvailable: true,
};

const StatCard: React.FC<{
  icon: LucideIcon;
  iconClass: string;
  value: number;
  label: string;
}> = ({ icon: Icon, iconClass, value, label }) => (
  <Card className="p-5 flex items-center gap-4">
    <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center shrink-0', iconClass)}>
      <Icon className="w-6 h-6" />
    </div>
    <div className="min-w-0">
      <p className="text-2xl font-bold text-foreground leading-none tracking-tight">
        <AnimatedNumber value={value} />
      </p>
      <p className="text-sm text-muted-foreground mt-1.5 font-medium truncate">{label}</p>
    </div>
  </Card>
);

interface MenuCatalogProps {
  canEdit?: boolean;
  showAvailability?: boolean;
}

export const MenuCatalog: React.FC<MenuCatalogProps> = ({ canEdit = true, showAvailability = true }) => {
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const { setPageTitle, setShowDateRange } = useHeaderStore();
  const { i18n } = useTranslation();

  // The Amharic UI shows ONLY the Amharic name — never the English one.
  // Every other language shows the English `name`. Items that have no
  // Amharic name yet surface as an em dash so the gap stays visible.
  const isAmharic = i18n.language?.startsWith('am');
  const displayName = useCallback(
    (item: Pick<MenuItem, 'name' | 'nameAmharic'>) =>
      (isAmharic ? item.nameAmharic : item.name) || '',
    [isAmharic]
  );

  // Reflect the current section in the global header.
  useEffect(() => {
    setPageTitle({
      title: 'Menu catalog',
      subtitle: canEdit ? 'Manage items, categories, and availability' : 'Browse the menu catalog',
    });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange, canEdit]);

  const menuQuery = useMenuQuery();
  const items: MenuItem[] = menuQuery.data ?? [];
  const isLoading = menuQuery.isLoading;
  const error = menuQuery.error
    ? extractErrorMessage(menuQuery.error, 'Failed to load menu.')
    : null;

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortValue>('name-asc');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const searchDebounce = useRef<ReturnType<typeof setTimeout>>();

  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const pendingDeletes = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Overlay ONLY for deletions (hidden until the 6s undo window elapses).
  // Availability toggles deliberately do NOT use this overlay — they patch the
  // shared query cache directly, which is both faster (no double render from a
  // local copy syncing) and race-proof across simultaneous toggles.
  const [localItems, setLocalItems] = useState<MenuItem[] | null>(null);

  const displayItems: MenuItem[] = localItems ?? items;

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const invalidateMenu = useCallback(() => {
    setLocalItems(null);
    void queryClient.invalidateQueries({ queryKey: ['menu'] });
  }, [queryClient]);

  const { socket } = useSocketStore();

  // Patch one item's availability across every cached menu-list variant
  // ('all/all', category-filtered copies, etc.), used by toggles, bulk
  // actions, and socket broadcasts.
  const patchAvailability = useCallback(
    (id: string, isAvailable: boolean) => {
      // Query.setData both updates the data and re-stamps dataUpdatedAt, so
      // the 5-minute staleTime restarts — otherwise a refetchOnMount/Focus/
      // Reconnect (or an unrelated invalidate) fires a background GET that
      // can race this optimistic state and visually revert the switch.
      for (const query of queryClient.getQueryCache().findAll({ queryKey: ['menu'] })) {
        if (!Array.isArray(query.state.data)) continue;
        if (!query.state.data.some((i) => i.id === id)) continue;
        query.setData(query.state.data.map((i) => (i.id === id ? { ...i, isAvailable } : i)));
      }
      setLocalItems((prevList) =>
        prevList ? prevList.map((i) => (i.id === id ? { ...i, isAvailable } : i)) : prevList
      );
    },
    [queryClient]
  );

  useEffect(() => {
    if (!socket) return;
    // Apply another client's change straight to the cache. A broadcast must
    // never wipe THIS client's other in-flight optimistic toggles — the old
    // full-invalidate handler did exactly that (toggling one item reverted
    // another whose request was still in flight).
    const onAvailability = (payload: { id: string; isAvailable: boolean }) => {
      if (payload?.id) patchAvailability(payload.id, payload.isAvailable);
    };
    socket.on('menu:availabilityChanged', onAvailability);
    return () => {
      socket.off('menu:availabilityChanged', onAvailability);
    };
  }, [socket, patchAvailability]);

  const stats = useMemo(() => {
    const availableCount = displayItems.filter((i) => i.isAvailable).length;
    return {
      total: displayItems.length,
      available: availableCount,
      hidden: displayItems.length - availableCount,
      categories: new Set(displayItems.map((i) => i.category)).size,
    };
  }, [displayItems]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: displayItems.length };
    for (const item of displayItems) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    return counts;
  }, [displayItems]);

  const filteredItems = useMemo(
    () =>
      displayItems.filter((item) => {
        const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
        // Match against the name the user actually sees (Amharic name in the
        // Amharic UI), so searching "ቡና" finds items whose English name is
        // "Coffee" and vice versa.
        const matchesSearch = displayName(item).toLowerCase().includes(search.toLowerCase());
        return matchesCategory && matchesSearch;
      }),
    [displayItems, categoryFilter, search, displayName]
  );

  const visibleItems = useMemo(() => {
    const list = [...filteredItems];
    if (sortBy === 'price-asc') return list.sort((a, b) => a.price - b.price);
    if (sortBy === 'price-desc') return list.sort((a, b) => b.price - a.price);
    // Sort by the displayed name so A–Z is correct in the Amharic UI too.
    return list.sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [filteredItems, sortBy, displayName]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds((prev) => {
      const allSelected = visibleItems.length > 0 && visibleItems.every((i) => prev.has(i.id));
      return allSelected ? new Set() : new Set(visibleItems.map((i) => i.id));
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => setSearch(e.target.value), 300);
  };

  const validateForm = () => {
    const result = menuFormSchema.safeParse(form);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const key = issue.path[0]?.toString();
        if (key) errors[key] = issue.message;
      });
      setFormErrors(errors);
      return false;
    }
    setFormErrors({});
    return true;
  };

  const isFormValid = menuFormSchema.safeParse(form).success;

  const openAdd = () => {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setImagePreview(null);
    setSlideOverOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      // Always prefill the stored value so an Amharic-UI user saving the form
      // never silently wipes the English name (and vice versa).
      nameAmharic: item.nameAmharic || '',
      category: item.category,
      price: String(item.price),
      imageUrl: item.imageUrl || '',
      isAvailable: item.isAvailable,
    });
    setFormErrors({});
    setImagePreview(item.imageUrl || null);
    setSlideOverOpen(true);
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setIsSaving(true);
    try {
      const parsed = menuFormSchema.parse(form);
      const payload = {
        // Both names are validated as non-empty above, so they go through as
        // entered — no seeding one from the other.
        name: parsed.name,
        nameAmharic: parsed.nameAmharic,
        category: parsed.category,
        price: parsed.price,
        imageUrl: form.imageUrl || null,
        isAvailable: form.isAvailable,
      };
      if (editingItem) {
        await axiosClient.patch(`/menu/${editingItem.id}`, payload);
        addToast({ type: 'success', title: 'Item updated' });
      } else {
        await axiosClient.post('/menu', payload);
        addToast({ type: 'success', title: 'Item added to menu' });
      }
      invalidateMenu();
      setSlideOverOpen(false);
    } catch (err: unknown) {
      addToast({ type: 'error', title: 'Save failed', message: extractErrorMessage(err, 'Failed to save item.') });
    } finally {
      setIsSaving(false);
    }
  };

  // Availability toggles are optimistic mutations against the SHARED query
  // cache. Each toggle flips only its own item and rolls back only its own
  // item, so a failing toggle can never revert a different item that is
  // mid-flight (the old shared-overlay version did exactly that).
  const toggleAvailabilityMutation = useMutation({
    mutationKey: ['menu', 'toggleAvailability'],
    mutationFn: async (vars: { id: string; isAvailable: boolean }) => {
      await axiosClient.patch(`/menu/${vars.id}/availability`, { isAvailable: vars.isAvailable });
    },
    onMutate: async (vars) => {
      // Stop an in-flight menu fetch from landing over the optimistic flip.
      await queryClient.cancelQueries({ queryKey: ['menu'] });
      patchAvailability(vars.id, vars.isAvailable);
    },
    onError: (err, vars) => {
      // Roll back ONLY this item — restoring a whole-list snapshot could
      // revert a different toggle that committed while this request failed.
      patchAvailability(vars.id, !vars.isAvailable);
      addToast({ type: 'error', title: 'Availability update failed', message: extractErrorMessage(err, 'Failed to update availability.') });
    },
    onSettled: () => {
      // Silent reconciliation: refetch only queries with no mounted observer
      // (background copies owned by other pages). The caller's cache was just
      // patched optimistically, so an active refetch here adds a needless
      // GET (and a window where a mid-flight response can flash old state).
      void queryClient.invalidateQueries({
        queryKey: ['menu'],
        refetchType: 'none',
      });
    },
  });

  const inFlightToggles = useRef<Set<string>>(new Set());

  const handleAvailabilityToggle = useCallback(
    (item: MenuItem) => {
      // Ignore clicks on an item whose toggle request is still in flight —
      // two racing requests for one item could land out of order.
      if (inFlightToggles.current.has(item.id)) return;
      inFlightToggles.current.add(item.id);
      toggleAvailabilityMutation.mutate(
        { id: item.id, isAvailable: !item.isAvailable },
        { onSettled: () => inFlightToggles.current.delete(item.id) }
      );
    },
    [toggleAvailabilityMutation]
  );

  const handleDelete = useCallback((item: MenuItem) => {
    const existing = pendingDeletes.current.get(item.id);
    if (existing) clearTimeout(existing);

    setLocalItems((prev) => {
      const list = prev ?? items;
      return list.filter((i) => i.id !== item.id);
    });

    const executeDelete = async () => {
      try {
        await axiosClient.delete(`/menu/${item.id}`);
        pendingDeletes.current.delete(item.id);
        invalidateMenu();
      } catch (err: unknown) {
        setLocalItems((prev) => {
          const list = prev ?? items;
          if (list.some((i) => i.id === item.id)) return list;
          return [...list, item];
        });
        addToast({ type: 'error', title: 'Delete failed', message: extractErrorMessage(err, 'Failed to delete item.') });
        pendingDeletes.current.delete(item.id);
      }
    };

    const timeoutId = setTimeout(executeDelete, 6000);
    pendingDeletes.current.set(item.id, timeoutId);

    const undo = () => {
      const t = pendingDeletes.current.get(item.id);
      if (t) clearTimeout(t);
      pendingDeletes.current.delete(item.id);
      setLocalItems((prev) => {
        const list = prev ?? items;
        if (list.some((i) => i.id === item.id)) return list;
        return [...list, item];
      });
      addToast({
        type: 'info',
        title: `Removed — ${displayName(item)} restored to menu`,
      });
    };

    addToast({
      type: 'success',
      title: `${displayName(item)} removed from menu`,
      message: 'Item is no longer visible in the catalog.',
      undo: { label: 'Undo', onClick: undo },
    });
  }, [items, addToast, invalidateMenu, displayName]);

  const bulkAvailabilityMutation = useMutation({
    mutationKey: ['menu', 'bulkAvailability'],
    mutationFn: async (vars: { ids: string[]; isAvailable: boolean }) => {
      await axiosClient.patch('/menu/availability/bulk', vars);
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['menu'] });
      for (const id of vars.ids) patchAvailability(id, vars.isAvailable);
    },
    onSuccess: (_data, vars) => {
      addToast({
        type: 'success',
        title: vars.isAvailable
          ? `${vars.ids.length} item${vars.ids.length > 1 ? 's' : ''} marked available`
          : `${vars.ids.length} item${vars.ids.length > 1 ? 's' : ''} marked unavailable`,
      });
      clearSelection();
      setSelectMode(false);
    },
    onError: (err, vars) => {
      // Roll back only the affected items, never the whole list.
      for (const id of vars.ids) patchAvailability(id, !vars.isAvailable);
      addToast({ type: 'error', title: 'Bulk update failed', message: extractErrorMessage(err, 'Failed to update items.') });
    },
    onSettled: () => {
      // Same rationale as the single toggle: silent invalidate — other pages
      // refetch on their next mount, the active page keeps its optimistic
      // state with no extra round-trip.
      void queryClient.invalidateQueries({
        queryKey: ['menu'],
        refetchType: 'none',
      });
    },
  });

  const handleBulkAvailability = useCallback(
    (nextAvailable: boolean) => {
      if (selectedIds.size === 0 || bulkAvailabilityMutation.isPending) return;
      bulkAvailabilityMutation.mutate({ ids: Array.from(selectedIds), isAvailable: nextAvailable });
    },
    [selectedIds, bulkAvailabilityMutation]
  );

  const handleImageFile = (file: File) => {
    fileToCompressedDataUrl(file)
      .then((dataUrl) => {
        setImagePreview(dataUrl);
        setForm((f) => ({ ...f, imageUrl: dataUrl }));
      })
      .catch(() => {
        addToast({ type: 'error', title: 'Could not process image', message: 'Try a different file.' });
      });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageFile(file);
  };

  const clearImage = () => {
    setImagePreview(null);
    setForm((f) => ({ ...f, imageUrl: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Paste image (screenshot / copied file) or an image URL while the form is open
  useEffect(() => {
    if (!slideOverOpen) return;
    const onPaste = (e: ClipboardEvent) => {
      const clipboardItems = e.clipboardData?.items;
      if (clipboardItems) {
        for (const item of Array.from(clipboardItems)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              e.preventDefault();
              handleImageFile(file);
              return;
            }
          }
        }
      }
      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (text && (/^data:image\//i.test(text) || /^https?:\/\/\S+$/i.test(text))) {
        setImagePreview(text);
        setForm((f) => ({ ...f, imageUrl: text }));
        addToast({ type: 'success', title: 'Image added from clipboard' });
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideOverOpen]);

  const canSelect = canEdit && showAvailability;

  const availabilityCluster = (item: MenuItem, labelWidth?: string) => (
    <span className={cn('flex items-center gap-1.5', labelWidth)}>
      <Switch
        id={`avail-${item.id}`}
        checked={item.isAvailable}
        onCheckedChange={() => handleAvailabilityToggle(item)}
        disabled={!canEdit || selectMode}
      />
      <span className={cn('text-[11px] font-medium', item.isAvailable ? 'text-success' : 'text-destructive')}>
        {item.isAvailable ? 'Available' : 'Unavailable'}
      </span>
    </span>
  );

  const actionButtons = (item: MenuItem, iconClass = 'w-3.5 h-3.5') => (
    <div className="flex items-center gap-0.5 shrink-0">
      <Tooltip label="Edit" side="top">
        <button
          onClick={() => openEdit(item)}
          className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          aria-label={`Edit ${item.name}`}
        >
          <Pencil className={iconClass} />
        </button>
      </Tooltip>
      <Tooltip label="Remove" side="top">
        <button
          onClick={() => handleDelete(item)}
          className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          aria-label={`Delete ${item.name}`}
        >
          <Trash2 className={iconClass} />
        </button>
      </Tooltip>
    </div>
  );

  const selectCheckbox = (selected: boolean, inline = false) => (
    <span
      className={cn(
        'w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors',
        !inline && 'absolute top-2.5 left-2.5 z-20 pointer-events-none shadow-md',
        selected ? 'bg-primary border-primary' : 'bg-background/90 border-border'
      )}
    >
      {selected && <Check className="w-4 h-4 text-primary-foreground" strokeWidth={3} />}
    </span>
  );

  const renderGridCard = (item: MenuItem, selected: boolean) => {
    const meta = CATEGORY_META[item.category];
    const name = displayName(item);
    return (
      <Card
        className={cn(
          'overflow-hidden flex flex-col group h-full',
          selectMode && 'pointer-events-none',
          !item.isAvailable && 'opacity-90'
        )}
      >
        {selectMode && selectCheckbox(selected)}
        <div className="relative w-full h-36 bg-secondary/40 overflow-hidden">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className={cn(
                'w-full h-full object-cover transition-transform duration-150 ease-out group-hover:scale-105',
                !item.isAvailable && 'grayscale' // no filter transition — instant snap
              )}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-secondary/70 via-secondary/40 to-transparent flex items-center justify-center">
              {React.createElement(meta.icon, { className: 'w-10 h-10 text-muted-foreground/30' })}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
          <Badge variant={meta.badge} className="absolute top-2 right-2 text-[10px] px-2 py-0.5 shadow-sm backdrop-blur-sm">
            {meta.label}
          </Badge>
          {!item.isAvailable && (
            <Badge variant="destructive" className="absolute top-2 right-2 text-[10px] px-2 py-0.5 shadow-sm gap-1">
              <EyeOff className="w-3 h-3" />
              Unavailable
            </Badge>
          )}
        </div>
        <CardContent className="p-3 pt-3 flex flex-col gap-2 flex-1">
          <p className={cn('font-semibold text-sm truncate', name ? 'text-foreground' : 'text-muted-foreground')} title={name}>
            {name || '—'}
          </p>
          <p className="text-base font-mono font-bold text-primary tracking-tight">
            {formatCurrency(item.price)}
          </p>
          {(canEdit || showAvailability) && (
            <div className="flex items-center justify-between mt-auto pt-2.5 border-t border-border/40">
              {showAvailability ? (
                canEdit && !selectMode ? (
                  <Tooltip label="Toggle availability" side="top">
                    {availabilityCluster(item)}
                  </Tooltip>
                ) : (
                  availabilityCluster(item)
                )
              ) : (
                <span />
              )}
              {canEdit && !selectMode && actionButtons(item)}
              {selectMode && (
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide">
                  {selected ? 'Selected' : 'Click card'}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderListRow = (item: MenuItem, selected: boolean) => {
    const meta = CATEGORY_META[item.category];
    const name = displayName(item);
    return (
      <Card className={cn('overflow-hidden group', selectMode && 'pointer-events-none')}>
        <div className="flex items-center gap-3 p-3">
          {selectMode && selectCheckbox(selected, true)}
          {renderThumb(item, 'w-16 h-16 rounded-xl')}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className={cn('font-semibold text-sm truncate', name ? 'text-foreground' : 'text-muted-foreground')}>{name || '—'}</p>
              {!item.isAvailable && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0 gap-1">
                  <EyeOff className="w-2.5 h-2.5" />
                  Unavailable
                </Badge>
              )}
            </div>
            <Badge variant={meta.badge} className="text-[10px] px-1.5 py-0 mt-1.5">
              {meta.label}
            </Badge>
          </div>
          <p className="text-sm font-mono font-bold text-primary shrink-0">
            {formatCurrency(item.price)}
          </p>
          {showAvailability && (
            <div className="hidden sm:flex items-center pl-2 border-l border-border/40">
              {canEdit && !selectMode ? (
                <Tooltip label="Toggle availability" side="top">
                  {availabilityCluster(item, 'w-[68px]')}
                </Tooltip>
              ) : (
                availabilityCluster(item, 'w-[68px]')
              )}
            </div>
          )}
          {canEdit && !selectMode && actionButtons(item, 'w-4 h-4')}
        </div>
      </Card>
    );
  };

  const renderThumb = (item: MenuItem, className?: string) => (
    <div className={cn('relative overflow-hidden bg-secondary/40 flex items-center justify-center shrink-0', className)}>
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        React.createElement(CATEGORY_META[item.category].icon, {
          className: 'w-6 h-6 text-muted-foreground/40',
        })
      )}
      {!item.isAvailable && (
        <div className={cn('absolute inset-0 bg-background/60 backdrop-grayscale flex items-center justify-center gap-1.5', showAvailability && 'opacity-80')}>
          <EyeOff className="w-4 h-4 text-destructive" />
          {!showAvailability && <span className="text-[10px] font-bold uppercase tracking-wide text-destructive">Unavailable</span>}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className={cn('grid gap-4', showAvailability ? 'grid-cols-4 max-[767px]:grid-cols-2 max-[419px]:grid-cols-1' : 'grid-cols-2 max-[767px]:grid-cols-1')}>
        <StatCard icon={Layers} iconClass="bg-primary/10 text-primary" value={stats.total} label="Total Items" />
        {showAvailability ? (
          <>
            <StatCard
              icon={CircleCheck}
              iconClass="bg-[hsl(var(--success))]/10 text-success"
              value={stats.available}
              label="Available Now"
            />
            <StatCard
              icon={EyeOff}
              iconClass="bg-destructive/10 text-destructive"
              value={stats.hidden}
              label="Unavailable Items"
            />
          </>
        ) : null}
        <StatCard icon={UtensilsCrossed} iconClass="bg-secondary text-slate-600" value={stats.categories} label="Categories" />
      </div>

      <Card className="p-4 sm:p-5 space-y-4">
        {!canEdit ? (
          /* Read-only (owner/manager with menu config disabled) — search + filters in one row */
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <Input
              type="text"
              defaultValue={search}
              onChange={handleSearchChange}
              placeholder="Search menu items…"
              leftIcon={<Search className="w-4 h-4" />}
              className="flex-1 min-w-[200px] max-[419px]:min-w-0"
              aria-label="Search menu items"
            />

            <div className="flex items-center gap-2 sm:gap-3 flex-wrap ml-auto justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="Filter by category" className="shrink-0 h-11">
                  {categoryFilter === 'All'
                    ? <LayoutGrid className="w-4 h-4 text-muted-foreground" />
                    : React.createElement(CATEGORY_META[categoryFilter as MenuCategory].icon, { className: 'w-4 h-4 text-muted-foreground' })}
                  <span>{categoryFilter === 'All' ? 'All' : CATEGORY_META[categoryFilter as MenuCategory].label}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat === 'All' ? LayoutGrid : CATEGORY_META[cat].icon;
                    return (
                      <DropdownMenuItem
                        key={cat}
                        selected={categoryFilter === cat}
                        onSelect={() => setCategoryFilter(cat)}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{cat === 'All' ? 'All' : CATEGORY_META[cat].label}</span>
                        <span className="ml-auto text-xs text-muted-foreground font-mono">{categoryCounts[cat] ?? 0}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger aria-label="View mode" className="shrink-0 w-[104px] h-11">
                  {view === 'grid' ? <LayoutGrid className="w-4 h-4 text-muted-foreground" /> : <List className="w-4 h-4 text-muted-foreground" />}
                  <span>{view === 'grid' ? 'Grid' : 'List'}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem selected={view === 'grid'} onSelect={() => setView('grid')}>
                    <LayoutGrid className="w-4 h-4 shrink-0" />
                    Grid view
                  </DropdownMenuItem>
                  <DropdownMenuItem selected={view === 'list'} onSelect={() => setView('list')}>
                    <List className="w-4 h-4 shrink-0" />
                    List view
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ) : (
          <>
        {/* Row 1 — search, primary actions */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap lg:flex-nowrap">
          <Input
            type="text"
            defaultValue={search}
            onChange={handleSearchChange}
            placeholder="Search menu items…"
            leftIcon={<Search className="w-4 h-4" />}
            className="flex-1 min-w-[200px] max-[419px]:min-w-0"
            aria-label="Search menu items"
          />

          {canEdit && !selectMode && (
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap lg:flex-nowrap ml-auto shrink-0 justify-end">
              <Button id="add-menu-item-btn" className="h-11" onClick={openAdd}>
                <Plus className="w-4 h-4" />
                Add Item
              </Button>
            </div>
          )}

          {canEdit && selectMode && (
            <div className="flex items-center gap-2 flex-wrap ml-auto shrink-0 justify-end">
              <Button variant="outline" size="sm" onClick={selectAllVisible} disabled={visibleItems.length === 0}>
                <CheckSquare className="w-3.5 h-3.5" />
                Select All ({visibleItems.length})
              </Button>
              {showAvailability && (
                <>
                  <Button size="sm" variant="outline" onClick={() => handleBulkAvailability(true)} disabled={selectedIds.size === 0 || bulkAvailabilityMutation.isPending}>
                    Mark Available
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleBulkAvailability(false)} disabled={selectedIds.size === 0 || bulkAvailabilityMutation.isPending}>
                    Mark Unavailable
                  </Button>
                </>
              )}
              {selectedIds.size > 0 && (
                <Badge variant="default" className="text-xs">
                  {selectedIds.size} selected
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border/40" />

        {/* Row 2 — result count, category filter, view mode, select */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-between">
          <p className="text-xs text-muted-foreground font-medium hidden sm:block">
            Showing <span className="font-bold text-foreground">{visibleItems.length}</span> of{' '}
            <span className="font-bold text-foreground">{displayItems.length}</span> items
          </p>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap ml-auto justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Sort menu items" className="shrink-0 w-[170px] h-11">
                <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                <span>{SORT_OPTIONS.find((opt) => opt.value === sortBy)?.label}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {SORT_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    selected={sortBy === opt.value}
                    onSelect={() => setSortBy(opt.value)}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Filter by category" className="shrink-0 h-11">
                {categoryFilter === 'All'
                  ? <LayoutGrid className="w-4 h-4 text-muted-foreground" />
                  : React.createElement(CATEGORY_META[categoryFilter as MenuCategory].icon, { className: 'w-4 h-4 text-muted-foreground' })}
                <span>{categoryFilter === 'All' ? 'All' : CATEGORY_META[categoryFilter as MenuCategory].label}</span>
                <span className="text-[10px] font-bold rounded-md bg-background px-1.5 py-0.5 border border-border/60">
                  {categoryCounts[categoryFilter] ?? 0}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {CATEGORIES.map((cat) => {
                  const Icon = cat === 'All' ? LayoutGrid : CATEGORY_META[cat].icon;
                  return (
                    <DropdownMenuItem
                      key={cat}
                      selected={categoryFilter === cat}
                      onSelect={() => setCategoryFilter(cat)}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{cat === 'All' ? 'All' : CATEGORY_META[cat].label}</span>
                      <span className="ml-auto text-xs text-muted-foreground font-mono">{categoryCounts[cat] ?? 0}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger aria-label="View mode" className="shrink-0 w-[104px] h-11">
                {view === 'grid' ? <LayoutGrid className="w-4 h-4 text-muted-foreground" /> : <List className="w-4 h-4 text-muted-foreground" />}
                <span>{view === 'grid' ? 'Grid' : 'List'}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem selected={view === 'grid'} onSelect={() => setView('grid')}>
                  <LayoutGrid className="w-4 h-4 shrink-0" />
                  Grid view
                </DropdownMenuItem>
                <DropdownMenuItem selected={view === 'list'} onSelect={() => setView('list')}>
                  <List className="w-4 h-4 shrink-0" />
                  List view
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {canSelect && (
              <button
                type="button"
                role="checkbox"
                aria-checked={selectMode}
                aria-label="Select mode"
                onClick={() => {
                  if (selectMode) {
                    setSelectMode(false);
                    clearSelection();
                  } else {
                    setSelectMode(true);
                  }
                }}
                className="flex items-center gap-2.5 h-11 px-2 rounded-lg text-sm font-medium text-foreground hover:bg-accent/10 transition-colors"
              >
                <span
                  className={cn(
                    'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors',
                    selectMode ? 'bg-primary border-primary' : 'bg-background border-border'
                  )}
                >
                  {selectMode && <Check className="w-3.5 h-3.5 text-primary-foreground" strokeWidth={3} />}
                </span>
                Select
              </button>
            )}
          </div>
        </div>
          </>
        )}
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-4 max-[767px]:grid-cols-2 max-[419px]:grid-cols-1 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="overflow-hidden animate-pulse">
              <div className="h-36 bg-secondary/50" />
              <CardContent className="p-3 space-y-2">
                <div className="h-4 w-3/4 rounded bg-secondary/70" />
                <div className="h-5 w-1/2 rounded bg-secondary/50" />
                <div className="h-6 w-full rounded bg-secondary/30 mt-3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-destructive font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void menuQuery.refetch()}>Retry</Button>
        </div>
      ) : visibleItems.length === 0 ? (
        <Card className="border-2 border-dashed border-border/60 shadow-none hover:shadow-none hover:translate-y-0">
          <div className="flex flex-col items-center gap-4 py-16 text-center px-6">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center"
            >
              <UtensilsCrossed className="w-8 h-8 text-primary" />
            </motion.div>
            <div>
              <p className="font-semibold text-foreground text-base">
                {items.length === 0 ? 'No menu items yet' : 'No matching items found'}
              </p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                {search
                  ? `Nothing matches "${search}" in this category. Try a different term.`
                  : 'Build your catalog with photos, prices, and categories.'}
              </p>
            </div>
            {canEdit && (
              <Button onClick={openAdd}>
                <Plus className="w-4 h-4" />
                Add Item
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0 } }}
            transition={{ duration: 0 }}
            className={cn(
              view === 'grid'
                ? 'grid grid-cols-4 max-[767px]:grid-cols-2 max-[419px]:grid-cols-1 gap-4'
                : 'flex flex-col gap-2.5'
            )}
          >
            <AnimatePresence initial={false}>
              {visibleItems.map((item) => {
                const selected = selectedIds.has(item.id);
                return (
                  <motion.div
                    key={item.id}
                    exit={{ opacity: 0, scale: 0.96, transition: { duration: 0 } }}
                    className={cn(
                      'relative rounded-2xl',
                      selectMode && 'cursor-pointer',
                      selectMode && selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-2xl'
                    )}
                    onClick={() => selectMode && toggleSelect(item.id)}
                  >
                    {view === 'grid' ? renderGridCard(item, selected) : renderListRow(item, selected)}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>
      )}

      <Sheet
        open={slideOverOpen}
        onClose={() => setSlideOverOpen(false)}
        title={editingItem ? 'Edit Item' : 'Add Menu Item'}
        description={editingItem ? 'Update the details of this catalog item.' : 'Fill in the details to add a new item to your catalog.'}
        footer={
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setSlideOverOpen(false)} className="flex-1">Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving || !isFormValid} className="flex-1">
              {isSaving ? 'Saving...' : editingItem ? 'Save Changes' : 'Add to Menu'}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium text-foreground block mb-2">Photo</label>
            <div
              onClick={() => !imagePreview && fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleImageFile(file);
              }}
              className={cn(
                'relative w-full h-36 rounded-xl overflow-hidden transition-colors',
                imagePreview
                  ? 'cursor-default ring-1 ring-border'
                  : 'border-2 border-dashed border-border cursor-pointer hover:border-primary/50 hover:bg-primary/5'
              )}
            >
              {imagePreview ? (
                <>
                  <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 p-2 flex justify-end gap-2 bg-gradient-to-t from-black/60 to-transparent">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    >
                      <Pencil className="w-3 h-3" />
                      Change
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => { e.stopPropagation(); clearImage(); }}
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove
                    </Button>
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Upload className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">Click, drag & drop, or paste an image</span>
                  <span className="text-[10px] text-muted-foreground/70">PNG, JPG, or paste with Ctrl+V</span>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </div>

          {/* Both names, side by side, both required: the previous form showed
              only the active UI language's name and let the other be blank, so
              an item could be saved without a name in one language. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="form-name" className="text-sm font-medium text-foreground block mb-1.5">
                Name (English) <span className="text-destructive">*</span>
              </label>
              <Input
                id="form-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Wagyu Gourmet Burger"
                leftIcon={<UtensilsCrossed className="w-4 h-4" />}
                invalid={!!formErrors.name}
              />
              {formErrors.name && <p className="text-destructive text-xs mt-1">{formErrors.name}</p>}
            </div>
            <div>
              <label htmlFor="form-name-amharic" className="text-sm font-medium text-foreground block mb-1.5">
                Name (Amharic) <span className="text-destructive">*</span>
              </label>
              <Input
                id="form-name-amharic"
                value={form.nameAmharic}
                onChange={(e) => setForm((f) => ({ ...f, nameAmharic: e.target.value }))}
                placeholder="ለምሳሌ፦ ዋጉዩ በርገር"
                dir="auto"
                leftIcon={<Languages className="w-4 h-4" />}
                invalid={!!formErrors.nameAmharic}
              />
              {formErrors.nameAmharic && <p className="text-destructive text-xs mt-1">{formErrors.nameAmharic}</p>}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">
              Category <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(CATEGORY_META) as MenuCategory[]).map((cat) => {
                const meta = CATEGORY_META[cat];
                const active = form.category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setForm((f) => ({ ...f, category: cat }))}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left',
                      active
                        ? 'border-primary bg-primary/10 text-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]'
                        : 'border-input bg-secondary/40 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    )}
                  >
                    <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', active ? meta.tint : 'bg-background')}>
                      <meta.icon className="w-4 h-4" />
                    </span>
                    {meta.label}
                  </button>
                );
              })}
            </div>
            {formErrors.category && <p className="text-destructive text-xs mt-1">{formErrors.category}</p>}
          </div>

          <div>
            <label htmlFor="form-price" className="text-sm font-medium text-foreground block mb-1.5">
              Price (ETB) <span className="text-destructive">*</span>
            </label>
            <Input
              id="form-price"
              type="number"
              step="1"
              min="0"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value.replace(/[^\d]/g, '') }))}
              placeholder="0"
              leftIcon={<Banknote className="w-4 h-4" />}
              rightAdornment={<span className="text-xs font-semibold text-muted-foreground">ETB</span>}
              invalid={!!formErrors.price}
              className="[&>input]:font-mono"
            />
            {formErrors.price && <p className="text-destructive text-xs mt-1">{formErrors.price}</p>}
          </div>

          {showAvailability && (
            <div className="flex items-center justify-between rounded-xl border border-input bg-secondary/40 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-background flex items-center justify-center">
                  <EyeOff className="w-4 h-4 text-muted-foreground" />
                </span>
                <div>
                  <label htmlFor="form-available" className="text-sm font-medium text-foreground block leading-tight">
                    Available for sale
                  </label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Turn off to hide this item (unavailable)</p>
                </div>
              </div>
              <Switch
                id="form-available"
                checked={form.isAvailable}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, isAvailable: checked }))}
              />
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
};
