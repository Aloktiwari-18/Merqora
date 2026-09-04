import { useEffect, useState } from "react";
import { api, formatPaise, extractErrorMessage } from "../lib/api";
import { Card, Badge, Button, LoadingState, ErrorState, Input, Textarea } from "../components/ui/kit";
import { Plus } from "lucide-react";

interface Campaign {
  id: string;
  title: string;
  goal: string;
  offerDescription: string;
  discountInPaise: number;
  estimatedRecoverableInPaise: number;
  riskLevel: string;
  status: string;
}

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info"> = {
  PROPOSED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  EXECUTING: "info",
  COMPLETED: "success",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", goal: "", offerDescription: "", discountInPaise: 20000 });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/campaigns");
      setCampaigns(data.campaigns);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function propose(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await api.post("/campaigns/propose", form);
      setShowForm(false);
      setForm({ title: "", goal: "", offerDescription: "", discountInPaise: 20000 });
      load();
    } catch (err) {
      setFormError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function decide(id: string, action: "approve" | "reject") {
    try {
      await api.post(`/campaigns/${id}/${action}`);
      load();
    } catch (err) {
      alert(extractErrorMessage(err));
    }
  }

  if (loading) return <LoadingState label="Loading campaigns..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl">Campaigns</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">AI proposes. Policy checks the limits. You approve before anything runs.</p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus size={16} /> Propose Campaign
        </Button>
      </div>

      {showForm && (
        <Card className="p-5">
          <form onSubmit={propose} className="space-y-3">
            <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <Input placeholder="Goal (e.g. Increase weekend revenue)" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} required />
            <Textarea placeholder="Offer description" value={form.offerDescription} onChange={(e) => setForm({ ...form, offerDescription: e.target.value })} required />
            <div>
              <label className="text-xs text-ink-500">Discount amount (₹)</label>
              <Input
                type="number"
                value={form.discountInPaise / 100}
                onChange={(e) => setForm({ ...form, discountInPaise: Number(e.target.value) * 100 })}
                min={1}
              />
            </div>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit for policy check"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {campaigns.map((c) => (
          <Card key={c.id} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display font-semibold">{c.title}</p>
                <p className="text-xs text-ink-400 mt-0.5">{c.goal}</p>
              </div>
              <Badge tone={STATUS_TONE[c.status] || "neutral"}>{c.status}</Badge>
            </div>
            <p className="text-sm text-ink-600 dark:text-ink-300 mt-3">{c.offerDescription}</p>
            <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
              <div>
                <p className="text-ink-400">Discount</p>
                <p className="font-medium">{formatPaise(c.discountInPaise)}</p>
              </div>
              <div>
                <p className="text-ink-400">Est. Recoverable</p>
                <p className="font-medium">{formatPaise(c.estimatedRecoverableInPaise)}</p>
              </div>
              <div>
                <p className="text-ink-400">Risk</p>
                <Badge tone={c.riskLevel === "HIGH" ? "danger" : c.riskLevel === "MEDIUM" ? "warning" : "success"}>{c.riskLevel}</Badge>
              </div>
            </div>
            {c.status === "PROPOSED" && (
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="success" onClick={() => decide(c.id, "approve")}>
                  Approve
                </Button>
                <Button size="sm" variant="secondary" onClick={() => decide(c.id, "reject")}>
                  Reject
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
