import { useState } from "react";
import {
  Check,
  ArrowRight,
  ArrowLeft,
  Stethoscope,
  Video,
  Home,
  Clock,
  User,
  CalendarCheck,
  ShieldCheck,
  Loader2,
  Mail,
  Languages,
} from "lucide-react";
import { useClinicOSSubmit } from "@/hooks/useClinicOSSubmit";

const services = [
  { id: "bhrh", label: "Hormone & Endocrine Consultation" },
  { id: "digestive", label: "Digestive Health Assessment" },
  { id: "lifestyle", label: "Lifestyle Medicine Program" },
  { id: "autoimmune", label: "Autoimmune Root-Cause Workup" },
  { id: "lab-testing", label: "Functional Lab Testing" },
  { id: "physio", label: "Physiotherapy & Osteopathy" },
];

const channels = [
  { id: "in-person", label: "In-Person", desc: "Visit our Gikambura clinic", icon: Stethoscope },
  { id: "telehealth", label: "Telehealth", desc: "Secure video consultation", icon: Video },
  { id: "home", label: "Home Visit", desc: "Care in the comfort of home", icon: Home },
];

export function BookingWidget() {
  const { submit, status, reset } = useClinicOSSubmit();
  const [step, setStep] = useState(1);
  const [service, setService] = useState("");
  const [channel, setChannel] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState<"en" | "sw">("en");

  const selectedService = services.find((s) => s.id === service);
  const selectedChannel = channels.find((c) => c.id === channel);

  const advance = () => setStep((s) => Math.min(s + 1, 4));
  const retreat = () => setStep((s) => Math.max(s - 1, 1));

  const submitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await submit({
      name,
      email,
      service,
      channel,
      preferred_language: language,
    });
    if (result === "success") {
      setStep(4);
    }
  };

  if (status === "success" && step === 4) {
    return (
      <div className="glass rounded-3xl p-6 sm:p-8 shadow-elegant max-w-2xl mx-auto border-warm">
        <div className="size-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-5">
          <Check className="size-8 text-emerald-600" />
        </div>
        <h3 className="text-2xl font-bold text-center mb-2">
          Clinical validation vector initiated
        </h3>
        <p className="text-muted-foreground text-center mb-6 max-w-md mx-auto">
          Our private coordinator will reach out in confidence to confirm your appointment and
          prepare your intake documentation.
        </p>
        <div className="rounded-2xl bg-secondary/60 p-4 mb-6 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Service</span>
            <span className="font-semibold">{selectedService?.label}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Channel</span>
            <span className="font-semibold">{selectedChannel?.label}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-semibold">{name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Contact</span>
            <span className="font-semibold">{email}</span>
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 text-xs text-accent font-semibold bg-accent/5 rounded-full px-3 py-1.5 border border-accent/20 mx-auto w-fit mb-4">
          <ShieldCheck className="size-3" /> End-to-end encrypted · Confidential
        </div>
        <button
          onClick={() => {
            setStep(1);
            setService("");
            setChannel("");
            setName("");
            setEmail("");
            reset();
          }}
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold hover:shadow-glow transition-all"
        >
          Book another appointment
        </button>
      </div>
    );
  }

  return (
    <div className="glass rounded-3xl p-6 sm:p-8 shadow-elegant max-w-2xl mx-auto border-warm">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-accent font-semibold">
            Book in 3 Steps · Confidential
          </p>
          <h3 className="text-2xl font-bold mt-1">1-Hour Foundational Consultation</h3>
          <p className="text-sm text-muted-foreground mt-1">
            A full 60 minutes to gather comprehensive medical history, lifestyle context and
            diagnostic data — the foundation of root-cause care.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground rounded-full bg-secondary px-3 py-1.5 border-warm">
          <Clock className="size-4" /> 60 min
        </div>
      </div>
      <div className="flex items-start gap-2 text-xs text-muted-foreground mb-6 rounded-xl bg-secondary/60 p-3 border-warm">
        <ShieldCheck className="size-4 text-accent shrink-0 mt-0.5" />
        <span>
          Your information is held in strict medical confidence. Patient–doctor trust is the
          foundation of every healing relationship we build.
        </span>
      </div>

      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-all ${step >= s ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="animate-fade-up">
          <label className="text-sm font-semibold mb-3 block">Select a service</label>
          <div className="grid sm:grid-cols-2 gap-2">
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => setService(s.id)}
                className={`text-left p-4 rounded-xl border transition-all ${service === s.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">{s.label}</span>
                  {service === s.id && <Check className="size-4 text-primary shrink-0 mt-0.5" />}
                </div>
              </button>
            ))}
          </div>
          <button
            disabled={!service}
            onClick={advance}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-glow transition-all"
          >
            Continue <ArrowRight className="size-4" />
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="animate-fade-up">
          <label className="text-sm font-semibold mb-3 block">Choose a channel</label>
          <div className="grid sm:grid-cols-3 gap-3">
            {channels.map((c) => (
              <button
                key={c.id}
                onClick={() => setChannel(c.id)}
                className={`p-5 rounded-xl border text-left transition-all ${channel === c.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <c.icon className="size-6 text-primary mb-3" />
                <div className="font-semibold text-sm">{c.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{c.desc}</div>
              </button>
            ))}
          </div>
          <div className="mt-6 flex gap-2">
            <button
              onClick={retreat}
              className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl glass font-semibold hover:bg-secondary"
            >
              <ArrowLeft className="size-4" /> Back
            </button>
            <button
              disabled={!channel}
              onClick={advance}
              className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold disabled:opacity-40 hover:shadow-glow transition-all"
            >
              Continue <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <form onSubmit={submitBooking} className="animate-fade-up space-y-4">
          <div>
            <label className="text-sm font-semibold mb-2 block">Your name</label>
            <div className="relative">
              <User className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-border bg-background focus:border-primary outline-none transition-colors"
                placeholder="Full name"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold mb-2 block">Email</label>
            <div className="relative">
              <Mail className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-border bg-background focus:border-primary outline-none"
                placeholder="you@example.com"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold mb-2 block">Preferred language</label>
            <div className="relative flex gap-2">
              <button
                type="button"
                onClick={() => setLanguage("en")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                  language === "en" ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40"
                }`}
              >
                <Languages className="size-4" /> English
              </button>
              <button
                type="button"
                onClick={() => setLanguage("sw")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                  language === "sw" ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40"
                }`}
              >
                <Languages className="size-4" /> Kiswahili
              </button>
            </div>
          </div>
          <div className="rounded-xl bg-secondary/60 p-4 text-sm">
            <div className="font-semibold text-foreground mb-1">Summary</div>
            <div className="text-muted-foreground">
              {selectedService?.label} · {selectedChannel?.label}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={retreat}
              className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl glass font-semibold hover:bg-secondary"
            >
              <ArrowLeft className="size-4" /> Back
            </button>
            <button
              type="submit"
              disabled={status === "submitting"}
              className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold disabled:opacity-50 hover:shadow-glow transition-all"
            >
              {status === "submitting" ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Submitting...
                </>
              ) : (
                <>
                  <CalendarCheck className="size-4" /> Request Booking
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
