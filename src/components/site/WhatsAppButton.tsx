import { MessageCircle } from "lucide-react";

export function WhatsAppButton() {
  return (
    <a
      href="https://wa.me/254726295529"
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-6 right-6 z-40 group"
      aria-label="Chat on WhatsApp"
    >
      <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
      <span className="relative flex items-center gap-2 px-4 py-3 rounded-full bg-[#25D366] text-white shadow-elegant hover:scale-105 transition-transform">
        <MessageCircle className="size-5" fill="white" />
        <span className="hidden sm:inline text-sm font-semibold">Chat with us</span>
      </span>
    </a>
  );
}
