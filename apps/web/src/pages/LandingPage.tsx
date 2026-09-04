import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sparkles,
  ShieldCheck,
  GitBranch,
  ScrollText,
  Wrench,
  ArrowRight,
  Sun,
  Moon,
  CheckCircle2,
  XCircle,
  Bot,
  Lock,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function LandingPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-white dark:bg-ink-950 text-ink-900 dark:text-ink-50">
      {/* Nav */}
      <header className="sticky top-0 z-30 backdrop-blur bg-white/80 dark:bg-ink-950/80 border-b border-ink-100 dark:border-ink-800">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-display font-bold text-sm">
            M
          </div>
          <span className="font-display font-bold text-lg">Merqora</span>
          <nav className="hidden md:flex items-center gap-6 ml-8 text-sm text-ink-600 dark:text-ink-300">
            <a href="#how-it-works" className="hover:text-ink-900 dark:hover:text-white">How it works</a>
            <a href="#safety" className="hover:text-ink-900 dark:hover:text-white">Safety &amp; Governance</a>
            <a href="#architecture" className="hover:text-ink-900 dark:hover:text-white">Architecture</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={toggleTheme} className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-ink-100 dark:hover:bg-ink-800">
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Link to="/login" className="text-sm font-medium px-4 py-2 rounded-xl hover:bg-ink-100 dark:hover:bg-ink-800">
              Log in
            </Link>
            <Link to="/register" className="text-sm font-medium px-4 py-2 rounded-xl bg-brand-600 text-white hover:bg-brand-700">
              Launch Demo
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(91,116,240,0.12),transparent)]" />
        <div className="max-w-4xl mx-auto px-5 pt-20 pb-16 text-center">
          <motion.div initial="hidden" animate="show" variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 text-xs font-medium mb-6">
            <Sparkles size={14} /> Built for Razorpay — AI Growth &amp; Agentic Commerce
          </motion.div>
          <motion.h1
            initial="hidden"
            animate="show"
            variants={fadeUp}
            transition={{ delay: 0.05 }}
            className="font-display font-bold text-4xl md:text-6xl leading-[1.08] tracking-tight"
          >
            AI agents that discover revenue
            <br className="hidden md:block" /> opportunities and <span className="text-brand-600">safely execute commerce.</span>
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="show"
            variants={fadeUp}
            transition={{ delay: 0.1 }}
            className="mt-6 text-lg text-ink-600 dark:text-ink-300 max-w-2xl mx-auto"
          >
            Merqora connects merchant intelligence, agentic shopping, and bounded payments into one AI-native commerce layer —
            <span className="font-medium text-ink-800 dark:text-ink-100"> The Intelligence Layer for Commerce.</span>
          </motion.p>
          <motion.div initial="hidden" animate="show" variants={fadeUp} transition={{ delay: 0.15 }} className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <Link to="/register" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 text-white font-medium hover:bg-brand-700 shadow-sm">
              Launch Demo <ArrowRight size={16} />
            </Link>
            <Link to="/agent-commerce" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-ink-100 dark:bg-ink-800 font-medium hover:bg-ink-200 dark:hover:bg-ink-700">
              Try Sable, the AI Buyer
            </Link>
          </motion.div>
        </div>

        {/* Dashboard preview mock */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }} className="max-w-5xl mx-auto px-5 pb-10">
          <div className="rounded-2xl border border-ink-100 dark:border-ink-800 shadow-xl overflow-hidden bg-ink-50 dark:bg-ink-900">
            <div className="h-10 bg-ink-100 dark:bg-ink-800 flex items-center gap-1.5 px-4">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <div className="grid grid-cols-3 gap-3 p-5">
              {[
                { label: "Revenue", value: "₹4,82,400" },
                { label: "AI Opportunity", value: "₹38,700" },
                { label: "Approvals Pending", value: "2" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-white dark:bg-ink-950 border border-ink-100 dark:border-ink-800 p-4">
                  <p className="text-xs text-ink-400">{s.label}</p>
                  <p className="font-display font-bold text-xl mt-1">{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* Problem / Solution */}
      <section className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-2 gap-8">
        <div className="rounded-2xl border border-ink-100 dark:border-ink-800 p-8">
          <h3 className="font-display font-semibold text-xl mb-3">The problem</h3>
          <p className="text-ink-600 dark:text-ink-300 leading-relaxed">
            Merchants sit on revenue signals — abandoned carts, underpriced bestsellers, weekend demand spikes — that go unnoticed until
            it's too late. Meanwhile, "AI agents" that can act on commerce are typically given either no real access (chatbots that can't
            act) or unrestricted access (agents that can move money with no guardrails).
          </p>
        </div>
        <div className="rounded-2xl border border-brand-100 dark:border-brand-900/40 bg-brand-50/50 dark:bg-brand-950/20 p-8">
          <h3 className="font-display font-semibold text-xl mb-3">The Merqora approach</h3>
          <p className="text-ink-600 dark:text-ink-300 leading-relaxed">
            AI proposes revenue actions grounded in real store data. A deterministic policy engine decides what's allowed. Humans approve
            anything sensitive. Code — never the model — executes money movement via Razorpay. Every step is audited.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-5 py-16">
        <h2 className="font-display font-bold text-3xl text-center mb-12">How it works</h2>
        <div className="grid md:grid-cols-4 gap-6">
          {[
            { icon: Sparkles, title: "Nova finds opportunities", desc: "The Revenue Agent reads real dashboard data — no invented numbers — and surfaces abandoned carts, underpriced bestsellers, and weekend demand patterns." },
            { icon: Bot, title: "Sable shops for customers", desc: "The AI Buyer searches an agent-readable catalog, compares products, and explains its reasoning before checkout." },
            { icon: ShieldCheck, title: "Policy engine decides", desc: "Deterministic code checks every proposed discount, campaign, or transaction against merchant-configured limits." },
            { icon: Lock, title: "Razorpay executes, verified", desc: "Payments run in Razorpay Test Mode with server-side signature verification — the frontend's word is never trusted." },
          ].map((s, i) => (
            <motion.div key={s.title} initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} transition={{ delay: i * 0.06 }} className="rounded-2xl border border-ink-100 dark:border-ink-800 p-6">
              <s.icon className="text-brand-600 mb-4" size={28} />
              <h4 className="font-display font-semibold mb-2">{s.title}</h4>
              <p className="text-sm text-ink-600 dark:text-ink-300 leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Safety & Governance */}
      <section id="safety" className="bg-ink-50 dark:bg-ink-900/40 py-16">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <h2 className="font-display font-bold text-3xl mb-4">AI proposes. Policy decides.</h2>
          <p className="text-ink-600 dark:text-ink-300 max-w-2xl mx-auto mb-10">
            Humans approve sensitive actions. Code executes money movement. Audit records everything. This principle runs through every
            screen in Merqora.
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap font-mono text-xs md:text-sm">
            {["AI", "Action Proposal", "Policy Engine", "Risk Evaluation", "Approval (if required)", "Payment / Commerce Action", "Audit Log"].map((step, i, arr) => (
              <div key={step} className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-lg bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700">{step}</span>
                {i < arr.length - 1 && <ArrowRight size={14} className="text-ink-300 dark:text-ink-600" />}
              </div>
            ))}
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-5 mt-14 grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-800 p-6">
            <h4 className="font-display font-semibold mb-4 flex items-center gap-2"><CheckCircle2 size={18} className="text-emerald-600" /> AI is used for</h4>
            <ul className="space-y-2 text-sm text-ink-600 dark:text-ink-300">
              <li>Intent detection &amp; product discovery</li>
              <li>Natural language analytics ("why did revenue drop?")</li>
              <li>Campaign &amp; upsell suggestions with explanations</li>
              <li>Customer-facing shopping assistance</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-800 p-6">
            <h4 className="font-display font-semibold mb-4 flex items-center gap-2"><XCircle size={18} className="text-red-500" /> AI is never used for</h4>
            <ul className="space-y-2 text-sm text-ink-600 dark:text-ink-300">
              <li>Deciding payment amounts or discount limits</li>
              <li>Inventory validation or order state transitions</li>
              <li>Authentication, authorization, or RBAC</li>
              <li>Payment or webhook signature verification</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section id="architecture" className="max-w-6xl mx-auto px-5 py-16">
        <h2 className="font-display font-bold text-3xl text-center mb-12">Architecture</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: GitBranch, title: "Reasoning ↔ Tools ↔ Execution", desc: "The AI agent only ever calls named, Zod-validated tools backed by real Prisma queries — never raw SQL, never invented data." },
            { icon: ScrollText, title: "Full audit trail", desc: "Every agent action, policy evaluation, approval, and payment event is written to an immutable, filterable audit log." },
            { icon: Wrench, title: "Failure Lab", desc: "Simulate payment failures, inventory races, duplicate requests, timeouts, and webhook delays — and watch the recovery path." },
          ].map((s) => (
            <div key={s.title} className="rounded-2xl border border-ink-100 dark:border-ink-800 p-6">
              <s.icon className="text-brand-600 mb-4" size={28} />
              <h4 className="font-display font-semibold mb-2">{s.title}</h4>
              <p className="text-sm text-ink-600 dark:text-ink-300 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-5 py-20 text-center">
        <h2 className="font-display font-bold text-3xl mb-4">See it in action</h2>
        <p className="text-ink-600 dark:text-ink-300 mb-8">Spin up the demo merchant dashboard, or talk to Sable as a shopper.</p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link to="/register" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 text-white font-medium hover:bg-brand-700">
            Launch Demo <ArrowRight size={16} />
          </Link>
          <Link to="/agent-commerce" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-ink-100 dark:bg-ink-800 font-medium hover:bg-ink-200 dark:hover:bg-ink-700">
            Try AI Buyer
          </Link>
        </div>
      </section>

      <footer className="border-t border-ink-100 dark:border-ink-800 py-8">
        <div className="max-w-6xl mx-auto px-5 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-ink-400">
          <span>© {new Date().getFullYear()} Merqora. Built for the Razorpay AI Growth &amp; Agentic Commerce track.</span>
          <span>Test-mode payments only. No real money moves in this demo.</span>
        </div>
      </footer>
    </div>
  );
}
