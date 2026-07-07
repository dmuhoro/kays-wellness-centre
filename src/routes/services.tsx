import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, Leaf, FlaskConical, Shield, Pill, Home, Stethoscope, Scan, TestTube, HandHeart, Waves, ArrowRight, Activity } from "lucide-react";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "Premium Functional Medicine Services | Kay's Wellness Centre — Nairobi" },
      { name: "description", content: "Bespoke BHRT, IV nutritional therapy, chronic disease management, and functional weight optimization for executives and professionals in Kenya." },
      { property: "og:title", content: "Premium Functional Medicine — Kay's Wellness Centre" },
      { property: "og:description", content: "Bespoke BHRT, IV nutritional therapy, chronic disease management, and functional weight optimization for executives and professionals." },
    ],
  }),
  component: Services,
});

const treatments = [
  { icon: Heart, title: "Bioidentical Hormone Replacement Therapy (BHRT)", desc: "Precision-compounded bioidentical hormones meticulously tailored to restore endocrine equilibrium. Designed for executives and professionals experiencing adrenal fatigue, perimenopausal imbalance, and andropause — delivered under rigorous functional diagnostic protocol." },
  { icon: FlaskConical, title: "Intravenous (IV) Nutritional Therapy & Detoxification", desc: "Therapeutic-grade intravenous nutrient formulations administered in-clinic for rapid cellular replenishment, deep detoxification, and immune system fortification. Each drip is bespoke-compounded to your biomarker profile." },
  { icon: Shield, title: "Chronic Disease Management & Cellular Wellness", desc: "Advanced cellular health optimisation for hypertension, type 2 diabetes, and metabolic syndrome — combining mitochondrial support, inflammation quenching, and precision nutraceutical intervention for measurable reversal." },
  { icon: Leaf, title: "Functional Weight Management & Metabolic Optimization", desc: "Physician-supervised metabolic reconfiguration integrating body composition analysis, gut microbiome assessment, and DNA-informed nutrition strategies. Sustainable, science-driven — never generic." },
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
          <p className="text-xs uppercase tracking-widest text-accent font-semibold mb-3">Executive-Grade Functional Medicine</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight max-w-3xl mx-auto">Bespoke medical protocols, <span className="text-gradient">engineered for your biology</span></h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">Every protocol is custom-tailored to your biomarker profile, lifestyle, and health objectives. No templates. No shortcuts. Only precision, medical-grade functional medicine for those who demand the highest standard.</p>
        </div>
      </section>

      <section className="pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Core Protocols</p>
            <h2 className="text-2xl sm:text-3xl font-bold">Precision functional medicine offerings</h2>
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
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Premium Clinical Ecosystem</p>
            <h2 className="text-2xl sm:text-3xl font-bold">Everything you need, under one roof</h2>
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
