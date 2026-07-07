import { createFileRoute, Link } from "@tanstack/react-router";
import { Award, HeartHandshake, Sparkles, FlaskConical, ArrowRight, GraduationCap, Globe2, Stethoscope } from "lucide-react";
const drJackie = "https://images.unsplash.com/photo-1594824813573-246434e33963?auto=format&fit=crop&w=800&q=80";
const team1 = "https://images.unsplash.com/photo-1517816743773-6e0fd518b4a6?auto=format&fit=crop&w=800&q=80";
const team2 = "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=800&q=80";
const team3 = "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=800&q=80";

export const Route = createFileRoute("/our-story")({
  head: () => ({
    meta: [
      { title: "Our Story — Dr. Jacqueline Mwanu | Kay's Wellness Centre" },
      { name: "description", content: "Meet Dr. Jacqueline Mwanu (MD, MBChB, MPH, IHDiP) — Public Health Physician and Functional & Integrative Medicine Specialist shifting the culture of healthcare across Africa." },
      { property: "og:title", content: "Our Story — Kay's Wellness Centre" },
      { property: "og:description", content: "Evidence-based, root-cause, holistic care led by Dr. Jacqueline Mwanu." },
    ],
  }),
  component: OurStory,
});

const credentials = [
  { label: "MD", desc: "Doctor of Medicine" },
  { label: "MBChB", desc: "Bachelor of Medicine & Surgery" },
  { label: "MPH", desc: "Master of Public Health" },
  { label: "IHDiP", desc: "Integrative Health Diploma" },
];

const values = [
  { icon: FlaskConical, title: "Evidence-Based", desc: "Modern functional diagnostics and peer-reviewed protocols guide every decision." },
  { icon: HeartHandshake, title: "Affordable Access", desc: "Premium holistic care, structured to remain accessible to our community." },
  { icon: Sparkles, title: "Holistic Healing", desc: "We treat the whole person — body, mind, lifestyle and environment." },
  { icon: Award, title: "Trust & Innovation", desc: "Long-term relationships built on integrity and continuous learning." },
];

const team = [
  { name: "Dr. Aisha N.", role: "Functional Medicine", img: team1 },
  { name: "Dr. Samuel O.", role: "Lifestyle Medicine & Nutrition", img: team2 },
  { name: "Carol M., PT", role: "Physiotherapy & Osteopathy", img: team3 },
];

function OurStory() {
  return (
    <>
      {/* FOUNDER HERO */}
      <section className="py-20 sm:py-28 relative overflow-hidden">
        <div className="absolute inset-0 pattern-kente opacity-30 pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            <div className="animate-fade-up">
              <p className="text-xs uppercase tracking-widest text-accent font-semibold mb-3">Founder & Lead Physician</p>
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Dr. Jacqueline <span className="text-gradient">Mwanu, MD, MBChB, MPH, IHDiP</span></h1>
              <p className="mt-2 text-lg font-medium text-primary">Public Health Physician & Functional/Integrative Medicine Specialist</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {credentials.map((c) => (
                  <span key={c.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary border-warm text-xs font-semibold text-primary">
                    <GraduationCap className="size-3.5 text-accent" /> {c.label}
                  </span>
                ))}
              </div>
              <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
                Dr. Jacqueline Mwanu founded Kay's Wellness Centre on a single conviction: chronic disease should be <em>prevented and reversed where possible</em> — not endlessly managed. Trained in both rigorous clinical medicine and public-health systems thinking, she brings a whole-person, whole-system lens to every patient she sees.
              </p>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                From hormonal imbalance and digestive disorders to autoimmune and metabolic conditions, her work looks beyond symptoms to uncover root causes — and builds personalised, sustainable plans that respect each patient's life, culture and community.
              </p>
            </div>
            <div className="relative animate-scale-in">
              <div className="absolute -inset-4 gradient-warm rounded-3xl blur-2xl opacity-30" />
              <img src={drJackie} alt="Dr. Jacqueline Mwanu, MD, MBChB, MPH, IHDiP" className="relative rounded-3xl shadow-elegant w-full object-cover aspect-[4/5]" width={1024} height={1280} loading="lazy" />
              <div className="absolute -bottom-6 left-6 right-6 glass rounded-2xl p-5 border-warm">
                <div className="text-xs uppercase tracking-widest text-accent font-semibold">In her own words</div>
                <p className="text-sm mt-2 leading-relaxed italic">"Moving from Firefighting Illness to Striving for True Wellness — one patient, one family, one community at a time."</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GLOBAL MISSION */}
      <section className="py-20 sm:py-24 relative">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl gradient-hero p-10 sm:p-16 text-primary-foreground shadow-elegant">
            <div className="absolute inset-0 pattern-mudcloth opacity-20 pointer-events-none" />
            <div className="relative max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-foreground/15 backdrop-blur text-xs font-semibold uppercase tracking-widest mb-4">
                <Globe2 className="size-4" /> Global Mission
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Shifting the culture of healthcare.</h2>
              <p className="mt-5 text-lg text-primary-foreground/90 leading-relaxed">
                Across Kenya and the African continent, healthcare has long been reactive — waiting for crisis. Dr. Jacqueline's mission is to change that culture. To move patients, families and entire communities toward proactive, empowered, root-cause health-seeking habits.
              </p>
              <p className="mt-4 text-primary-foreground/80 leading-relaxed">
                It is a worldview built on global public-health rigour and lived African experience: prevention before treatment, education before prescription, dignity before diagnosis.
              </p>
              <div className="mt-8 grid sm:grid-cols-3 gap-4">
                {[
                  { k: "Reactive → Proactive", v: "Crisis care to prevention" },
                  { k: "Symptom → Root", v: "Treat the upstream cause" },
                  { k: "Patient → Partner", v: "Shared decision making" },
                ].map((s) => (
                  <div key={s.k} className="rounded-2xl bg-primary-foreground/10 backdrop-blur p-4 border border-primary-foreground/15">
                    <div className="text-sm font-semibold">{s.k}</div>
                    <div className="text-xs text-primary-foreground/75 mt-1">{s.v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* VALUES */}
      <section className="py-20 gradient-soft">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs uppercase tracking-widest text-accent font-semibold mb-2">Our Values</p>
            <h2 className="text-3xl sm:text-4xl font-bold">What guides our care</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {values.map((v, i) => (
              <div key={v.title} className="glass rounded-2xl p-7 card-lift animate-fade-up border-warm" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="size-12 rounded-xl gradient-warm flex items-center justify-center mb-5 shadow-glow">
                  <v.icon className="size-6 text-primary-foreground" />
                </div>
                <h3 className="font-semibold mb-2">{v.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TEAM */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs uppercase tracking-widest text-accent font-semibold mb-2">Expert Team</p>
            <h2 className="text-3xl sm:text-4xl font-bold">Care delivered by specialists</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {team.map((t, i) => (
              <div key={t.name} className="rounded-2xl overflow-hidden card-lift glass animate-fade-up border-warm" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="aspect-[4/5] overflow-hidden">
                  <img src={t.img} alt={t.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" loading="lazy" />
                </div>
                <div className="p-5 flex items-start gap-3">
                  <Stethoscope className="size-4 text-accent mt-1" />
                  <div>
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-sm text-muted-foreground">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link to="/contact" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold shadow-elegant hover:shadow-glow transition-all">
              Meet our team in person <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
