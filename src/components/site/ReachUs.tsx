import { useState } from "react";
import { Send, Mail, User, ChevronDown, CheckCircle, Loader2, Shield } from "lucide-react";
import { useClinicOSSubmit } from "@/hooks/useClinicOSSubmit";
import { serviceOptions } from "@/data/specialties";

type FormErrors = Partial<Record<"name" | "email" | "service", string>>;

function validate(data: { name: string; email: string; service: string }): FormErrors {
  const errors: FormErrors = {};
  if (!data.name?.trim()) errors.name = "Full name is required";
  if (!data.email?.trim()) errors.email = "Email address is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    errors.email = "Enter a valid email address";
  if (!data.service) errors.service = "Please select a service";
  return errors;
}

export function ReachUs() {
  const { submit, status, reset } = useClinicOSSubmit();
  const [formData, setFormData] = useState({ name: "", email: "", service: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const handleChange = (field: string, value: string) => {
    const next = { ...formData, [field]: value };
    setFormData(next);
    if (touched.has(field)) {
      const fieldErrors = validate(next);
      setErrors((prev) => ({ ...prev, [field]: fieldErrors[field as keyof FormErrors] }));
    }
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => new Set(prev).add(field));
    const fieldErrors = validate(formData);
    setErrors((prev) => ({ ...prev, [field]: fieldErrors[field as keyof FormErrors] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrors = validate(formData);
    setErrors(fieldErrors);
    setTouched(new Set(["name", "email", "service"]));
    if (Object.keys(fieldErrors).length > 0) return;
    await submit(formData);
  };

  if (status === "success") {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-400/5 border border-emerald-500/20 p-6 text-center animate-fade-in">
        <div className="size-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="size-7 text-emerald-600" />
        </div>
        <h4 className="font-semibold text-foreground mb-1">Clinical validation vector initiated</h4>
        <p className="text-sm text-muted-foreground mb-3">
          Our private coordinator will reach out in confidence.
        </p>
        <div className="inline-flex items-center gap-1.5 text-xs text-accent font-semibold bg-accent/5 rounded-full px-3 py-1.5 border border-accent/20">
          <Shield className="size-3" /> End-to-end encrypted
        </div>
        <button
          onClick={() => {
            setFormData({ name: "", email: "", service: "" });
            setErrors({});
            setTouched(new Set());
            reset();
          }}
          className="mt-4 text-sm font-semibold text-accent hover:text-accent/80 transition-colors"
        >
          Send another inquiry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label className="text-sm font-semibold mb-2 block" htmlFor="reach-name">
          Full Name
        </label>
        <div className="relative">
          <User className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            id="reach-name"
            type="text"
            value={formData.name}
            onChange={(e) => handleChange("name", e.target.value)}
            onBlur={() => handleBlur("name")}
            className={`w-full pl-11 pr-4 py-3 rounded-xl border bg-background focus:outline-none transition-colors ${
              errors.name && touched.has("name")
                ? "border-red-400 focus:border-red-500"
                : "border-border focus:border-primary"
            }`}
            placeholder="Your full name"
          />
        </div>
        {errors.name && touched.has("name") && (
          <p className="text-xs text-red-500 mt-1.5 ml-1">{errors.name}</p>
        )}
      </div>

      <div>
        <label className="text-sm font-semibold mb-2 block" htmlFor="reach-email">
          Secure Email
        </label>
        <div className="relative">
          <Mail className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            id="reach-email"
            type="email"
            value={formData.email}
            onChange={(e) => handleChange("email", e.target.value)}
            onBlur={() => handleBlur("email")}
            className={`w-full pl-11 pr-4 py-3 rounded-xl border bg-background focus:outline-none transition-colors ${
              errors.email && touched.has("email")
                ? "border-red-400 focus:border-red-500"
                : "border-border focus:border-primary"
            }`}
            placeholder="you@example.com"
          />
        </div>
        {errors.email && touched.has("email") && (
          <p className="text-xs text-red-500 mt-1.5 ml-1">{errors.email}</p>
        )}
      </div>

      <div>
        <label className="text-sm font-semibold mb-2 block" htmlFor="reach-service">
          Premium Service
        </label>
        <div className="relative">
          <select
            id="reach-service"
            value={formData.service}
            onChange={(e) => handleChange("service", e.target.value)}
            onBlur={() => handleBlur("service")}
            className={`w-full appearance-none px-4 py-3 rounded-xl border bg-background focus:outline-none transition-colors ${
              errors.service && touched.has("service")
                ? "border-red-400 focus:border-red-500"
                : "border-border focus:border-primary"
            }`}
          >
            <option value="">Select a service...</option>
            {serviceOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="size-4 absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
        {errors.service && touched.has("service") && (
          <p className="text-xs text-red-500 mt-1.5 ml-1">{errors.service}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-glow transition-all"
      >
        {status === "submitting" ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Sending in confidence...
          </>
        ) : (
          <>
            <Send className="size-4" /> Send in Confidence
          </>
        )}
      </button>
    </form>
  );
}
