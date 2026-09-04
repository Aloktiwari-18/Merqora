import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button, Card, Input } from "../components/ui/kit";
import { extractErrorMessage } from "../lib/api";
import { Sparkles } from "lucide-react";

export default function LoginPage() {
  const { login, demoLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDemo() {
    setLoading(true);
    setError(null);
    try {
      await demoLogin();
      navigate("/dashboard");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-50 dark:bg-ink-950 px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-display font-bold text-sm">M</div>
          <span className="font-display font-bold text-lg">Merqora</span>
        </div>
        <h1 className="font-display font-semibold text-xl mb-1">Welcome back</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400 mb-6">Log in to your merchant dashboard.</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Logging in..." : "Log in"}
          </Button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="h-px bg-ink-100 dark:bg-ink-800 flex-1" />
          <span className="text-xs text-ink-400">or</span>
          <div className="h-px bg-ink-100 dark:bg-ink-800 flex-1" />
        </div>

        <Button variant="secondary" className="w-full" onClick={handleDemo} disabled={loading}>
          <Sparkles size={16} /> Use demo merchant account
        </Button>

        <p className="text-sm text-ink-500 dark:text-ink-400 mt-6 text-center">
          Don't have an account?{" "}
          <Link to="/register" className="text-brand-600 font-medium">
            Register
          </Link>
        </p>
      </Card>
    </div>
  );
}
