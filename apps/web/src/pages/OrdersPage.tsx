import { useEffect, useState } from "react";
import { api, formatPaise, extractErrorMessage } from "../lib/api";
import { LoadingState, ErrorState, Badge, Card } from "../components/ui/kit";

interface Order {
  id: string;
  status: string;
  totalInPaise: number;
  createdAt: string;
  customer: { name: string } | null;
  items: { quantity: number; product: { name: string } }[];
}

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  PAID: "success",
  PENDING: "warning",
  FAILED: "danger",
  CANCELLED: "neutral",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/orders", { params: statusFilter ? { status: statusFilter } : {} });
      setOrders(data.orders);
      setTotal(data.total);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl">Orders</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">{total} orders total.</p>
        </div>
        <div className="flex gap-2">
          {["", "PAID", "PENDING", "FAILED"].map((s) => (
            <button
              key={s || "all"}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-full ${statusFilter === s ? "bg-brand-600 text-white" : "bg-ink-100 dark:bg-ink-800"}`}
            >
              {s || "All"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading orders..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 dark:bg-ink-800/50 text-ink-500 dark:text-ink-400 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Items</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-ink-100 dark:border-ink-800">
                  <td className="px-4 py-3 font-medium">{o.customer?.name || "Guest"}</td>
                  <td className="px-4 py-3 text-ink-500 dark:text-ink-400">{o.items.map((i) => `${i.product.name} ×${i.quantity}`).join(", ")}</td>
                  <td className="px-4 py-3 text-ink-500 dark:text-ink-400">{new Date(o.createdAt).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[o.status] || "neutral"}>{o.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{formatPaise(o.totalInPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
