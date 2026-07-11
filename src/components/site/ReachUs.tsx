import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Send, Mail, User, ChevronDown, CheckCircle, Loader2, Shield } from "lucide-react";
import { useClinicOSSubmit } from "@/hooks/useClinicOSSubmit";
import { serviceOptions } from "@/data/specialties";
import { reachUsSchema, type ReachUsInput } from "@/lib/schemas/client-validators";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";

export function ReachUs() {
  const { submit, status, reset } = useClinicOSSubmit();

  const form = useForm<ReachUsInput>({
    resolver: zodResolver(reachUsSchema),
    defaultValues: { name: "", email: "", service: "" },
    mode: "onBlur",
  });

  const handleSubmit = async (data: ReachUsInput) => {
    await submit(data);
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
            form.reset();
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
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <div className="relative">
                  <User className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    {...field}
                    id="reach-name"
                    type="text"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-background focus:border-primary outline-none transition-colors"
                    placeholder="Your full name"
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Secure Email</FormLabel>
              <FormControl>
                <div className="relative">
                  <Mail className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    {...field}
                    id="reach-email"
                    type="email"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-background focus:border-primary outline-none transition-colors"
                    placeholder="you@example.com"
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="service"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Premium Service</FormLabel>
              <FormControl>
                <div className="relative">
                  <select
                    {...field}
                    id="reach-service"
                    className="w-full appearance-none px-4 py-3 rounded-xl border border-border bg-background focus:border-primary outline-none transition-colors"
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
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
    </Form>
  );
}
