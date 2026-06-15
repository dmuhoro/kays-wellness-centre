import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { WhatsAppButton } from "@/components/site/WhatsAppButton";
import { SonnerToaster } from "@/components/ui/sonner-toaster";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-gradient">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-xl gradient-hero px-5 py-3 text-sm font-semibold text-primary-foreground shadow-elegant">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Try again or head home.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="rounded-xl gradient-hero px-5 py-3 text-sm font-semibold text-primary-foreground">Try again</button>
          <a href="/" className="rounded-xl glass px-5 py-3 text-sm font-semibold">Go home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Dr. Jacqueline Mwanu, MD | Kay's Wellness Centre | Functional Medicine" },
      { name: "description", content: "Moving from Firefighting Illness to Striving for True Wellness. Evidence-based, root-cause healing by Dr. Jacqueline Mwanu, MD, MBChB, MPH, IHDiP." },
      { property: "og:title", content: "Dr. Jacqueline Mwanu, MD | Kay's Wellness Centre" },
      { property: "og:description", content: "Moving from Firefighting Illness to Striving for True Wellness. Evidence-based, root-cause healing by Dr. Jacqueline Mwanu, MD, MBChB, MPH, IHDiP." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Dr. Jacqueline Mwanu, MD | Kay's Wellness Centre" },
      { name: "twitter:description", content: "Moving from Firefighting Illness to Striving for True Wellness. Evidence-based, root-cause healing by Dr. Jacqueline Mwanu, MD, MBChB, MPH, IHDiP." },
      { property: "og:image", content: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1200&q=80" },
      { name: "twitter:image", content: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1200&q=80" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 pt-20">
          <Outlet />
        </main>
        <Footer />
        <WhatsAppButton />
        <SonnerToaster />
      </div>
    </QueryClientProvider>
  );
}
