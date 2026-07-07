import {
  Heart,
  FlaskConical,
  Shield,
  Leaf,
  Microscope,
  Activity,
  Brain,
  Droplets,
  Stethoscope,
  Pill,
  TestTube,
  HandHeart,
} from "lucide-react";

export type Specialty = {
  id: string;
  title: string;
  tagline: string;
  description: string;
  protocol: string;
  icon: typeof Heart;
  gradient: string;
  features: string[];
  cta: "inquire" | "protocol";
};

export const specialties: Specialty[] = [
  {
    id: "bhrh",
    title: "Bioidentical Hormone Restoration (BHRT)",
    tagline: "Endocrine equilibrium, precisely engineered",
    description:
      "Precision-compounded bioidentical hormones meticulously tailored to restore endocrine equilibrium. Designed for executives and professionals experiencing adrenal fatigue, perimenopausal imbalance, and andropause — delivered under rigorous functional diagnostic protocol.",
    protocol:
      "Phase 1: Comprehensive hormone panel & salivary cortisol mapping. Phase 2: Targeted bioidentical compound selection & pellet insertion. Phase 3: 4-week biomarker re-evaluation with dose titration. Phase 4: Maintenance optimization every 90 days.",
    icon: Heart,
    gradient: "from-rose-500/20 to-pink-400/10",
    features: [
      "Salivary cortisol mapping",
      "Bioidentical pellet therapy",
      "Thyroid axis integration",
      "Adrenal recovery protocol",
    ],
    cta: "protocol",
  },
  {
    id: "iv-nutrition",
    title: "Intravenous Nutritional Therapy",
    tagline: "Cellular replenishment at therapeutic doses",
    description:
      "Therapeutic-grade intravenous nutrient formulations administered in-clinic for rapid cellular replenishment, deep detoxification, and immune system fortification. Each drip is bespoke-compounded to your biomarker profile.",
    protocol:
      "Initial loading: 3 sessions over 10 days (Myers' Cocktail + Glutathione push). Maintenance: bi-weekly targeted drips based on quarterly biomarker panels. Annual deep detox protocol available.",
    icon: FlaskConical,
    gradient: "from-emerald-500/20 to-teal-400/10",
    features: [
      "Myers' Cocktail base",
      "Glutathione push",
      "High-dose vitamin C",
      "Chelation therapy available",
    ],
    cta: "inquire",
  },
  {
    id: "metabolic",
    title: "Metabolic Optimization",
    tagline: "Beyond weight loss — metabolic reconfiguration",
    description:
      "Physician-supervised metabolic reconfiguration integrating body composition analysis, gut microbiome assessment, and DNA-informed nutrition strategies. Sustainable, science-driven — never generic.",
    protocol:
      "Week 1-2: Deep metabolic panel + continuous glucose monitoring. Week 3-8: Personalised nutrition & exercise intervention. Month 3: Body composition DEXA re-scan. Ongoing: quarterly metabolic tune-ups.",
    icon: Activity,
    gradient: "from-amber-400/20 to-orange-300/10",
    features: [
      "Continuous glucose monitoring",
      "DEXA body composition",
      "Gut microbiome mapping",
      "DNA-informed nutrition",
    ],
    cta: "protocol",
  },
  {
    id: "chronic-disease",
    title: "Chronic Disease Management",
    tagline: "Cellular health optimisation for measurable reversal",
    description:
      "Advanced cellular health optimisation for hypertension, type 2 diabetes, and metabolic syndrome — combining mitochondrial support, inflammation quenching, and precision nutraceutical intervention for measurable reversal.",
    protocol:
      "Baseline: Advanced cardiac/metabolic biomarker panel + inflammation mapping. Intervention: Targeted nutraceutical + lifestyle protocol. Review: 6-week biomarker re-test. Maintenance: Quarterly monitoring with medication titration.",
    icon: Shield,
    gradient: "from-sky-400/20 to-blue-300/10",
    features: [
      "Mitochondrial support therapy",
      "Inflammation quenching protocol",
      "Precision nutraceutical intervention",
      "Medication titration support",
    ],
    cta: "inquire",
  },
  {
    id: "longevity",
    title: "Longevity Medicine",
    tagline: "Biological age reversal through precision intervention",
    description:
      "Comprehensive biological age assessment using epigenetic clocks, telomere length analysis, and advanced biomarker panels. Personalised longevity protocols blending nutraceutical, hormonal, and lifestyle interventions to extend healthspan.",
    protocol:
      "Assessment: Epigenetic clock + telomere analysis + advanced biomarker panel. Intervention: Personalised supplement stack + hormone optimisation + peptide therapy. Review: Semi-annual biological age re-assessment.",
    icon: Brain,
    gradient: "from-indigo-500/20 to-purple-400/10",
    features: [
      "Epigenetic clock analysis",
      "Telomere length assessment",
      "Peptide therapy protocols",
      "Healthspan extension planning",
    ],
    cta: "protocol",
  },
  {
    id: "autoimmune",
    title: "Autoimmune Root-Cause Care",
    tagline: "Identify triggers. Calm the cascade. Restore tolerance.",
    description:
      "Rigorous functional diagnostics to identify environmental, dietary, and infectious triggers driving autoimmune activity. Multi-layered protocol combining gut healing, immune modulation, and targeted supplementation.",
    protocol:
      "Phase 1: Comprehensive antibody panel + food sensitivity mapping. Phase 2: Elimination protocol + gut repair. Phase 3: Immune modulation + trigger reintroduction. Phase 4: Long-term tolerance maintenance.",
    icon: Microscope,
    gradient: "from-teal-500/20 to-emerald-400/10",
    features: [
      "Autoimmune antibody mapping",
      "Food sensitivity elimination",
      "Gut-lining repair protocol",
      "Immune tolerance restoration",
    ],
    cta: "inquire",
  },
  {
    id: "screening",
    title: "Advanced Biometric Screening",
    tagline: "Know your biology at molecular resolution",
    description:
      "Comprehensive biometric screening suite combining advanced imaging, functional lab testing, and genetic analysis. Designed for high-performing individuals who demand complete biological transparency before symptoms arise.",
    protocol:
      "Core panel: Complete blood count, metabolic panel, thyroid panel, lipid panel. Advanced: Organic acids, amino acids, fatty acids, micronutrients. Imaging: DEXA scan, carotid IMT, body composition. Genetics: MTHFR, APOE, detox pathways.",
    icon: TestTube,
    gradient: "from-violet-500/20 to-fuchsia-400/10",
    features: [
      "Complete metabolic & hormonal panel",
      "Organic acid & amino acid analysis",
      "DEXA & carotid IMT imaging",
      "Genetic pathway screening",
    ],
    cta: "protocol",
  },
  {
    id: "weight-management",
    title: "Functional Weight Management",
    tagline: "Metabolic reconfiguration, not calorie restriction",
    description:
      "Physician-supervised metabolic reconfiguration integrating body composition analysis, gut microbiome assessment, and DNA-informed nutrition strategies. Sustainable, science-driven transformation.",
    protocol:
      "Week 1: Metabolic panel + resting metabolic rate. Week 2-8: Structured nutrition + movement protocol. Month 3: Body composition re-scan. Ongoing: Monthly coaching + quarterly re-assessment.",
    icon: Leaf,
    gradient: "from-green-500/20 to-emerald-400/10",
    features: [
      "Resting metabolic rate testing",
      "Gut microbiome analysis",
      "DNA-informed nutrition strategy",
      "Monthly coaching sessions",
    ],
    cta: "inquire",
  },
];

export const serviceOptions = specialties.map((s) => ({
  value: s.id,
  label: s.title,
}));
