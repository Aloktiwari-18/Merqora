import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api, formatPaise, extractErrorMessage } from "../lib/api";
import { Card, LoadingState, ErrorState } from "../components/ui/kit";

interface DashboardData {
  revenueSeries: { date: string; revenueInPaise: number }[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/dashboard");
      setData(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <LoadingState label="Loading analytics..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl">Analytics</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">Daily revenue, computed from paid orders in the last 30 days.</p>
      </div>
      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4">Daily revenue</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.revenueSeries}>
              <CartesianGrid strokeDasharray="3 3" className="text-ink-100 dark:text-ink-800" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
              <Tooltip formatter={(v: number) => formatPaise(v)} />
              <Bar dataKey="revenueInPaise" fill="#5b74f0" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
