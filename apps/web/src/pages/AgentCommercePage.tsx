import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ShoppingBag, Send, Sparkles, Sun, Moon, ArrowLeft, Plus, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { api, formatPaise, generateIdempotencyKey, extractErrorMessage } from "../lib/api";
import { Button, Card, Badge, Spinner } from "../components/ui/kit";
import { useTheme } from "../context/ThemeContext";

interface Product {
  id: string;
  name: string;
  description: string;
  priceInPaise: number;
  category: string;
  inventory: number;
  availability: string;
}

interface ChatEntry {
  role: "user" | "sable";
  text?: string;
  products?: Product[];
}

interface CartState {
  id: string;
  items: { id: string; productId: string; name: string; quantity: number; unitPriceInPaise: number; lineTotalInPaise: number }[];
  subtotalInPaise: number;
}

type Stage = "shopping" | "checkout" | "paying" | "confirmed" | "failed";

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function AgentCommercePage() {
  const { theme, toggleTheme } = useTheme();
  const [messages, setMessages] = useState<ChatEntry[]>([
    { role: "sable", text: "Hi! I'm Sable, your shopping assistant. Tell me what you're looking for — e.g. \"I need running shoes under ₹5000.\"" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [cart, setCart] = useState<CartState | null>(null);
  const [upsell, setUpsell] = useState<{ productId: string; name: string; priceInPaise: number; reason: string }[]>([]);
  const [stage, setStage] = useState<Stage>("shopping");
  const [orderTotal, setOrderTotal] = useState<number | null>(null);
  const [paymentMode, setPaymentMode] = useState<"production" | "mock" | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const orderIdRef = useRef<string | null>(null);
  const razorpayOrderIdRef = useRef<string | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function ensureCart(): Promise<CartState> {
    if (cart) return cart;
    const { data } = await api.post("/cart", {});
    setCart(data.cart);
    return data.cart;
  }

  async function send(message: string) {
    if (!message.trim() || loading) return;
    setMessages((m) => [...m, { role: "user", text: message }]);
    setInput("");
    setLoading(true);
    try {
      const { data } = await api.post("/buyer/chat", { message });
      setMessages((m) => [...m, { role: "sable", text: data.reasoning, products: data.products }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "sable", text: extractErrorMessage(err) }]);
    } finally {
      setLoading(false);
    }
  }

  async function addToCart(product: Product) {
    try {
      const c = await ensureCart();
      const { data } = await api.post(`/cart/${c.id}/items`, { productId: product.id, quantity: 1 });
      setCart(data.cart);
      const { data: upsellData } = await api.post("/buyer/upsell", { productId: product.id });
      if (upsellData.allowed) setUpsell(upsellData.recommendations);
    } catch (err) {
      alert(extractErrorMessage(err));
    }
  }

  async function startCheckout() {
    if (!cart || cart.items.length === 0) return;
    setStage("checkout");
    setPaymentError(null);
    try {
      const { data: checkoutData } = await api.post(
        "/checkout/create",
        { cartId: cart.id },
        { headers: { "Idempotency-Key": generateIdempotencyKey() } }
      );
      const order = checkoutData.order;
      orderIdRef.current = order.id;
      setOrderTotal(order.totalInPaise);

      const { data: paymentData } = await api.post(
        "/payment/create",
        { orderId: order.id },
        { headers: { "Idempotency-Key": generateIdempotencyKey() } }
      );
      razorpayOrderIdRef.current = paymentData.razorpayOrderId;
      setPaymentMode(paymentData.mode);
      setStage("paying");

      if (paymentData.mode === "production") {
        const loaded = await loadRazorpayScript();
        if (!loaded) {
          setPaymentError("Could not load Razorpay checkout script.");
          return;
        }
        const rzp = new (window as any).Razorpay({
          key: paymentData.keyId,
          amount: paymentData.amountInPaise,
          currency: paymentData.currency,
          name: "Urban Stride Co. (via Merqora)",
          description: "Test-mode order",
          order_id: paymentData.razorpayOrderId,
          handler: async (response: any) => {
            await verifyPayment(response.razorpay_order_id, response.razorpay_payment_id, response.razorpay_signature);
          },
          modal: { ondismiss: () => setStage("checkout") },
          theme: { color: "#4256d6" },
        });
        rzp.open();
      }
    } catch (err) {
      setPaymentError(extractErrorMessage(err));
      setStage("checkout");
    }
  }

  async function verifyPayment(razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string) {
    try {
      await api.post("/payment/verify", { razorpayOrderId, razorpayPaymentId, razorpaySignature });
      setStage("confirmed");
    } catch (err) {
      setPaymentError(extractErrorMessage(err));
      setStage("failed");
    }
  }

  async function simulateMockPayment(success: boolean) {
    if (!razorpayOrderIdRef.current) return;
    try {
      const { data } = await api.post("/payment/mock-complete", {
        razorpayOrderId: razorpayOrderIdRef.current,
        simulateFailure: !success,
      });
      if (data.failed) {
        setStage("failed");
        setPaymentError("Simulated payment failure — your card was declined. Order was not charged.");
        return;
      }
      await verifyPayment(data.razorpayOrderId, data.razorpayPaymentId, data.razorpaySignature);
    } catch (err) {
      setPaymentError(extractErrorMessage(err));
      setStage("failed");
    }
  }

  return (
    <div className="min-h-screen bg-ink-50 dark:bg-ink-950">
      <header className="h-16 border-b border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 flex items-center px-5 gap-3">
        <Link to="/" className="flex items-center gap-2 text-ink-500 hover:text-ink-800 dark:hover:text-white">
          <ArrowLeft size={18} />
        </Link>
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-display font-bold text-sm">M</div>
        <span className="font-display font-bold text-lg">Merqora</span>
        <Badge tone="info" className="ml-2">
          Sable — AI Buyer Demo
        </Badge>
        <button onClick={toggleTheme} className="ml-auto h-9 w-9 rounded-full flex items-center justify-center hover:bg-ink-100 dark:hover:bg-ink-800">
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_360px] gap-6 p-5">
        {/* Chat column */}
        <div className="flex flex-col h-[calc(100vh-7rem)]">
          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
                <div className={`max-w-[90%] ${m.role === "user" ? "" : ""}`}>
                  {m.text && (
                    <Card className={`p-4 ${m.role === "user" ? "bg-brand-600 text-white border-0" : ""}`}>
                      <p className="text-sm leading-relaxed">{m.text}</p>
                    </Card>
                  )}
                  {m.products && m.products.length > 0 && (
                    <div className="grid sm:grid-cols-2 gap-3 mt-3">
                      {m.products.map((p) => (
                        <Card key={p.id} className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-sm">{p.name}</p>
                              <p className="text-xs text-ink-400 mt-0.5">{p.category}</p>
                            </div>
                            <Badge tone={p.availability === "in_stock" ? "success" : "danger"}>{p.availability === "in_stock" ? "In stock" : "Out of stock"}</Badge>
                          </div>
                          <p className="text-xs text-ink-500 dark:text-ink-400 mt-2 line-clamp-2">{p.description}</p>
                          <div className="flex items-center justify-between mt-3">
                            <span className="font-display font-semibold">{formatPaise(p.priceInPaise)}</span>
                            <Button size="sm" disabled={p.availability !== "in_stock"} onClick={() => addToCart(p)}>
                              <Plus size={14} /> Add
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <Card className="p-4 inline-flex items-center gap-2 text-sm text-ink-400">
                <Spinner /> Sable is searching the catalog...
              </Card>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 mt-4"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="I need running shoes under ₹5000..."
              className="flex-1 rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-500/50"
            />
            <Button type="submit" disabled={loading || !input.trim()}>
              <Send size={16} />
            </Button>
          </form>
        </div>

        {/* Cart / checkout column */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShoppingBag size={18} className="text-brand-600" />
              <h3 className="font-display font-semibold">Your cart</h3>
            </div>
            {!cart || cart.items.length === 0 ? (
              <p className="text-sm text-ink-400">Nothing here yet — ask Sable to find you something.</p>
            ) : (
              <div className="space-y-2">
                {cart.items.map((i) => (
                  <div key={i.id} className="flex items-center justify-between text-sm">
                    <span>
                      {i.name} × {i.quantity}
                    </span>
                    <span className="font-medium">{formatPaise(i.lineTotalInPaise)}</span>
                  </div>
                ))}
                <div className="border-t border-ink-100 dark:border-ink-800 pt-2 mt-2 flex items-center justify-between font-semibold text-sm">
                  <span>Subtotal</span>
                  <span>{formatPaise(cart.subtotalInPaise)}</span>
                </div>
                {stage === "shopping" && (
                  <Button className="w-full mt-2" onClick={startCheckout}>
                    Proceed to Checkout
                  </Button>
                )}
              </div>
            )}
          </Card>

          {upsell.length > 0 && stage === "shopping" && (
            <Card className="p-4">
              <h4 className="font-display font-semibold text-sm mb-2">You might also like</h4>
              <div className="space-y-2">
                {upsell.map((u) => (
                  <div key={u.productId} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{u.name}</span>
                      <span>{formatPaise(u.priceInPaise)}</span>
                    </div>
                    <p className="text-xs text-ink-400">{u.reason}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {stage === "paying" && (
            <Card className="p-4">
              <h4 className="font-display font-semibold text-sm mb-3">Complete payment</h4>
              <p className="text-xs text-ink-500 dark:text-ink-400 mb-3">Total: {orderTotal ? formatPaise(orderTotal) : "—"}</p>
              {paymentMode === "mock" ? (
                <div className="space-y-2">
                  <Badge tone="warning">Razorpay test keys not configured — using local mock payment</Badge>
                  <Button variant="success" className="w-full" onClick={() => simulateMockPayment(true)}>
                    Simulate Successful Payment
                  </Button>
                  <Button variant="secondary" className="w-full" onClick={() => simulateMockPayment(false)}>
                    Simulate Failed Payment
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-ink-500">
                  <Loader2 size={16} className="animate-spin" /> Waiting for Razorpay checkout...
                </div>
              )}
              {paymentError && <p className="text-sm text-red-600 mt-2">{paymentError}</p>}
            </Card>
          )}

          {stage === "confirmed" && (
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
              <Card className="p-5 text-center">
                <CheckCircle2 className="text-emerald-600 mx-auto mb-2" size={32} />
                <p className="font-display font-semibold">Order confirmed!</p>
                <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">Payment verified server-side. Your order is on its way.</p>
              </Card>
            </motion.div>
          )}

          {stage === "failed" && (
            <Card className="p-5 text-center">
              <XCircle className="text-red-600 mx-auto mb-2" size={32} />
              <p className="font-display font-semibold">Payment failed</p>
              <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">{paymentError || "Your card was not charged."}</p>
              <Button variant="secondary" className="mt-3" onClick={() => setStage("shopping")}>
                Back to shopping
              </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
