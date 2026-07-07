import { useState } from "react";
import { X, ArrowRight, FlaskConical } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { specialties, type Specialty } from "@/data/specialties";

function SpecialtyModal({ specialty, onClose }: { specialty: Specialty; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl bg-background p-8 sm:p-10 shadow-elegant animate-scale-in border border-border/60"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 size-10 rounded-xl glass flex items-center justify-center hover:bg-secondary transition-colors"
        >
          <X className="size-5" />
        </button>

        <div
          className={`size-16 rounded-2xl bg-gradient-to-br ${specialty.gradient} flex items-center justify-center mb-5 shadow-card`}
        >
          <specialty.icon className="size-8 text-primary" />
        </div>

        <p className="text-xs uppercase tracking-widest text-accent font-semibold mb-1">
          {specialty.tagline}
        </p>
        <h2 className="text-2xl sm:text-3xl font-bold mb-4">{specialty.title}</h2>
        <p className="text-muted-foreground leading-relaxed mb-6">{specialty.description}</p>

        <div className="rounded-2xl bg-gradient-to-br from-primary/5 to-accent/5 border border-border/60 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical className="size-4 text-accent" />
            <span className="text-sm font-semibold">Clinical Protocol</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{specialty.protocol}</p>
        </div>

        <div className="mb-6">
          <p className="text-sm font-semibold mb-3">Key components</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {specialty.features.map((f) => (
              <div
                key={f}
                className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/50 rounded-xl px-4 py-2.5"
              >
                <div className="size-1.5 rounded-full bg-accent shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Link
            to="/contact"
            className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold hover:shadow-glow transition-all"
          >
            Inquire for Availability <ArrowRight className="size-4" />
          </Link>
          <button
            onClick={onClose}
            className="px-6 py-3.5 rounded-xl glass font-semibold hover:bg-secondary transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function Specialties() {
  const [selected, setSelected] = useState<Specialty | null>(null);

  return (
    <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {specialties.slice(0, 8).map((s, i) => (
          <div
            key={s.id}
            className="group card-lift glass rounded-2xl p-6 animate-fade-up flex flex-col"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div
              className={`size-12 rounded-xl bg-gradient-to-br ${s.gradient} flex items-center justify-center mb-4 shadow-card`}
            >
              <s.icon className="size-6 text-primary" />
            </div>
            <h3 className="font-semibold text-sm mb-2">{s.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4 flex-1">{s.tagline}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setSelected(s)}
                className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg gradient-hero text-primary-foreground hover:shadow-glow transition-all"
              >
                {s.cta === "protocol" ? "View Clinical Protocol" : "Inquire for Availability"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center mt-10">
        <Link
          to="/services"
          className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold shadow-elegant hover:shadow-glow transition-all"
        >
          View all clinical protocols <ArrowRight className="size-4" />
        </Link>
      </div>

      {selected && <SpecialtyModal specialty={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
