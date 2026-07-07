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
    tag: "Executive-Grade Medicine",
    title: "Precision healthcare for the high-performance life.",
    desc: "Bespoke functional medicine protocols engineered for corporate leaders, executives, and professionals who demand the same rigour from their health as they do from their careers.",
    bg: 0,
  },
  {
    tag: "Total Biological Optimisation",
    title: "Your biology, decoded. Your vitality, restored.",
    desc: "Advanced diagnostics, IV nutritional therapy, BHRT, and metabolic re-tuning — delivered under one premium clinical roof. Every protocol is custom-tailored, never off-the-shelf.",
    bg: 1,
  },
  {
    tag: "The Kay's Standard",
    title: "Where medical science meets African luxury.",
    desc: "Led by Dr. Jacqueline Mwanu, MD, MBChB, MPH, IHDiP — bringing world-class functional medicine to Kenya's elite. Precision, discretion, and bespoke care for those who accept nothing less.",
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
