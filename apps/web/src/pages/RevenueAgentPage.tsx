import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, User } from "lucide-react";
import { api, extractErrorMessage } from "../lib/api";
import { Card, Button, Textarea, Badge } from "../components/ui/kit";

interface ChatMessage {
  role: "user" | "agent";
  text: string;
  actions?: { toolName: string; input: unknown; output: unknown }[];
  modelUsed?: string;
}

const SUGGESTIONS = [
  "Why did revenue decrease this week?",
  "Find abandoned carts worth more than ₹3000",
  "Which products should I promote?",
  "Suggest ways to increase weekend revenue",
];

export default function RevenueAgentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "agent", text: "Hi, I'm Nova — your Revenue Agent. Ask me about revenue trends, abandoned carts, top products, or campaign ideas. Every answer is grounded in your actual store data." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(message: string) {
    if (!message.trim() || loading) return;
    setMessages((m) => [...m, { role: "user", text: message }]);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post("/agent/chat", { message });
      setMessages((m) => [...m, { role: "agent", text: data.response, actions: data.actions, modelUsed: data.modelUsed }]);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white">
          <Sparkles size={20} />
        </div>
        <div>
          <h1 className="font-display font-bold text-xl">Nova</h1>
          <p className="text-xs text-ink-500 dark:text-ink-400">Revenue Agent — reads real data, never invents numbers, never moves money directly.</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "agent" && (
              <div className="h-8 w-8 rounded-lg bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center shrink-0">
                <Sparkles size={14} className="text-brand-600" />
              </div>
            )}
            <div className={`max-w-[85%] ${m.role === "user" ? "order-1" : ""}`}>
              <Card className={`p-4 ${m.role === "user" ? "bg-brand-600 text-white border-0" : ""}`}>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.text}</p>
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-ink-100 dark:border-ink-800 flex flex-wrap gap-1.5">
                    {m.actions.map((a, j) => (
                      <Badge key={j} tone="info">
                        🔧 {a.toolName}
                      </Badge>
                    ))}
                  </div>
                )}
                {m.modelUsed && <p className="text-[10px] text-ink-400 mt-2">via {m.modelUsed}</p>}
              </Card>
            </div>
            {m.role === "user" && (
              <div className="h-8 w-8 rounded-lg bg-ink-100 dark:bg-ink-800 flex items-center justify-center shrink-0 order-2">
                <User size={14} />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-lg bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center shrink-0">
              <Sparkles size={14} className="text-brand-600 animate-pulse" />
            </div>
            <Card className="p-4">
              <p className="text-sm text-ink-400">Analyzing store data...</p>
            </Card>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => send(s)} className="text-xs px-3 py-1.5 rounded-full bg-ink-100 dark:bg-ink-800 hover:bg-ink-200 dark:hover:bg-ink-700">
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask Nova about your store's performance..."
            rows={1}
            className="resize-none"
          />
          <Button type="submit" disabled={loading || !input.trim()}>
            <Send size={16} />
          </Button>
        </form>
      </div>
    </div>
  );
}
