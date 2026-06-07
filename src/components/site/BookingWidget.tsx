import { useState } from "react";
import { Check, ArrowRight, ArrowLeft, Stethoscope, Video, Home, Clock, User, CalendarCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const services = [
  "Hormone & Endocrine Consultation",
  "Digestive Health Assessment",
  "Lifestyle Medicine Program",
  "Autoimmune Root-Cause Workup",
  "Functional Lab Testing",
  "Physiotherapy & Osteopathy",
];

const channels = [
  { id: "in-person", label: "In-Person", desc: "Visit our Gikambura clinic", icon: Stethoscope },
  { id: "telehealth", label: "Telehealth", desc: "Secure video consultation", icon: Video },
  { id: "home", label: "Home Visit", desc: "Care in the comfort of home", icon: Home },
];

export function BookingWidget() {
  const [step, setStep] = useState(1);
  const [service, setService] = useState("");
  const [channel, setChannel] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Booking request received", { description: "Our team will reach out within 24 hours." });
    setStep(1); setService(""); setChannel(""); setName(""); setPhone("");
  };

  return (
    <div className="glass rounded-3xl p-6 sm:p-8 shadow-elegant max-w-2xl mx-auto border-warm">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-accent font-semibold">Book in 3 Steps · Confidential</p>
          <h3 className="text-2xl font-bold mt-1">1-Hour Foundational Consultation</h3>
          <p className="text-sm text-muted-foreground mt-1">A full 60 minutes to gather comprehensive medical history, lifestyle context and diagnostic data — the foundation of root-cause care.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground rounded-full bg-secondary px-3 py-1.5 border-warm">
          <Clock className="size-4" /> 60 min
        </div>
      </div>
      <div className="flex items-start gap-2 text-xs text-muted-foreground mb-6 rounded-xl bg-secondary/60 p-3 border-warm">
        <ShieldCheck className="size-4 text-accent shrink-0 mt-0.5" />
        <span>Your information is held in strict medical confidence. Patient–doctor trust is the foundation of every healing relationship we build.</span>
      </div>

      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${step >= s ? "bg-primary" : "bg-border"}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="animate-fade-up">
          <label className="text-sm font-semibold mb-3 block">Select a service</label>
          <div className="grid sm:grid-cols-2 gap-2">
            {services.map((s) => (
              <button
                key={s}
                onClick={() => setService(s)}
                className={`text-left p-4 rounded-xl border transition-all ${service === s ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">{s}</span>
                  {service === s && <Check className="size-4 text-primary shrink-0 mt-0.5" />}
                </div>
              </button>
            ))}
          </div>
          <button
            disabled={!service}
            onClick={() => setStep(2)}
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
            <button onClick={() => setStep(1)} className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl glass font-semibold hover:bg-secondary">
              <ArrowLeft className="size-4" /> Back
            </button>
            <button disabled={!channel} onClick={() => setStep(3)} className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold disabled:opacity-40 hover:shadow-glow transition-all">
              Continue <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <form onSubmit={submit} className="animate-fade-up space-y-4">
          <div>
            <label className="text-sm font-semibold mb-2 block">Your name</label>
            <div className="relative">
              <User className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-border bg-background focus:border-primary outline-none transition-colors" placeholder="Full name" />
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold mb-2 block">Phone or email</label>
            <input required value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-4 py-3.5 rounded-xl border border-border bg-background focus:border-primary outline-none" placeholder="+254 ..." />
          </div>
          <div className="rounded-xl bg-secondary/60 p-4 text-sm">
            <div className="font-semibold text-foreground mb-1">Summary</div>
            <div className="text-muted-foreground">{service} • {channels.find(c => c.id === channel)?.label}</div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(2)} className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl glass font-semibold hover:bg-secondary">
              <ArrowLeft className="size-4" /> Back
            </button>
            <button type="submit" className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold hover:shadow-glow transition-all">
              <CalendarCheck className="size-4" /> Request Booking
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
