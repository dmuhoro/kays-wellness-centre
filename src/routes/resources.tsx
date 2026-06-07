import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Clock, ChevronDown } from "lucide-react";
const wellness1 = "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=800&q=80";
const wellness2 = "https://images.unsplash.com/photo-1609220136736-443140cffec6?auto=format&fit=crop&w=800&q=80";
const wellness3 = "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80";

export const Route = createFileRoute("/resources")({
  head: () => ({
    meta: [
      { title: "Resources & Articles — Kay's Wellness Centre" },
      { name: "description", content: "Wellness education, health articles and answers to common questions about functional medicine." },
      { property: "og:title", content: "Resources & Articles" },
      { property: "og:description", content: "Wellness education and FAQs from our medical team." },
    ],
  }),
  component: Resources,
});

const articles = [
  { img: wellness1, tag: "Gut Health", title: "The hidden link between H. Pylori and chronic fatigue", read: "6 min read", date: "May 12, 2026" },
  { img: wellness2, tag: "Functional Testing", title: "What modern labs reveal that standard panels miss", read: "8 min read", date: "May 4, 2026" },
  { img: wellness3, tag: "Lifestyle", title: "Why 150 minutes of weekly movement reverses metabolic risk", read: "5 min read", date: "Apr 22, 2026" },
  { img: wellness1, tag: "Hormones", title: "Understanding PCOS through a functional lens", read: "7 min read", date: "Apr 14, 2026" },
  { img: wellness2, tag: "Autoimmune", title: "Hashimoto's: a root-cause framework", read: "9 min read", date: "Apr 02, 2026" },
  { img: wellness3, tag: "Mind & Body", title: "Breath, vagus nerve and chronic inflammation", read: "4 min read", date: "Mar 28, 2026" },
];

const faqs = [
  { q: "What is functional medicine?", a: "Functional medicine is a systems-biology approach that focuses on identifying and addressing the root cause of disease, rather than just managing symptoms." },
  { q: "Do I need a referral to book a consultation?", a: "No. You can book a 1-hour in-depth consultation directly through our website, by phone, or via WhatsApp." },
  { q: "Do you accept insurance?", a: "We accept select insurance plans and offer transparent self-pay pricing. Reach out and our team will guide you." },
  { q: "How long is a typical consultation?", a: "Initial consultations are 60 minutes to allow a comprehensive review of your history, lifestyle and goals." },
  { q: "Do you offer telehealth or home visits?", a: "Yes. We offer in-person, secure telehealth and home-visit options across Nairobi and surrounds." },
];

function Resources() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <>
      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-3">Resources & Articles</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight max-w-3xl mx-auto">Learn from our <span className="text-gradient">medical team</span></h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">Practical, science-backed guides on living well and treating chronic conditions at the source.</p>
        </div>
      </section>

      <section className="pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((a, i) => (
              <article key={i} className="rounded-2xl overflow-hidden card-lift glass animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="aspect-[16/10] overflow-hidden">
                  <img src={a.img} alt={a.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" loading="lazy" />
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-secondary text-primary font-semibold">{a.tag}</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="size-3" /> {a.read}</span>
                  </div>
                  <h3 className="text-lg font-semibold leading-snug mb-2">{a.title}</h3>
                  <div className="text-xs text-muted-foreground">{a.date}</div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 gradient-soft">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">FAQs</p>
            <h2 className="text-3xl sm:text-4xl font-bold">Frequently asked questions</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((f, i) => (
              <div key={i} className="glass rounded-2xl overflow-hidden">
                <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between gap-4 p-5 text-left">
                  <span className="font-semibold">{f.q}</span>
                  <ChevronDown className={`size-5 text-primary transition-transform shrink-0 ${open === i ? "rotate-180" : ""}`} />
                </button>
                {open === i && (
                  <div className="px-5 pb-5 text-muted-foreground animate-fade-in">{f.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
