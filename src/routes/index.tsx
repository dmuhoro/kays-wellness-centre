import { createFileRoute, Link } from "@tanstack/react-router";
import { HeroCarousel } from "@/components/site/HeroCarousel";
import { WellnessTips } from "@/components/site/WellnessTips";
import { Testimonials } from "@/components/site/Testimonials";
import { BookingWidget } from "@/components/site/BookingWidget";
import { AskQuestion } from "@/components/site/AskQuestion";
import { Activity, Heart, Brain, Leaf, ArrowRight, Shield, Microscope, HandHeart, Globe2, GraduationCap, Sparkles } from "lucide-react";
const hero = "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1600&q=80";
const drJackie = "https://images.unsplash.com/photo-1594824813573-246434de83fb?auto=format&fit=crop&w=1000&q=80";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kay's Wellness Centre — Holistic Medical Care in Kenya" },
      { name: "description", content: "Evidence-based functional medicine. Hormone, digestive, autoimmune and lifestyle care rooted in modern diagnostics." },
      { property: "og:title", content: "Kay's Wellness Centre" },
      { property: "og:description", content: "Holistic, evidence-based medical care for lasting wellness." },
    ],
  }),
  component: Home,
});

const focusAreas = [
  { icon: Leaf, title: "Digestive Health", desc: "Microbiome Restoration, Chronic H. Pylori eradication protocols, IBS management, and Gut-Lining Repair." },
  { icon: Heart, title: "Hormone & Endocrine", desc: "Cellular Insulin Sensitivity, Metabolic Optimization, and Thyroid Health." },
  { icon: Brain, title: "Autoimmune Care", desc: "Hashimoto's, lupus, and rheumatoid arthritis — gut-immune axis repair, trigger mapping, and anti-inflammatory clinical nutrition." },
  { icon: Activity, title: "Lifestyle Diseases", desc: "Proactive, multi-modal management and reversal protocols for Hypertension and Type 2 Diabetes." },
];

const trust = [
  { icon: Shield, label: "Evidence-Based" },
  { icon: Microscope, label: "Functional Diagnostics" },
  { icon: HandHeart, label: "Whole-Person Care" },
];

function Home() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-40 -right-40 size-[500px] rounded-full bg-primary/20 blur-3xl animate-float" />
          <div className="absolute top-40 -left-40 size-[400px] rounded-full bg-accent/40 blur-3xl" />
        </div>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="animate-fade-up">
              <HeroCarousel />
              <div className="mt-10 flex flex-wrap gap-6 pt-8 border-t border-border/60">
                {trust.map((t) => (
                  <div key={t.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <t.icon className="size-4 text-primary" />
                    <span className="font-medium">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative animate-scale-in">
              <div className="absolute -inset-4 gradient-hero rounded-3xl blur-2xl opacity-30" />
              <img src={hero} alt="Kay's Wellness clinic interior" className="relative rounded-3xl shadow-elegant w-full object-cover aspect-[4/5]" width={1600} height={1024} />
              <div className="absolute -bottom-6 -left-6 glass rounded-2xl p-5 shadow-elegant animate-float border-warm">
                <div className="text-3xl font-bold text-gradient">15+</div>
                <div className="text-xs text-muted-foreground">Years of root-cause practice</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOCUS AREAS */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Our Focus</p>
            <h2 className="text-3xl sm:text-4xl font-bold">Care for the whole person</h2>
            <p className="mt-4 text-muted-foreground">We blend modern diagnostics with functional medicine to address the root causes of chronic conditions.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {focusAreas.map((f, i) => (
              <Link key={f.title} to="/services" className="card-lift glass rounded-2xl p-7 animate-fade-up" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="size-12 rounded-xl gradient-hero flex items-center justify-center mb-5 shadow-glow">
                  <f.icon className="size-6 text-primary-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-1.5">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                <div className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  Learn more <ArrowRight className="size-4" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* SHIFTING THE CULTURE — FOUNDER MISSION */}
      <section className="py-20 sm:py-24 relative overflow-hidden">
        <div className="absolute inset-0 pattern-kente opacity-30 pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-5 gap-10 items-center">
            <div className="lg:col-span-2 relative">
              <div className="absolute -inset-4 gradient-warm rounded-3xl blur-2xl opacity-25" />
              <img src={drJackie} alt="Dr. Jacqueline Mwanu" className="relative rounded-3xl shadow-elegant w-full object-cover aspect-[4/5]" loading="lazy" width={1024} height={1280} />
              <div className="absolute top-4 left-4 glass rounded-full px-3 py-1.5 text-xs font-semibold text-primary inline-flex items-center gap-1.5 border-warm">
                <GraduationCap className="size-3.5 text-accent" /> MD · MBChB · MPH · IHDiP
              </div>
            </div>
            <div className="lg:col-span-3 animate-fade-up">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary border-warm text-xs font-semibold text-primary uppercase tracking-widest">
                <Globe2 className="size-3.5 text-accent" /> Global Mission
              </div>
              <h2 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">Shifting the culture of healthcare.</h2>
              <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
                Led by <span className="font-semibold text-foreground">Dr. Jacqueline Mwanu, MD, MBChB, MPH, IHDiP</span> — a Public Health Physician & Functional/Integrative Medicine Specialist — Kay's Wellness Centre is reshaping how communities across Kenya and the African continent engage with their health.
              </p>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Our practice is built on a global public-health worldview: moving people from reactive crisis-management toward proactive, empowered, root-cause health-seeking habits. Prevention before prescription. Dignity before diagnosis.
              </p>
              <div className="mt-7 grid sm:grid-cols-3 gap-3">
                {[
                  { k: "Reactive → Proactive", v: "Crisis care to prevention" },
                  { k: "Symptom → Root", v: "Address upstream causes" },
                  { k: "Patient → Partner", v: "Shared, dignified decisions" },
                ].map((s) => (
                  <div key={s.k} className="glass rounded-2xl p-4 border-warm">
                    <div className="text-sm font-semibold text-primary">{s.k}</div>
                    <div className="text-xs text-muted-foreground mt-1">{s.v}</div>
                  </div>
                ))}
              </div>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/our-story" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold shadow-elegant hover:shadow-glow transition-all">
                  Meet Dr. Jacqueline Mwanu <ArrowRight className="size-4" />
                </Link>
                <Link to="/services" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl glass font-semibold hover:bg-secondary border-warm">
                  Our Integrative Care
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <WellnessTips />

      {/* BOOKING + ASK */}
      <section className="py-20 sm:py-28 gradient-soft">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Start Your Journey</p>
            <h2 className="text-3xl sm:text-4xl font-bold">Book a consultation or ask us anything</h2>
          </div>
          <div className="grid lg:grid-cols-2 gap-8">
            <BookingWidget />
            <AskQuestion />
          </div>
        </div>
      </section>

      <Testimonials />

      {/* CTA */}
      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl gradient-hero p-10 sm:p-16 text-center shadow-elegant">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 30% 20%, white 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
            <div className="relative">
              <h2 className="text-3xl sm:text-5xl font-bold text-primary-foreground tracking-tight">Moving from Firefighting Illness to Striving for True Wellness.</h2>
              <p className="mt-4 text-primary-foreground/85 max-w-xl mx-auto">Book your first 1-hour in-depth, fully confidential consultation today — and start treating the root cause.</p>
              <Link to="/contact" className="mt-8 inline-flex items-center gap-2 px-7 py-4 rounded-xl bg-background text-primary font-semibold shadow-elegant hover:scale-[1.02] transition-transform">
                Book Now <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
