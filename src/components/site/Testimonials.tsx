import { useState } from "react";
import { Quote, Star, TrendingUp } from "lucide-react";

const categories = [
  "All",
  "Digestive Restoration",
  "Reproductive Health",
  "Maternal Wellness",
  "Autoimmune",
];

type Story = {
  name: string;
  category: string;
  condition: string;
  outcome: string;
  text: string;
  rating: number;
};

const reviews: Story[] = [
  {
    name: "Mr. Nganga, 48",
    category: "Digestive Restoration",
    condition: "Chronic gastritis · 6+ years on PPIs",
    outcome: "From medication dependence to lifestyle-managed gut restoration",
    text: "Dr. Jackie's team mapped the root drivers behind my chronic gastritis — H. Pylori, food sensitivities and stress physiology. Twelve weeks into the protocol I was off daily medication and rebuilding my gut lining.",
    rating: 5,
  },
  {
    name: "Wanjiku M., 34",
    category: "Reproductive Health",
    condition: "PCOS · irregular cycles for 9 years",
    outcome: "Hormonal balance restored · regular ovulation by month 5",
    text: "The functional workup finally identified the metabolic and hormonal roots of my PCOS. My cycle is regular for the first time in my adult life — without contraceptive masking.",
    rating: 5,
  },
  {
    name: "Faith N., 31",
    category: "Maternal Wellness",
    condition: "Preconception → postpartum care",
    outcome: "Healthy pregnancy · zero gestational complications",
    text: "From preconception nutrition through home-visit postpartum care, the integrative approach felt deeply personal. I have never felt this seen by a medical team.",
    rating: 5,
  },
  {
    name: "Otieno A., 42",
    category: "Autoimmune",
    condition: "Hashimoto's thyroiditis · TPO antibodies > 600",
    outcome: "Antibodies reduced 78% · sustained energy & mental clarity",
    text: "Rigorous diagnostics, gut-lining repair and therapeutic coaching transformed how I live. Evidence-based and profoundly compassionate.",
    rating: 5,
  },
  {
    name: "Susan W., 39",
    category: "Digestive Restoration",
    condition: "10-year IBS-D · daily bloating",
    outcome: "Symptom-free · sustained on personalised nutrition protocol",
    text: "The lymphatic drainage and microbiome protocol resolved bloating I had endured for a decade. I trust this team with my whole family's care.",
    rating: 5,
  },
];

export function Testimonials() {
  const [cat, setCat] = useState("All");
  const filtered = cat === "All" ? reviews : reviews.filter((r) => r.category === cat);

  return (
    <section className="py-20 sm:py-28 gradient-soft relative">
      <div className="absolute inset-0 pattern-mudcloth opacity-40 pointer-events-none" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-widest text-accent font-semibold mb-2">
            Clinical Impact Stories
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold">Real protocols. Real recoveries.</h2>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Verified patient outcomes from root-cause treatment plans.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${cat === c ? "gradient-hero text-primary-foreground shadow-elegant" : "glass hover:bg-secondary"}`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((r, i) => (
            <article
              key={i}
              className="glass rounded-2xl p-7 card-lift animate-fade-up flex flex-col"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <Quote className="size-8 text-accent/40 mb-3" />
              <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-1">
                {r.category}
              </div>
              <div className="text-sm text-muted-foreground mb-4 border-l-2 border-accent/50 pl-3">
                {r.condition}
              </div>
              <p className="text-foreground/90 leading-relaxed mb-5 italic">"{r.text}"</p>
              <div className="mt-auto rounded-xl border-warm bg-secondary/40 p-3 mb-4 flex items-start gap-2">
                <TrendingUp className="size-4 text-accent mt-0.5 shrink-0" />
                <div className="text-xs font-semibold text-foreground leading-snug">
                  {r.outcome}
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-border/60">
                <div className="font-semibold text-sm">{r.name}</div>
                <div className="flex gap-0.5">
                  {Array.from({ length: r.rating }).map((_, j) => (
                    <Star key={j} className="size-3.5 fill-accent text-accent" />
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
