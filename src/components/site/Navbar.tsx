import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, X, Leaf, CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// Global navigation bar component

const links = [
  { to: "/", label: "Home" },
  { to: "/our-story", label: "Our Story" },
  { to: "/services", label: "Services" },
  { to: "/resources", label: "Resources" },
  { to: "/contact", label: "Reach Out" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 inset-x-0 z-50 transition-all duration-500",
        scrolled ? "py-2" : "py-4",
      )}
    >
      <div className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 transition-all")}>
        <div
          className={cn(
            "flex items-center justify-between rounded-2xl px-4 sm:px-6 py-3 transition-all duration-500",
            scrolled ? "glass shadow-card" : "bg-transparent",
          )}
        >
          <Link to="/" className="flex items-center gap-2 group">
            <div className="size-9 rounded-xl gradient-hero flex items-center justify-center shadow-glow">
              <Leaf className="size-5 text-primary-foreground" />
            </div>
            <div className="leading-tight">
              <div className="font-display font-bold text-foreground">Kay's Wellness</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Centre
              </div>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="px-4 py-2 text-sm font-medium text-foreground/80 hover:text-primary rounded-lg hover:bg-secondary/60 transition-colors"
                activeProps={{
                  className: "px-4 py-2 text-sm font-semibold text-primary rounded-lg bg-secondary",
                }}
                activeOptions={{ exact: l.to === "/" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/contact"
              className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-hero text-primary-foreground text-sm font-semibold shadow-elegant hover:shadow-glow transition-all hover:scale-[1.02]"
            >
              <CalendarCheck className="size-4" />
              Book Now
            </Link>
            <button
              onClick={() => setOpen(!open)}
              className="lg:hidden size-10 rounded-xl glass flex items-center justify-center"
              aria-label="Toggle menu"
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {open && (
          <div className="lg:hidden mt-2 glass rounded-2xl p-3 animate-fade-up">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="block px-4 py-3 rounded-lg text-foreground/80 hover:bg-secondary/60 font-medium"
              >
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
