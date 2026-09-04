import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../lib/api";
import { Card, Badge, LoadingState, ErrorState, EmptyState } from "../components/ui/kit";

interface AuditLogEntry {
  id: string;
  category: string;
  actor: string;
  action: string;
  summary: string;
  status: string;
  createdAt: string;
}

const CATEGORIES = ["", "AGENT", "PAYMENT", "CAMPAIGN", "POLICY", "APPROVAL", "FAILURE", "AUTH"];
const STATUS_TONE: Record<string, "success" | "danger" | "warning"> = { SUCCESS: "success", FAILED: "danger", BLOCKED: "warning" };

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/audit", { params: category ? { category } : {} });
      setLogs(data.logs);
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
  }, [category]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display font-bold text-2xl">Audit Log</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">{total} recorded events. Every agent action, policy decision, and payment event lives here.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((c) => (
          <button
            key={c || "all"}
            onClick={() => setCategory(c)}
            className={`text-xs px-3 py-1.5 rounded-full ${category === c ? "bg-brand-600 text-white" : "bg-ink-100 dark:bg-ink-800"}`}
          >
            {c || "All"}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState label="Loading audit log..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : logs.length === 0 ? (
        <EmptyState title="No audit events yet" description="Interact with Nova, Sable, or Failure Lab to generate audit trail entries." />
      ) : (
        <div className="space-y-2">
          {logs.map((l) => (
            <Card key={l.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone="info">{l.category}</Badge>
                  <Badge tone={STATUS_TONE[l.status] || "neutral"}>{l.status}</Badge>
                  <span className="text-xs text-ink-400">{l.actor}</span>
                </div>
                <span className="text-xs text-ink-400">{new Date(l.createdAt).toLocaleString("en-IN")}</span>
              </div>
              <p className="text-sm mt-2">{l.summary}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
