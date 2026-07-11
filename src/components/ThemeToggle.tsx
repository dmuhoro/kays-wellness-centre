import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`size-8 rounded-lg glass flex items-center justify-center hover:bg-secondary/50 transition-colors ${className}`}
      title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      aria-label="Toggle theme"
    >
      {theme === "light" ? (
        <Moon className="size-4 text-muted-foreground" />
      ) : (
        <Sun className="size-4 text-muted-foreground" />
      )}
    </button>
  );
}
