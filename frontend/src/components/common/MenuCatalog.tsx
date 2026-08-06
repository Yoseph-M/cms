import React, { useState, useCallback, useRef, useEffect } from 'react';
import { z } from 'zod';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useSocketStore } from '../../store/socketStore';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { Sheet } from '../ui/Sheet';
import { AlertDialog } from '../ui/AlertDialog';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, UtensilsCrossed, Search, Upload, ImageIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '../../utils/currency';
import { useMenuQuery } from '../../hooks/useCachedQueries';

interface MenuItem {
  id: string;
  name: string;
  category: 'FOOD' | 'DRINK' | 'DESSERT' | 'OTHER';
  price: number;
  isAvailable: boolean;
  imageUrl?: string;
}

const CATEGORIES = ['All', 'FOOD', 'DRINK', 'DESSERT', 'OTHER'] as const;

const CATEGORY_COLORS: Record<string, 'success' | 'default' | 'warning' | 'neutral'> = {
  FOOD: 'success',
  DRINK: 'default',
  DESSERT: 'warning',
  OTHER: 'neutral',
};

const menuFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  category: z.enum(['FOOD', 'DRINK', 'DESSERT', 'OTHER'], { message: 'Category is required.' }),
  price: z.coerce.number().positive('Price must be a positive number.'),
});

const EMPTY_FORM = {
  name: '',
  category: 'FOOD' as MenuItem['category'],
  price: '',
  imageUrl: '',
  isAvailable: true,
};

interface MenuCatalogProps {
  canEdit?: boolean;
}

export const MenuCatalog: React.FC<MenuCatalogProps> = ({ canEdit = true }) => {
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();

  const menuQuery = useMenuQuery();
  const items: MenuItem[] = menuQuery.data ?? [];
  const isLoading = menuQuery.isLoading;
  const error = menuQuery.error
    ? ((menuQuery.error as { response?: { data?: { error?: string } } }).response?.data?.error ||
        'Failed to load menu.')
    : null;

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const searchDebounce = useRef<ReturnType<typeof setTimeout>>();

  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const invalidateMenu = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['menu'] });
  }, [queryClient]);

  const { socket } = useSocketStore();
  useEffect(() => {
    if (!socket) return;
    const onAvailability = () => invalidateMenu();
    socket.on('menu:availabilityChanged', onAvailability);
    return () => {
      socket.off('menu:availabilityChanged', onAvailability);
    };
  }, [socket, invalidateMenu]);

  const filteredItems = items.filter((item) => {
    const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

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
        name: parsed.name,
        category: parsed.category,
        price: parsed.price,
        imageUrl: form.imageUrl || undefined,
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
      const e = err as { response?: { data?: { error?: string } } };
      addToast({ type: 'error', title: 'Save failed', message: e.response?.data?.error });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvailabilityToggle = async (item: MenuItem) => {
    const prev = item.isAvailable;
    try {
      await axiosClient.patch(`/menu/${item.id}/availability`, { isAvailable: !prev });
      invalidateMenu();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      addToast({ type: 'error', title: 'Availability update failed', message: e.response?.data?.error });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await axiosClient.delete(`/menu/${deleteTarget.id}`);
      invalidateMenu();
      addToast({ type: 'success', title: `${deleteTarget.name} removed` });
      setDeleteTarget(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      addToast({ type: 'error', title: 'Delete failed', message: e.response?.data?.error });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      setForm((f) => ({ ...f, imageUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            id="menu-search"
            type="search"
            placeholder="Search items..."
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>
        {canEdit && (
          <Button id="add-menu-item-btn" onClick={openAdd} className="shrink-0">
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </Button>
        )}
      </div>

      <div className="flex gap-1 p-1 bg-secondary/40 rounded-lg w-fit border border-border/50">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              categoryFilter === cat
                ? 'bg-background text-foreground shadow-sm border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {cat === 'All' ? 'All' : cat.charAt(0) + cat.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-52 rounded-xl bg-secondary/40 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-destructive font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void menuQuery.refetch()}>Retry</Button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-secondary/60 flex items-center justify-center">
            <UtensilsCrossed className="w-7 h-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-foreground">
              {items.length === 0 ? 'No menu items yet — add your first item' : 'No menu items found'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {search ? 'Try a different search term.' : 'Build your catalog with photos, prices, and categories.'}
            </p>
          </div>
          {canEdit && !search && (
            <Button onClick={openAdd}><Plus className="w-4 h-4 mr-2" />Add Item</Button>
          )}
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.04 } } }}
        >
          <AnimatePresence>
            {filteredItems.map((item) => (
              <motion.div
                key={item.id}
                layout
                variants={{
                  hidden: { opacity: 0, y: 12, scale: 0.97 },
                  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 28 } },
                }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
              >
                <Card className="overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                  <div className="w-full h-28 bg-secondary/40 flex items-center justify-center overflow-hidden">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                    )}
                  </div>
                  <CardContent className="p-3 flex flex-col gap-2 flex-1">
                    <div>
                      <p className="font-semibold text-sm text-foreground truncate">{item.name}</p>
                      <p className="text-base font-mono font-bold text-primary mt-0.5">
                        {formatCurrency(item.price)}
                      </p>
                    </div>
                    <Badge variant={CATEGORY_COLORS[item.category]} className="w-fit text-[10px]">
                      {item.category}
                    </Badge>
                    <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/40">
                      <div className="flex items-center gap-1.5">
                        <Switch
                          id={`avail-${item.id}`}
                          checked={item.isAvailable}
                          onCheckedChange={() => handleAvailabilityToggle(item)}
                          disabled={!canEdit}
                        />
                        <span className="text-[11px] text-muted-foreground">
                          {item.isAvailable ? 'Available' : 'Hidden'}
                        </span>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(item)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            aria-label={`Edit ${item.name}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(item)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            aria-label={`Delete ${item.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <Sheet
        open={slideOverOpen}
        onClose={() => setSlideOverOpen(false)}
        title={editingItem ? 'Edit Item' : 'Add Menu Item'}
        footer={
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setSlideOverOpen(false)} className="flex-1">Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving || !isFormValid} className="flex-1">
              {isSaving ? 'Saving...' : (editingItem ? 'Save Changes' : 'Add to Menu')}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium text-foreground block mb-2">Photo</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const dataUrl = reader.result as string;
                    setImagePreview(dataUrl);
                    setForm((f) => ({ ...f, imageUrl: dataUrl }));
                  };
                  reader.readAsDataURL(file);
                }
              }}
              className="w-full h-32 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors overflow-hidden"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
              ) : (
                <>
                  <Upload className="w-6 h-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Drag & drop or click to upload</span>
                </>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </div>

          <div>
            <label htmlFor="form-name" className="text-sm font-medium text-foreground block mb-1.5">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="form-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Wagyu Gourmet Burger"
              className={formErrors.name ? 'border-destructive' : ''}
            />
            {formErrors.name && <p className="text-destructive text-xs mt-1">{formErrors.name}</p>}
          </div>

          <div>
            <label htmlFor="form-category" className="text-sm font-medium text-foreground block mb-1.5">
              Category <span className="text-destructive">*</span>
            </label>
            <Select
              id="form-category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as MenuItem['category'] }))}
              className={formErrors.category ? 'border-destructive' : ''}
            >
              <option value="FOOD">Food</option>
              <option value="DRINK">Drink</option>
              <option value="DESSERT">Dessert</option>
              <option value="OTHER">Other</option>
            </Select>
            {formErrors.category && <p className="text-destructive text-xs mt-1">{formErrors.category}</p>}
          </div>

          <div>
            <label htmlFor="form-price" className="text-sm font-medium text-foreground block mb-1.5">
              Price (ETB) <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Input
                id="form-price"
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="0.00"
                className={`font-mono ${formErrors.price ? 'border-destructive' : ''}`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">ETB</span>
            </div>
            {formErrors.price && <p className="text-destructive text-xs mt-1">{formErrors.price}</p>}
          </div>

          <div className="flex items-center justify-between py-2">
            <label htmlFor="form-available" className="text-sm font-medium text-foreground">Available</label>
            <Switch
              id="form-available"
              checked={form.isAvailable}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, isAvailable: checked }))}
            />
          </div>
        </div>
      </Sheet>

      <AlertDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={deleteTarget ? `Remove ${deleteTarget.name} from the menu?` : ''}
        description="This can't be undone."
        confirmText="Remove Item"
        tone="destructive"
        loading={isDeleting}
      />
    </div>
  );
};
