import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { Card } from "../components/ui/kit";
import { Sun, Moon } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h1 className="font-display font-bold text-2xl">Settings</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">Account and appearance preferences.</p>
      </div>

      <Card className="p-5">
        <h3 className="font-display font-semibold mb-3">Account</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-400">Name</span>
            <span>{user?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-400">Email</span>
            <span>{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-400">Role</span>
            <span>{user?.role}</span>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-display font-semibold mb-3">Appearance</h3>
        <div className="flex items-center justify-between">
          <p className="text-sm">Theme</p>
          <button onClick={toggleTheme} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-ink-100 dark:bg-ink-800">
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            {theme === "dark" ? "Dark" : "Light"}
          </button>
        </div>
      </Card>
    </div>
  );
}
