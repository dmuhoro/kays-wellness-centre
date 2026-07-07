import { useState } from "react";
import {
  Wind,
  Sunrise,
  Activity,
  Droplet,
  Moon,
  Apple,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const tips = [
  {
    icon: Wind,
    title: "4-7-8 Breathing",
    desc: "Inhale 4s, hold 7s, exhale 8s. Calms the nervous system in under a minute.",
    color: "from-teal-500/20 to-emerald-500/10",
  },
  {
    icon: Sunrise,
    title: "Morning Serenity",
    desc: "10 minutes of sunlight within an hour of waking resets your circadian rhythm.",
    color: "from-amber-400/20 to-orange-300/10",
  },
  {
    icon: Activity,
    title: "150-min Activity",
    desc: "Aim for 150 minutes of moderate movement weekly — split it however works.",
    color: "from-emerald-500/20 to-green-400/10",
  },
  {
    icon: Droplet,
    title: "Hydration First",
    desc: "Start with 500ml of water before coffee. Rehydrate after a night of fasting.",
    color: "from-sky-400/20 to-blue-300/10",
  },
  {
    icon: Moon,
    title: "Sleep Window",
    desc: "Lights low after sunset, screens off 60 minutes before bed for deeper sleep.",
    color: "from-indigo-500/20 to-purple-400/10",
  },
  {
    icon: Apple,
    title: "Eat the Rainbow",
    desc: "Five plant colors a day diversifies your gut microbiome and antioxidants.",
    color: "from-rose-400/20 to-pink-300/10",
  },
];

export function WellnessTips() {
  const [start, setStart] = useState(0);
  const visible = 3;
  const max = tips.length - visible;
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">
              Daily Wellness
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold">Small habits, lasting change</h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStart(Math.max(0, start - 1))}
              disabled={start === 0}
              className="size-11 rounded-xl glass flex items-center justify-center disabled:opacity-40 hover:bg-secondary"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={() => setStart(Math.min(max, start + 1))}
              disabled={start === max}
              className="size-11 rounded-xl glass flex items-center justify-center disabled:opacity-40 hover:bg-secondary"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>

        <div className="overflow-hidden">
          <div
            className="flex gap-6 transition-transform duration-500"
            style={{
              transform: `translateX(calc(-${start} * (100% / 3) - ${start} * 1.5rem / 3))`,
            }}
          >
            {tips.map((t, i) => (
              <div
                key={i}
                className="shrink-0 w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] card-lift"
              >
                <div
                  className={`h-full rounded-2xl p-7 bg-gradient-to-br ${t.color} border border-border/60 backdrop-blur`}
                >
                  <div className="size-12 rounded-xl bg-background flex items-center justify-center shadow-card mb-5">
                    <t.icon className="size-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{t.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
