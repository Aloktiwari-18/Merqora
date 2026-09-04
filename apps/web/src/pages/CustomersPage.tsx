import { useEffect, useState } from "react";
import { api, formatPaise, extractErrorMessage } from "../lib/api";
import { LoadingState, ErrorState, Badge, Card } from "../components/ui/kit";

interface Customer {
  id: string;
  name: string;
  email: string;
  segment: string;
  totalSpentInPaise: number;
  ordersCount: number;
}

const SEGMENT_TONE: Record<string, "success" | "warning" | "info" | "neutral"> = {
  high_value: "success",
  at_risk: "warning",
  running_enthusiast: "info",
  new: "info",
  general: "neutral",
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/customers");
      setCustomers(data.customers);
      setTotal(data.total);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <LoadingState label="Loading customers..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display font-bold text-2xl">Customers</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">{total} customers total, showing top spenders first.</p>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 dark:bg-ink-800/50 text-ink-500 dark:text-ink-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Segment</th>
              <th className="text-right px-4 py-3">Orders</th>
              <th className="text-right px-4 py-3">Total Spent</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-ink-100 dark:border-ink-800">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-ink-500 dark:text-ink-400">{c.email}</td>
                <td className="px-4 py-3">
                  <Badge tone={SEGMENT_TONE[c.segment] || "neutral"}>{c.segment.replace("_", " ")}</Badge>
                </td>
                <td className="px-4 py-3 text-right">{c.ordersCount}</td>
                <td className="px-4 py-3 text-right font-medium">{formatPaise(c.totalSpentInPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
