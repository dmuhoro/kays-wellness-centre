import { createFileRoute, Link } from "@tanstack/react-router";
import { HeroCarousel } from "@/components/site/HeroCarousel";
import { WellnessTips } from "@/components/site/WellnessTips";
import { Testimonials } from "@/components/site/Testimonials";
import { BookingWidget } from "@/components/site/BookingWidget";
import { AskQuestion } from "@/components/site/AskQuestion";
import {
  Activity,
  Heart,
  Leaf,
  ArrowRight,
  Shield,
  Microscope,
  HandHeart,
  Globe2,
  GraduationCap,
  Sparkles,
  FlaskConical,
} from "lucide-react";
const hero =
  "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1920&q=80";
const drJackie =
  "https://images.unsplash.com/photo-1594824813573-246434e33963?auto=format&fit=crop&w=800&q=80";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kay's Wellness Centre — Premium Functional Medicine | Nairobi, Kenya" },
      {
        name: "description",
        content:
          "Bespoke BHRT, IV nutritional therapy, chronic disease management, and functional weight optimisation for executives and professionals. Precision medicine, African luxury.",
      },
      { property: "og:title", content: "Kay's Wellness Centre — Premium Functional Medicine" },
      {
        property: "og:description",
        content:
          "Bespoke functional medicine for executives. BHRT, IV therapy, chronic disease reversal, and metabolic optimisation in Nairobi.",
      },
    ],
  }),
  component: Home,
});

const focusAreas = [
  {
    icon: Heart,
    title: "Bioidentical Hormone Replacement Therapy (BHRT)",
    desc: "Precision-compounded hormones tailored to your endocrine profile. Restore vitality, correct adrenal fatigue, and rebalance perimenopause or andropause.",
  },
  {
    icon: FlaskConical,
    title: "IV Nutritional Therapy & Detoxification",
    desc: "Therapeutic-grade intravenous nutrient drips bespoke-compounded to your biomarker panel for rapid cellular replenishment and deep detoxification.",
  },
  {
    icon: Shield,
    title: "Chronic Disease & Cellular Wellness",
    desc: "Advanced mitochondrial support and inflammation quenching for hypertension, type 2 diabetes, and metabolic syndrome — designed for measurable reversal.",
  },
  {
    icon: Leaf,
    title: "Functional Weight Management & Metabolic Optimization",
    desc: "Physician-supervised metabolic reconfiguration with body composition analysis, gut microbiome assessment, and DNA-informed nutrition strategies.",
  },
];

const trust = [
  { icon: Shield, label: "Bespoke Medical Protocols" },
  { icon: Microscope, label: "Advanced Functional Diagnostics" },
  { icon: HandHeart, label: "Executive-Grade Care" },
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
                  <div
                    key={t.label}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <t.icon className="size-4 text-primary" />
                    <span className="font-medium">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative animate-scale-in">
              <div className="absolute -inset-4 gradient-hero rounded-3xl blur-2xl opacity-30" />
              <img
                src={hero}
                alt="Kay's Wellness clinic interior"
                className="relative rounded-3xl shadow-elegant w-full object-cover aspect-[4/5]"
                width={1600}
                height={1024}
              />
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
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">
              Our Core Protocols
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold">
              Precision medicine for the high-performance life
            </h2>
            <p className="mt-4 text-muted-foreground">
              Bespoke functional medicine protocols engineered for executives and professionals who
              demand the same rigor from their health as they do from their careers.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {focusAreas.map((f, i) => (
              <Link
                key={f.title}
                to="/services"
                className="card-lift glass rounded-2xl p-7 animate-fade-up"
                style={{ animationDelay: `${i * 100}ms` }}
              >
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
              <img
                src={drJackie}
                alt="Dr. Jacqueline Mwanu"
                className="relative rounded-3xl shadow-elegant w-full object-cover aspect-[4/5]"
                loading="lazy"
                width={1024}
                height={1280}
              />
              <div className="absolute top-4 left-4 glass rounded-full px-3 py-1.5 text-xs font-semibold text-primary inline-flex items-center gap-1.5 border-warm">
                <GraduationCap className="size-3.5 text-accent" /> MD · MBChB · MPH · IHDiP
              </div>
            </div>
            <div className="lg:col-span-3 animate-fade-up">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary border-warm text-xs font-semibold text-primary uppercase tracking-widest">
                <Globe2 className="size-3.5 text-accent" /> Our Mission
              </div>
              <h2 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
                Redefining healthcare for Africa's leaders.
              </h2>
              <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
                Led by{" "}
                <span className="font-semibold text-foreground">
                  Dr. Jacqueline Mwanu, MD, MBChB, MPH, IHDiP
                </span>{" "}
                — a Public Health Physician & Functional/Integrative Medicine Specialist — Kay's
                Wellness Centre brings world-class precision medicine to Kenya's corporate and
                professional elite.
              </p>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                We replace the reactive, crisis-driven model with proactive, data-backed,
                cellular-level health optimisation. Every protocol is bespoke. Every decision is
                evidence-based. Every patient is treated with the discretion and dignity befitting a
                premium medical practice.
              </p>
              <div className="mt-7 grid sm:grid-cols-3 gap-3">
                {[
                  { k: "Reactive → Proactive", v: "Biomarker-driven prevention" },
                  { k: "Generic → Bespoke", v: "Tailored to your biology" },
                  { k: "Patient → Partner", v: "Shared, high-agency decisions" },
                ].map((s) => (
                  <div key={s.k} className="glass rounded-2xl p-4 border-warm">
                    <div className="text-sm font-semibold text-primary">{s.k}</div>
                    <div className="text-xs text-muted-foreground mt-1">{s.v}</div>
                  </div>
                ))}
              </div>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  to="/our-story"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold shadow-elegant hover:shadow-glow transition-all"
                >
                  Meet Dr. Jacqueline Mwanu <ArrowRight className="size-4" />
                </Link>
                <Link
                  to="/services"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl glass font-semibold hover:bg-secondary border-warm"
                >
                  View All Protocols
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
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">
              Begin Your Transformation
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold">
              Book a consultation or speak with our team
            </h2>
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
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: "radial-gradient(circle at 30% 20%, white 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
            <div className="relative">
              <h2 className="text-3xl sm:text-5xl font-bold text-primary-foreground tracking-tight">
                From surviving to thriving — precision medicine for the discerning few.
              </h2>
              <p className="mt-4 text-primary-foreground/85 max-w-xl mx-auto">
                Book your comprehensive 90-minute executive health consultation. Fully confidential.
                Entirely bespoke. The first step toward your biological optimisation begins here.
              </p>
              <Link
                to="/contact"
                className="mt-8 inline-flex items-center gap-2 px-7 py-4 rounded-xl bg-background text-primary font-semibold shadow-elegant hover:scale-[1.02] transition-transform"
              >
                Reserve Your Consultation <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
