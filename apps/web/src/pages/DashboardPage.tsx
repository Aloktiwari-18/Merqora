import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown, ShoppingCart, XCircle, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { api, formatPaise, extractErrorMessage } from "../lib/api";
import { Card, Badge, LoadingState, ErrorState } from "../components/ui/kit";

interface DashboardData {
  revenueInPaise: number;
  ordersCount: number;
  conversionRate: number;
  averageOrderValueInPaise: number;
  abandonedCartValueInPaise: number;
  abandonedCartsCount: number;
  failedPaymentValueInPaise: number;
  failedPaymentsCount: number;
  aiRevenueOpportunityInPaise: number;
  revenueSeries: { date: string; revenueInPaise: number }[];
  recentOrders: { id: string; customerName: string; totalInPaise: number; status: string; createdAt: string }[];
  recentAgentActivity: { id: string; agentType: string; userMessage: string; status: string; startedAt: string }[];
  recentCampaigns: { id: string; title: string; status: string; estimatedRecoverableInPaise: number }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<DashboardData>("/dashboard");
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

  if (loading) return <LoadingState label="Loading dashboard..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const metrics = [
    { label: "Total Revenue (30d)", value: formatPaise(data.revenueInPaise), icon: TrendingUp, tone: "success" as const },
    { label: "Paid Orders", value: data.ordersCount.toLocaleString("en-IN"), icon: ShoppingCart, tone: "info" as const },
    { label: "Conversion Rate", value: `${data.conversionRate}%`, icon: TrendingUp, tone: "info" as const },
    { label: "Avg Order Value", value: formatPaise(data.averageOrderValueInPaise), icon: TrendingUp, tone: "neutral" as const },
    { label: "Abandoned Cart Value", value: formatPaise(data.abandonedCartValueInPaise), icon: TrendingDown, tone: "warning" as const },
    { label: "Failed Payment Value", value: formatPaise(data.failedPaymentValueInPaise), icon: XCircle, tone: "danger" as const },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl">Dashboard</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">Everything below is computed from your seeded store data.</p>
        </div>
        <Link to="/ai-agent" className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl bg-brand-600 text-white hover:bg-brand-700">
          <Sparkles size={16} /> Ask Nova
        </Link>
      </div>

      <Card className="p-5 bg-gradient-to-br from-brand-600 to-brand-800 text-white border-0">
        <p className="text-xs uppercase tracking-wide text-brand-100">AI Revenue Opportunity</p>
        <p className="font-display font-bold text-3xl mt-1">{formatPaise(data.aiRevenueOpportunityInPaise)}</p>
        <p className="text-sm text-brand-100 mt-1">Estimated recoverable from abandoned carts alone — ask Nova how to capture it.</p>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {metrics.map((m) => (
          <Card key={m.label} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-ink-500 dark:text-ink-400">{m.label}</p>
              <m.icon size={16} className="text-ink-300" />
            </div>
            <p className="font-display font-bold text-xl mt-2">{m.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4">Revenue trend (30 days)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.revenueSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-ink-100 dark:text-ink-800" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
              <Tooltip formatter={(v: number) => formatPaise(v)} labelFormatter={(l) => `Date: ${l}`} />
              <Line type="monotone" dataKey="revenueInPaise" stroke="#4256d6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-4">Recent orders</h3>
          <div className="space-y-3">
            {data.recentOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{o.customerName}</p>
                  <p className="text-xs text-ink-400">{new Date(o.createdAt).toLocaleDateString("en-IN")}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatPaise(o.totalInPaise)}</p>
                  <Badge tone={o.status === "PAID" ? "success" : o.status === "FAILED" ? "danger" : "neutral"}>{o.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-display font-semibold mb-4">Recent AI activity</h3>
          <div className="space-y-3">
            {data.recentAgentActivity.length === 0 && <p className="text-sm text-ink-400">No agent activity yet — try asking Nova a question.</p>}
            {data.recentAgentActivity.map((a) => (
              <div key={a.id} className="text-sm">
                <div className="flex items-center justify-between">
                  <Badge tone="info">{a.agentType.replace("_", " ")}</Badge>
                  <Badge tone={a.status === "COMPLETED" ? "success" : a.status === "FAILED" ? "danger" : "warning"}>{a.status}</Badge>
                </div>
                <p className="mt-1 text-ink-600 dark:text-ink-300 truncate">"{a.userMessage}"</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold">Campaign performance</h3>
          <Link to="/campaigns" className="text-sm text-brand-600 font-medium flex items-center gap-1">
            View all <ArrowRight size={14} />
          </Link>
        </div>
        <div className="space-y-3">
          {data.recentCampaigns.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-sm">
              <p className="font-medium">{c.title}</p>
              <div className="flex items-center gap-3">
                <span className="text-ink-500">Est. {formatPaise(c.estimatedRecoverableInPaise)}</span>
                <Badge tone={c.status === "APPROVED" || c.status === "COMPLETED" ? "success" : c.status === "REJECTED" ? "danger" : "warning"}>{c.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
