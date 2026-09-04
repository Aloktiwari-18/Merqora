import { useEffect, useState } from "react";
import { api, formatPaise, extractErrorMessage } from "../lib/api";
import { Card, Badge, Button, LoadingState, ErrorState, EmptyState, Input, Textarea } from "../components/ui/kit";
import { Package, Plus, X } from "lucide-react";

interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  priceInPaise: number;
  inventory: number;
  isActive: boolean;
}

const CATEGORIES = ["Electronics", "Fashion", "Fitness", "Home", "Accessories"];

const emptyForm = {
  name: "",
  description: "",
  category: "Electronics",
  price: "", // ₹, converted to paise on submit
  inventory: "0",
  useCases: "", // comma-separated
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/products");
      setProducts(data.products);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) || p.category.toLowerCase().includes(query.toLowerCase()));

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const priceInPaise = Math.round(Number(form.price) * 100);
    if (!form.name.trim() || !form.description.trim()) {
      setFormError("Name and description are required.");
      return;
    }
    if (!priceInPaise || priceInPaise <= 0) {
      setFormError("Enter a valid price greater than ₹0.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/products", {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category,
        priceInPaise,
        inventory: Math.max(0, Number(form.inventory) || 0),
        useCases: form.useCases
          .split(",")
          .map((u) => u.trim())
          .filter(Boolean),
      });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState label="Loading products..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl">Products</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">{products.length} products in your catalog.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Search products..." value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-xs" />
          <Button onClick={() => setShowForm((s) => !s)}>
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? "Cancel" : "Add Product"}
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-4">New product</h3>
          <form onSubmit={handleAddProduct} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Input
                placeholder="Product name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
             <Input
  list="category-options"
  placeholder="Category (pick or type your own)"
  value={form.category}
  onChange={(e) => setForm({ ...form, category: e.target.value })}
/>
<datalist id="category-options">
  {CATEGORIES.map((c) => (
    <option key={c} value={c} />
  ))}
</datalist>
            </div>

            <Textarea
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
              rows={2}
            />

            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-ink-500">Price (₹)</label>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="1999"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-ink-500">Inventory (units)</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="50"
                  value={form.inventory}
                  onChange={(e) => setForm({ ...form, inventory: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-ink-500">Use cases (comma-separated)</label>
                <Input
                  placeholder="running, gym"
                  value={form.useCases}
                  onChange={(e) => setForm({ ...form, useCases: e.target.value })}
                />
              </div>
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Adding..." : "Add product"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {filtered.length === 0 ? (
        <EmptyState title="No products found" description="Try a different search term, or add your first product." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="h-9 w-9 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
                  <Package size={16} className="text-brand-600" />
                </div>
                <Badge tone={p.inventory === 0 ? "danger" : p.inventory < 10 ? "warning" : "success"}>
                  {p.inventory === 0 ? "Out of stock" : `${p.inventory} in stock`}
                </Badge>
              </div>
              <p className="font-medium text-sm mt-3">{p.name}</p>
              <p className="text-xs text-ink-400">{p.category}</p>
              <p className="text-xs text-ink-500 dark:text-ink-400 mt-2 line-clamp-2">{p.description}</p>
              <p className="font-display font-semibold mt-3">{formatPaise(p.priceInPaise)}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}