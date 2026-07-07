import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin, Phone, Mail, Clock, Send } from "lucide-react";
import { toast } from "sonner";
import { BookingWidget } from "@/components/site/BookingWidget";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Reach Out — Kay's Wellness Centre" },
      {
        name: "description",
        content:
          "Visit, call or message us. Book a consultation at our Gikambura clinic or request home care.",
      },
      { property: "og:title", content: "Reach Out — Kay's Wellness Centre" },
      { property: "og:description", content: "Contact our holistic medical team in Kenya." },
    ],
  }),
  component: Contact,
});

function Contact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Message sent", { description: "We'll get back to you shortly." });
    setForm({ name: "", email: "", message: "" });
  };

  return (
    <>
      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-3">
            Reach Out
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Let's start your <span className="text-gradient">wellness journey</span>
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
            Visit us in Gikambura, book online, or send a message — we're here to help.
          </p>
        </div>
      </section>

      <section className="pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-5 mb-12">
            {[
              {
                icon: MapPin,
                label: "Visit Us",
                value: "Rubis Gikambura, Along Dagoretti Road, 1st Floor Room 9, Kenya.",
              },
              {
                icon: Phone,
                label: "Call Us",
                value: "+254 726 295 529",
                href: "tel:+254726295529",
              },
              {
                icon: Mail,
                label: "Email Us",
                value: "ceo@kayswellnesscentre.org",
                href: "mailto:ceo@kayswellnesscentre.org",
              },
            ].map((c) => (
              <div key={c.label} className="glass rounded-2xl p-7 card-lift">
                <div className="size-12 rounded-xl gradient-hero flex items-center justify-center mb-4">
                  <c.icon className="size-6 text-primary-foreground" />
                </div>
                <div className="text-xs uppercase tracking-widest text-primary font-semibold mb-1">
                  {c.label}
                </div>
                {c.href ? (
                  <a href={c.href} className="font-medium hover:text-primary">
                    {c.value}
                  </a>
                ) : (
                  <div className="font-medium leading-relaxed">{c.value}</div>
                )}
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            <div>
              <BookingWidget />
            </div>

            <div className="space-y-6">
              <form onSubmit={submit} className="glass rounded-3xl p-6 sm:p-8 shadow-elegant">
                <h3 className="text-2xl font-bold mb-1">Send us a message</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  We typically respond within one business day.
                </p>
                <div className="space-y-4">
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Your name"
                    className="w-full px-4 py-3.5 rounded-xl border border-border bg-background focus:border-primary outline-none"
                  />
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="Email address"
                    className="w-full px-4 py-3.5 rounded-xl border border-border bg-background focus:border-primary outline-none"
                  />
                  <textarea
                    required
                    rows={5}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="How can we help?"
                    className="w-full px-4 py-3.5 rounded-xl border border-border bg-background focus:border-primary outline-none resize-none"
                  />
                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold hover:shadow-glow transition-all"
                  >
                    <Send className="size-4" /> Send Message
                  </button>
                </div>
              </form>

              <div className="glass rounded-3xl overflow-hidden shadow-elegant">
                <div className="aspect-video relative bg-secondary">
                  <iframe
                    title="Clinic location"
                    src="https://www.openstreetmap.org/export/embed.html?bbox=36.6500%2C-1.2500%2C36.7000%2C-1.2000&layer=mapnik"
                    className="absolute inset-0 w-full h-full"
                    loading="lazy"
                  />
                </div>
                <div className="p-5 flex items-center gap-3 text-sm">
                  <Clock className="size-5 text-primary" />
                  <div>
                    <div className="font-semibold">Mon — Sat: 8:00 AM — 6:00 PM</div>
                    <div className="text-muted-foreground">Sunday: By appointment</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
