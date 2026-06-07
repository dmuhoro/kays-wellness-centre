import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, Activity, Leaf, Brain, FlaskConical, Pill, Home, Stethoscope, Scan, TestTube, HandHeart, Waves, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "Clinical Services | Dr. Jacqueline Mwanu | Kay's Wellness Centre" },
      { name: "description", content: "Integrative, root-cause clinical protocols for digestive care, metabolic optimization, endocrine health, and lifestyle diseases." },
      { property: "og:title", content: "Clinical Services — Kay's Wellness Centre" },
      { property: "og:description", content: "Integrative, root-cause clinical protocols for digestive care, metabolic optimization, endocrine health, and lifestyle diseases." },
    ],
  }),
  component: Services,
});

const treatments = [
  { icon: Leaf, title: "Digestive Conditions", desc: "Microbiome Restoration, Chronic H. Pylori eradication protocols, IBS management, and Gut-Lining Repair — resolved through gut-lining repair protocols, targeted diagnostics, and clinical nutrition." },
  { icon: Heart, title: "Hormone & Endocrine Disorders", desc: "Cellular Insulin Sensitivity, Metabolic Optimization, and Thyroid Health — including PCOS, perimenopause, and adrenal recovery guided by functional endocrine panels." },
  { icon: Brain, title: "Autoimmune Conditions", desc: "Hashimoto's, lupus, and rheumatoid arthritis — addressed through gut-immune axis repair, anti-inflammatory nutrition, and environmental trigger mapping." },
  { icon: Activity, title: "Lifestyle & Metabolic Diseases", desc: "Proactive, multi-modal management and reversal protocols for Hypertension and Type 2 Diabetes — through evidence-based lifestyle medicine, movement prescription, and clinical nutrition." },
];

const offerings = [
  { icon: FlaskConical, title: "Modern Lab" },
  { icon: Pill, title: "Dispensing Pharmacy" },
  { icon: Home, title: "Home Care Visits" },
  { icon: Stethoscope, title: "Consultations" },
  { icon: Scan, title: "Imaging" },
  { icon: TestTube, title: "Functional Testing" },
  { icon: HandHeart, title: "Physiotherapy & Osteopathy" },
  { icon: Waves, title: "Lymphatic Drainage" },
];

function Services() {
  return (
    <>
      <section className="py-20 sm:py-24 relative overflow-hidden">
        <div className="absolute inset-0 pattern-mudcloth opacity-40 pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs uppercase tracking-widest text-accent font-semibold mb-3">Whole-Person, Whole-System Care</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight max-w-3xl mx-auto">Integrative care, <span className="text-gradient">rooted in the cause</span></h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">Every protocol combines rigorous conventional medicine with clinical nutrition, gut-lining repair, therapeutic coaching and mind-body modalities — meditation, stress management and yoga.</p>
        </div>
      </section>

      <section className="pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Specialized Treatments</p>
            <h2 className="text-2xl sm:text-3xl font-bold">Conditions we focus on</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {treatments.map((t, i) => (
              <div key={t.title} className="card-lift glass rounded-2xl p-8 animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="flex items-start gap-5">
                  <div className="size-14 rounded-2xl gradient-hero flex items-center justify-center shrink-0 shadow-glow">
                    <t.icon className="size-7 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">{t.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{t.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 gradient-soft">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Clinic Offerings</p>
            <h2 className="text-2xl sm:text-3xl font-bold">Everything you need in one place</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {offerings.map((o, i) => (
              <div key={o.title} className="glass rounded-2xl p-6 text-center card-lift animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="size-12 rounded-xl bg-background flex items-center justify-center mx-auto mb-4 shadow-card">
                  <o.icon className="size-6 text-primary" />
                </div>
                <h3 className="font-semibold text-sm">{o.title}</h3>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link to="/contact" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold shadow-elegant hover:shadow-glow transition-all">
              Book a service <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
