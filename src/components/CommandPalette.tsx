import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Columns,
  Calendar,
  Table2,
  DollarSign,
  FileSpreadsheet,
  Activity,
  Settings,
} from "lucide-react";
import { useHotkey } from "@/hooks/use-hotkey";

const NAV_ITEMS = [
  { id: "dashboard", label: "Operations Dashboard", icon: LayoutDashboard, to: "/admin/dashboard" },
  { id: "triage", label: "Clinical Command Desk", icon: Columns, to: "/admin/triage", view: "pipeline" },
  { id: "calendar", label: "Calendar View", icon: Calendar, to: "/admin/triage", view: "calendar" },
  { id: "table", label: "Table View", icon: Table2, to: "/admin/triage", view: "table" },
  { id: "finance", label: "Billing Ledger", icon: DollarSign, to: "/admin/finance" },
  { id: "data-export", label: "Data Export", icon: FileSpreadsheet, to: "/admin/settings/data" },
  { id: "operations", label: "Operations Settings", icon: Settings, to: "/admin/settings/operations" },
  { id: "diagnostics", label: "System Diagnostics", icon: Activity, to: "/admin/system/diagnostics" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useHotkey({ key: "k", ctrlOrMeta: true }, () => setOpen(true));

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback(
    (item: (typeof NAV_ITEMS)[number]) => {
      setOpen(false);
      if (item.view) {
        navigate({ to: item.to, search: { view: item.view } as any });
      } else {
        navigate({ to: item.to });
      }
    },
    [navigate],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search views, settings, and tools..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {NAV_ITEMS.map((item) => (
            <CommandItem key={item.id} onSelect={() => handleSelect(item)}>
              <item.icon className="mr-2 size-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
