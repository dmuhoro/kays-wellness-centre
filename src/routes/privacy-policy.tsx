import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, ArrowLeft, Lock, Server, UserCheck } from "lucide-react";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Kay's Wellness Centre" },
      {
        name: "description",
        content:
          "How Kay's Wellness Centre collects, encrypts, and protects your personal health information in strict confidence.",
      },
      { property: "og:title", content: "Privacy Policy — Kay's Wellness Centre" },
      {
        property: "og:description",
        content: "Your data is encrypted, sanitized, and transferred in strict confidence.",
      },
    ],
  }),
  component: PrivacyPolicy,
});

const sections = [
  {
    icon: Lock,
    title: "Data Collection & Encryption",
    body: "When you submit an inquiry or booking request through our website, we collect your full name, email address, service preference, and optional contact channel. All data is transmitted using end-to-end TLS 1.3 encryption in transit. Before storage, every input field is programmatically sanitized — stripping HTML tags, control characters, and XSS vectors — ensuring no raw or executable content ever reaches our systems.",
  },
  {
    icon: Server,
    title: "Data Storage & Transmission",
    body: "Submitted data is structured into a secure ClinicOS lead packet and transmitted via HTTPS POST to our clinical intake endpoint. If a transmission failure occurs, the encrypted payload is cached locally in your browser's storage under a non-identifiable key and automatically retried when connectivity is restored. No raw personal data persists in client-side storage beyond the retry window.",
  },
  {
    icon: UserCheck,
    title: "Clinical Confidentiality",
    body: "All patient inquiry data is accessible exclusively to Kay's Wellness Centre clinical operations staff for the sole purpose of scheduling, intake preparation, and care coordination. Data is never shared with third parties, sold, or used for marketing purposes. We treat every submission with the same ethical and legal confidence standards as an in-person clinical consultation.",
  },
  {
    icon: ShieldCheck,
    title: "Your Rights & Contact",
    body: "You may request access to, correction of, or deletion of your personal data at any time by contacting our data protection officer at ceo@kayswellnesscentre.org. We will respond within 14 calendar days. This policy may be updated periodically; material changes will be posted here with a revised effective date.",
  },
];

function PrivacyPolicy() {
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
            Privacy <span className="text-gradient">Policy</span>
          </h1>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            Last updated: July 2026. Kay's Wellness Centre is committed to protecting the privacy
            and confidentiality of every patient and visitor. This policy explains how we collect,
            process, store, and protect your personal data when you use our website and services.
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
            <h2 className="font-semibold mb-2">Questions about your data?</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Reach our data protection officer directly:
            </p>
            <div className="text-sm space-y-1">
              <p>
                <strong>Email:</strong>{" "}
                <a href="mailto:ceo@kayswellnesscentre.org" className="text-accent hover:underline">
                  ceo@kayswellnesscentre.org
                </a>
              </p>
              <p>
                <strong>Phone:</strong>{" "}
                <a href="tel:+254726295529" className="text-accent hover:underline">
                  +254 726 295 529
                </a>
              </p>
              <p>
                <strong>Address:</strong> Rubis Gikambura, Along Dagoretti Road, 1st Floor Room 9,
                Kenya.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
