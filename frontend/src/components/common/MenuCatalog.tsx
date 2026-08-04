import React, { useState, useEffect, useCallback, useRef } from 'react';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, UtensilsCrossed, Search, X, Upload, ImageIcon } from 'lucide-react';

interface MenuItem {
  id: string;
  name: string;
  category: 'FOOD' | 'DRINK' | 'DESSERT' | 'OTHER';
  price: number;
  isAvailable: boolean;
  imageUrl?: string;
}

const CATEGORIES = ['All', 'FOOD', 'DRINK', 'DESSERT', 'OTHER'] as const;

const CATEGORY_COLORS: Record<string, any> = {
  FOOD: 'success',
  DRINK: 'default',
  DESSERT: 'warning',
  OTHER: 'neutral',
};

const EMPTY_FORM = { name: '', category: 'FOOD' as const, price: '', imageUrl: '' };

interface MenuCatalogProps {
  canEdit?: boolean; // false for read-only manager view override (currently all can edit)
}

export const MenuCatalog: React.FC<MenuCatalogProps> = ({ canEdit = true }) => {
  const { addToast } = useToastStore();

  const [items, setItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const searchDebounce = useRef<NodeJS.Timeout>();

  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await axiosClient.get('/menu');
      setItems(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load menu items.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const filteredItems = items.filter(item => {
    const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => setSearch(e.target.value), 300);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Name is required.';
    if (!form.category) errors.category = 'Category is required.';
    const price = parseFloat(form.price as string);
    if (isNaN(price) || price <= 0) errors.price = 'Price must be a positive number.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openAdd = () => {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setImagePreview(null);
    setSlideOverOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditingItem(item);
    setForm({ name: item.name, category: item.category, price: String(item.price), imageUrl: item.imageUrl || '' });
    setFormErrors({});
    setImagePreview(item.imageUrl || null);
    setSlideOverOpen(true);
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        price: parseFloat(form.price as string),
        imageUrl: form.imageUrl || undefined,
        isAvailable: true,
      };
      if (editingItem) {
        const res = await axiosClient.patch(`/menu/${editingItem.id}`, payload);
        setItems(prev => prev.map(i => i.id === editingItem.id ? res.data : i));
        addToast({ type: 'success', title: 'Item updated' });
      } else {
        const res = await axiosClient.post('/menu', payload);
        setItems(prev => [res.data, ...prev]);
        addToast({ type: 'success', title: 'Item added to menu' });
      }
      setSlideOverOpen(false);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Save failed', message: err.response?.data?.error });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvailabilityToggle = async (item: MenuItem) => {
    const prev = item.isAvailable;
    // Optimistic update
    setItems(all => all.map(i => i.id === item.id ? { ...i, isAvailable: !prev } : i));
    try {
      await axiosClient.patch(`/menu/${item.id}/availability`, { isAvailable: !prev });
    } catch (err: any) {
      // Rollback
      setItems(all => all.map(i => i.id === item.id ? { ...i, isAvailable: prev } : i));
      addToast({ type: 'error', title: 'Availability update failed', message: err.response?.data?.error });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await axiosClient.delete(`/menu/${deleteTarget.id}`);
      setItems(prev => prev.filter(i => i.id !== deleteTarget.id));
      addToast({ type: 'success', title: `${deleteTarget.name} removed` });
      setDeleteTarget(null);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Delete failed', message: err.response?.data?.error });
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
      setForm(f => ({ ...f, imageUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      {/* Header row */}
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

      {/* Category tabs */}
      <div className="flex gap-1 p-1 bg-secondary/40 rounded-lg w-fit border border-border/50">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              categoryFilter === cat
                ? 'bg-background text-foreground shadow-sm border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-52 rounded-xl bg-secondary/40 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-destructive font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchItems}>Retry</Button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-secondary/60 flex items-center justify-center">
            <UtensilsCrossed className="w-7 h-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-foreground">No menu items found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search ? 'Try a different search term.' : 'Add your first item to get started.'}
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
            {filteredItems.map(item => (
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
                  {/* Image or placeholder */}
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
                        ${item.price.toFixed(2)}
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
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(item)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
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

      {/* Slide-over for Add/Edit */}
      <AnimatePresence>
        {slideOverOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
              onClick={() => setSlideOverOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between p-6 border-b border-border">
                <h2 className="text-lg font-bold">{editingItem ? 'Edit Item' : 'Add Menu Item'}</h2>
                <button onClick={() => setSlideOverOpen(false)} className="p-2 rounded-lg hover:bg-secondary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Image upload */}
                <div>
                  <label className="text-sm font-medium text-foreground block mb-2">Photo</label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-32 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors overflow-hidden"
                  >
                    {imagePreview ? (
                      <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <Upload className="w-6 h-6 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Click to upload image</span>
                      </>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </div>

                {/* Name */}
                <div>
                  <label htmlFor="form-name" className="text-sm font-medium text-foreground block mb-1.5">
                    Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="form-name"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Wagyu Gourmet Burger"
                    className={formErrors.name ? 'border-destructive' : ''}
                  />
                  {formErrors.name && <p className="text-destructive text-xs mt-1">{formErrors.name}</p>}
                </div>

                {/* Category */}
                <div>
                  <label htmlFor="form-category" className="text-sm font-medium text-foreground block mb-1.5">
                    Category <span className="text-destructive">*</span>
                  </label>
                  <Select
                    id="form-category"
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value as any }))}
                    className={formErrors.category ? 'border-destructive' : ''}
                  >
                    <option value="FOOD">Food</option>
                    <option value="DRINK">Drink</option>
                    <option value="DESSERT">Dessert</option>
                    <option value="OTHER">Other</option>
                  </Select>
                  {formErrors.category && <p className="text-destructive text-xs mt-1">{formErrors.category}</p>}
                </div>

                {/* Price */}
                <div>
                  <label htmlFor="form-price" className="text-sm font-medium text-foreground block mb-1.5">
                    Price (USD) <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</span>
                    <Input
                      id="form-price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.price}
                      onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                      placeholder="0.00"
                      className={`pl-7 font-mono ${formErrors.price ? 'border-destructive' : ''}`}
                    />
                  </div>
                  {formErrors.price && <p className="text-destructive text-xs mt-1">{formErrors.price}</p>}
                </div>
              </div>
              <div className="p-6 border-t border-border flex gap-3">
                <Button variant="outline" onClick={() => setSlideOverOpen(false)} className="flex-1">Cancel</Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving || !form.name || !form.price}
                  className="flex-1"
                >
                  {isSaving ? 'Saving...' : (editingItem ? 'Save Changes' : 'Add to Menu')}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete confirm dialog */}
      <AnimatePresence>
        {deleteTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setDeleteTarget(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full pointer-events-auto">
                <h3 className="text-base font-bold mb-2">Remove "{deleteTarget.name}"?</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  This will remove the item from the menu catalog. This action can't be undone.
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setDeleteTarget(null)} className="flex-1">Cancel</Button>
                  <Button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? 'Removing...' : 'Remove Item'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
