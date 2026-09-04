import { useState } from "react";
import { api, extractErrorMessage } from "../lib/api";
import { Card, Button, Badge } from "../components/ui/kit";
import { FlaskConical, ArrowRight } from "lucide-react";

const SCENARIOS = [
  { key: "payment-failure", label: "Payment failure", description: "Card declined by issuing bank. Order must NOT be marked paid." },
  { key: "inventory-changed", label: "Inventory changed during checkout", description: "Stock hits zero between add-to-cart and checkout." },
  { key: "duplicate-request", label: "Duplicate payment request", description: "The same request is retried — idempotency must prevent a double charge." },
  { key: "api-timeout", label: "API timeout", description: "A downstream call exceeds its timeout budget." },
  { key: "webhook-delay", label: "Webhook delay", description: "Razorpay's webhook arrives after checkout, not during it." },
  { key: "invalid-discount", label: "Invalid discount", description: "Agent proposes a discount above the policy limit." },
  { key: "product-unavailable", label: "Product unavailable", description: "Customer tries to add an out-of-stock item to cart." },
  { key: "llm-timeout", label: "LLM timeout", description: "The AI provider is unreachable — no fabricated answer is returned." },
];

interface Step {
  label: string;
  detail: string;
}

export default function FailureLabPage() {
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { steps: Step[]; finalState: unknown } | { error: string }>>({});

  async function run(key: string) {
    setRunning(key);
    try {
      const { data } = await api.post(`/failure-lab/simulate/${key}`);
      setResults((r) => ({ ...r, [key]: { steps: data.steps, finalState: data.finalState } }));
    } catch (err) {
      setResults((r) => ({ ...r, [key]: { error: extractErrorMessage(err) } }));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <FlaskConical className="text-brand-600" />
        <div>
          <h1 className="font-display font-bold text-2xl">Failure Lab</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">Real simulations against the live database — not scripted animations.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {SCENARIOS.map((s) => {
          const result = results[s.key];
          return (
            <Card key={s.key} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display font-semibold">{s.label}</p>
                  <p className="text-xs text-ink-400 mt-0.5">{s.description}</p>
                </div>
                <Button size="sm" onClick={() => run(s.key)} disabled={running === s.key}>
                  {running === s.key ? "Running..." : "Simulate"}
                </Button>
              </div>

              {result && "error" in result && <p className="text-sm text-red-600 mt-3">{result.error}</p>}

              {result && "steps" in result && (
                <div className="mt-4 space-y-2">
                  {result.steps.map((step, i) => (
                    <div key={i} className="flex gap-2 text-sm">
                      <ArrowRight size={14} className="text-brand-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">{step.label}</p>
                        <p className="text-xs text-ink-500 dark:text-ink-400">{step.detail}</p>
                      </div>
                    </div>
                  ))}
                  <Badge tone="success" className="mt-2">
                    Simulation complete — see Audit Log for the recorded event
                  </Badge>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
