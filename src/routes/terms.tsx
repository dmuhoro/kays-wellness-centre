import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileText, Scale, AlertTriangle, Gavel } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Kay's Wellness Centre" },
      {
        name: "description",
        content:
          "Terms and conditions governing the use of Kay's Wellness Centre website and booking services.",
      },
      { property: "og:title", content: "Terms of Service — Kay's Wellness Centre" },
      {
        property: "og:description",
        content: "Terms governing website use and clinical booking services.",
      },
    ],
  }),
  component: Terms,
});

const sections = [
  {
    icon: FileText,
    title: "Service Description",
    body: "Kay's Wellness Centre provides premium functional and integrative medicine consultation services through our Gikambura clinic, telehealth platform, and home visit programme. The information on this website is for general educational and informational purposes only and does not constitute a physician–patient relationship until a formal consultation has been booked and confirmed.",
  },
  {
    icon: Scale,
    title: "Booking & Cancellation",
    body: "Appointment requests submitted through our website are reviewed by our clinical coordination team. A confirmed appointment is established only after you receive written confirmation via email or phone. Cancellations must be communicated at least 24 hours before the scheduled appointment time. Late cancellations may be subject to a fee at the physician's discretion.",
  },
  {
    icon: AlertTriangle,
    title: "Medical Disclaimer",
    body: "The content on this website, including service descriptions, protocols, and educational materials, is provided for informational purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or another qualified health provider with any questions you may have regarding a medical condition. Never disregard professional medical advice or delay in seeking it because of something you have read on this website.",
  },
  {
    icon: Gavel,
    title: "Limitation of Liability",
    body: "To the fullest extent permitted by applicable law, Kay's Wellness Centre, its physicians, staff, and affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of this website or our services. This website is provided 'as is' without warranty of any kind, either express or implied.",
  },
];

function Terms() {
  return (
    <>
      <section className="py-20 sm:py-28 relative">
        <div className="absolute inset-0 pattern-kente opacity-20 pointer-events-none" />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-8 transition-colors"
          >
            <ArrowLeft className="size-4" /> Back to home
          </Link>
          <p className="text-xs uppercase tracking-widest text-accent font-semibold mb-3">Legal</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Terms of <span className="text-gradient">Service</span>
          </h1>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            Last updated: July 2026. By accessing or using the Kay's Wellness Centre website, you
            agree to be bound by these terms. If you do not agree with any part of these terms, you
            should not use our website or services.
          </p>

          <div className="mt-14 space-y-10">
            {sections.map((s) => (
              <div key={s.title} className="animate-fade-up">
                <div className="flex items-start gap-4">
                  <div className="size-10 rounded-xl gradient-warm flex items-center justify-center shrink-0 shadow-glow mt-1">
                    <s.icon className="size-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold mb-3">{s.title}</h2>
                    <p className="text-muted-foreground leading-relaxed">{s.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 rounded-2xl glass border-warm p-6 sm:p-8">
            <h2 className="font-semibold mb-2">Governing Law</h2>
            <p className="text-sm text-muted-foreground">
              These terms are governed by and construed in accordance with the laws of the Republic
              of Kenya. Any disputes arising from these terms shall be subject to the exclusive
              jurisdiction of the courts of Kenya.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
