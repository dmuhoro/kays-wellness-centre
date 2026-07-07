import { Link } from "@tanstack/react-router";
import {
  Leaf,
  MapPin,
  Phone,
  Mail,
  Instagram,
  Facebook,
  Twitter,
  Shield,
  FileText,
  Scale,
} from "lucide-react";
import { specialties } from "@/data/specialties";
import { ReachUs } from "./ReachUs";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border bg-gradient-to-b from-background to-secondary/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid gap-12 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="size-10 rounded-xl gradient-hero flex items-center justify-center">
                <Leaf className="size-5 text-primary-foreground" />
              </div>
              <div>
                <div className="font-display font-bold">Kay's Wellness</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Centre
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Led by Dr. Jacqueline Mwanu, MD, MBChB, MPH, IHDiP — a Public Health Physician &
              Functional/Integrative Medicine Specialist shifting the culture of healthcare across
              Africa through root-cause, whole-person medicine.
            </p>
            <div className="flex gap-2 mt-5">
              {[Instagram, Facebook, Twitter].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="size-9 rounded-lg glass flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  <Icon className="size-4" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Explore</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/our-story" className="hover:text-primary">
                  Our Story
                </Link>
              </li>
              <li>
                <Link to="/services" className="hover:text-primary">
                  Services
                </Link>
              </li>
              <li>
                <Link to="/resources" className="hover:text-primary">
                  Resources
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-primary">
                  Book a Visit
                </Link>
              </li>
            </ul>
            <h4 className="font-semibold mb-3 mt-6">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link
                  to="/privacy-policy"
                  className="inline-flex items-center gap-1.5 hover:text-primary transition-colors"
                >
                  <FileText className="size-3" /> Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  to="/terms"
                  className="inline-flex items-center gap-1.5 hover:text-primary transition-colors"
                >
                  <Scale className="size-3" /> Terms of Service
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Specialties</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {specialties.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <Link
                    to="/services"
                    className="hover:text-primary transition-colors inline-flex items-center gap-1.5"
                  >
                    <Shield className="size-3 text-accent shrink-0" />
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Reach Us</h4>
            <ul className="space-y-3 text-sm text-muted-foreground mb-5">
              <li className="flex gap-2">
                <MapPin className="size-4 mt-0.5 text-primary shrink-0" />
                <span>Rubis Gikambura, Along Dagoretti Road, 1st Floor Room 9, Kenya.</span>
              </li>
              <li className="flex gap-2">
                <Phone className="size-4 mt-0.5 text-primary shrink-0" />
                <a href="tel:+254726295529">+254 726 295 529</a>
              </li>
              <li className="flex gap-2">
                <Mail className="size-4 mt-0.5 text-primary shrink-0" />
                <a href="mailto:ceo@kayswellnesscentre.org">ceo@kayswellnesscentre.org</a>
              </li>
            </ul>
            <ReachUs />
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-border flex flex-col sm:flex-row gap-2 justify-between text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Kay's Wellness Centre. All rights reserved.</p>
          <p>Built with care for your wellbeing.</p>
        </div>
      </div>
    </footer>
  );
}
