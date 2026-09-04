import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Sparkles,
  ShoppingBag,
  Package,
  Users,
  ClipboardList,
  BarChart3,
  Megaphone,
  ScrollText,
  ShieldCheck,
  FlaskConical,
  Settings,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { cn } from "./ui/kit";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/ai-agent", label: "Nova — Revenue Agent", icon: Sparkles },
  { to: "/agent-commerce", label: "Sable — AI Buyer", icon: ShoppingBag },
  { to: "/products", label: "Products", icon: Package },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/audit-log", label: "Audit Log", icon: ScrollText },
  { to: "/policies", label: "Policies", icon: ShieldCheck },
  { to: "/failure-lab", label: "Failure Lab", icon: FlaskConical },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-ink-50 dark:bg-ink-950 flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-40 w-72 shrink-0 bg-white dark:bg-ink-900 border-r border-ink-100 dark:border-ink-800 flex flex-col transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-ink-100 dark:border-ink-800">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-display font-bold text-sm">
            M
          </div>
          <span className="font-display font-bold text-lg tracking-tight">Merqora</span>
          <button className="ml-auto lg:hidden" onClick={() => setMobileOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  isActive
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                    : "text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-800"
                )
              }
            >
              <item.icon className="h-4.5 w-4.5 shrink-0" size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-ink-100 dark:border-ink-800 space-y-2">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="h-8 w-8 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 flex items-center justify-center text-xs font-semibold">
              {user?.name?.slice(0, 2).toUpperCase() || "MC"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || "Merchant"}</p>
              <p className="text-xs text-ink-400 truncate">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800 dark:text-ink-400"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      {mobileOpen && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 border-b border-ink-100 dark:border-ink-800 bg-white/80 dark:bg-ink-900/80 backdrop-blur sticky top-0 z-20 flex items-center px-4 lg:px-6 gap-3">
          <button className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="h-9 w-9 rounded-full flex items-center justify-center text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 dark:text-ink-300"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4.5 w-4.5" size={18} /> : <Moon className="h-4.5 w-4.5" size={18} />}
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
