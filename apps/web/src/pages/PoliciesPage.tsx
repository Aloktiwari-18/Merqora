import { useEffect, useState } from "react";
import { api, formatPaise, extractErrorMessage } from "../lib/api";
import { Card, Button, Input, LoadingState, ErrorState } from "../components/ui/kit";
import { ShieldCheck } from "lucide-react";

interface Policy {
  maximumDiscountInPaise: number;
  maximumTransactionInPaise: number;
  automaticPayment: boolean;
  automaticRefund: boolean;
  campaignRequiresApproval: boolean;
  upsellAllowed: boolean;
  agentCanCreateOrder: boolean;
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-ink-100 dark:border-ink-800 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-ink-400">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${checked ? "bg-brand-600" : "bg-ink-200 dark:bg-ink-700"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

export default function PoliciesPage() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/policies");
      setPolicy(data.policy);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!policy) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.put("/policies", policy);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading policies..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!policy) return null;

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-brand-600" />
        <div>
          <h1 className="font-display font-bold text-2xl">Policy Engine</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">Deterministic limits the AI can never override.</p>
        </div>
      </div>

      <Card className="p-5 space-y-4">
        <div>
          <label className="text-sm font-medium">Maximum discount per order</label>
          <p className="text-xs text-ink-400 mb-2">Currently {formatPaise(policy.maximumDiscountInPaise)}</p>
          <Input
            type="number"
            value={policy.maximumDiscountInPaise / 100}
            onChange={(e) => setPolicy({ ...policy, maximumDiscountInPaise: Number(e.target.value) * 100 })}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Maximum transaction amount</label>
          <p className="text-xs text-ink-400 mb-2">Currently {formatPaise(policy.maximumTransactionInPaise)}</p>
          <Input
            type="number"
            value={policy.maximumTransactionInPaise / 100}
            onChange={(e) => setPolicy({ ...policy, maximumTransactionInPaise: Number(e.target.value) * 100 })}
          />
        </div>
      </Card>

      <Card className="p-5">
        <Toggle
          label="Automatic payment"
          description="Allow payments to proceed without merchant approval, within transaction limits."
          checked={policy.automaticPayment}
          onChange={(v) => setPolicy({ ...policy, automaticPayment: v })}
        />
        <Toggle
          label="Automatic refund"
          description="Allow refunds to process without manual approval."
          checked={policy.automaticRefund}
          onChange={(v) => setPolicy({ ...policy, automaticRefund: v })}
        />
        <Toggle
          label="Campaigns require approval"
          description="Every AI-proposed campaign must be approved by a human before it can be redeemed."
          checked={policy.campaignRequiresApproval}
          onChange={(v) => setPolicy({ ...policy, campaignRequiresApproval: v })}
        />
        <Toggle
          label="Upsell recommendations allowed"
          description="Let Sable suggest complementary products at checkout."
          checked={policy.upsellAllowed}
          onChange={(v) => setPolicy({ ...policy, upsellAllowed: v })}
        />
        <Toggle
          label="Agent can create orders"
          description="Allow the AI Buyer flow to create orders on a customer's behalf after they confirm payment."
          checked={policy.agentCanCreateOrder}
          onChange={(v) => setPolicy({ ...policy, agentCanCreateOrder: v })}
        />
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving..." : saved ? "Saved ✓" : "Save policy"}
      </Button>
    </div>
  );
}
