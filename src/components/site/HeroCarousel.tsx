import { useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";

// Slide configuration for the Hero Carousel
const bgImages = [
  "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1920&q=80",
  "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1920&q=80",
];

const slides = [
  {
    tag: "Root-Cause Medicine",
    title: "Moving from Firefighting Illness to Striving for True Wellness.",
    desc: "Evidence-based, root-cause healing designed specifically for chronic, metabolic, and digestive conditions.",
    bg: 0,
  },
  {
    tag: "Whole-Person Care",
    title: "A whole-person, whole-system assessment.",
    desc: "We combine rigorous conventional medicine with clinical nutrition, gut-lining repair, therapeutic coaching, and functional diagnostics.",
    bg: 1,
  },
  {
    tag: "Shifting the Culture",
    title: "Reimagining healthcare across Africa.",
    desc: "Led by Dr. Jacqueline Mwanu, MD, MBChB, MPH, IHDiP — a Public Health Physician & Functional/Integrative Medicine Specialist moving our communities toward proactive, empowered health.",
    bg: 0,
  },
];

export function HeroCarousel() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % slides.length), 6500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative">
      {slides.map((s, idx) => (
        <div
          key={idx}
          className={`absolute inset-0 -z-10 rounded-3xl transition-all duration-700 ${i === idx ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          style={{
            backgroundImage: `linear-gradient(rgba(30,53,47,0.7), rgba(30,53,47,0.85)), url(${bgImages[s.bg]})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      ))}
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-foreground/15 backdrop-blur mb-6 border border-white/20">
        <Sparkles className="size-4 text-accent" />
        <span className="text-xs font-semibold tracking-wide text-white uppercase">{slides[i].tag}</span>
      </div>
      <div className="relative min-h-[230px] sm:min-h-[260px]">
        {slides.map((s, idx) => (
          <div
            key={idx}
            className={`absolute inset-0 transition-all duration-700 ${i === idx ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}
          >
            <h1 className="text-4xl sm:text-5xl lg:text-[3.6rem] font-bold leading-[1.05] tracking-tight text-white">
              {s.title}
            </h1>
            <p className="mt-5 text-lg text-white/80 max-w-xl leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link to="/contact" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold shadow-elegant hover:shadow-glow transition-all hover:scale-[1.02]">
          Book a Consultation <ArrowRight className="size-4" />
        </Link>
        <Link to="/our-story" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl glass font-semibold text-white hover:bg-white/20 transition-colors">
          Meet Dr. Jacqueline Mwanu
        </Link>
      </div>

      <div className="mt-8 flex gap-2">
        {slides.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setI(idx)}
            className={`h-1.5 rounded-full transition-all ${i === idx ? "w-10 bg-accent" : "w-6 bg-border"}`}
            aria-label={`Slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
