import { useState } from "react";
import { Phone, Mail, Send, Lock } from "lucide-react";
import { toast } from "sonner";

export function AskQuestion() {
  const [channel, setChannel] = useState<"phone" | "email">("email");
  const [q, setQ] = useState("");
  const [contact, setContact] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Your question has been received in confidence", {
      description: `Dr. Jacqueline Mwanu's clinical team will reply privately by ${channel} within 1 business day.`,
    });
    setQ("");
    setContact("");
  };

  return (
    <div className="glass rounded-3xl p-6 sm:p-8 shadow-elegant border-warm">
      <p className="text-xs uppercase tracking-widest text-accent font-semibold">
        Ask a Question · Confidential
      </p>
      <h3 className="text-2xl font-bold mt-1 mb-2">A private answer from our medical team</h3>
      <p className="text-sm text-muted-foreground mb-5">
        Patient-doctor trust is the foundation of every healing relationship we build. Your message
        is handled with full discretion.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <textarea
          required
          value={q}
          onChange={(e) => setQ(e.target.value)}
          rows={3}
          placeholder="Share your health concern in your own words..."
          className="w-full px-4 py-3 rounded-xl border border-border bg-background/80 focus:border-accent outline-none resize-none"
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm font-medium">Reply privately by:</div>
          <div className="flex gap-2 p-1 rounded-xl bg-secondary">
            <button
              type="button"
              onClick={() => setChannel("phone")}
              className={`px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 transition-all ${channel === "phone" ? "bg-background shadow-card text-primary" : "text-muted-foreground"}`}
            >
              <Phone className="size-4" /> Phone
            </button>
            <button
              type="button"
              onClick={() => setChannel("email")}
              className={`px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 transition-all ${channel === "email" ? "bg-background shadow-card text-primary" : "text-muted-foreground"}`}
            >
              <Mail className="size-4" /> Email
            </button>
          </div>
        </div>
        <input
          required
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={channel === "phone" ? "Your phone number" : "Your email"}
          className="w-full px-4 py-3 rounded-xl border border-border bg-background/80 focus:border-accent outline-none"
        />
        <button
          type="submit"
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold hover:shadow-glow transition-all"
        >
          <Send className="size-4" /> Send in Confidence
        </button>
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
          <Lock className="size-3.5 text-accent" />
          <span>End-to-end private · reviewed only by clinical staff</span>
        </div>
      </form>
    </div>
  );
}
