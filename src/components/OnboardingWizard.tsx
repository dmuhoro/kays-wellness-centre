"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";

export interface OnboardingConfig {
  clinicName: string;
  baseCurrency: string;
  timezone: string;
  whatsappEnabled: boolean;
  whatsappInstanceId: string;
  practitioners: Array<{ name: string; specialty: string; schedule: string }>;
  notificationEmail: string;
}

interface OnboardingWizardProps {
  orgId: string;
  onComplete: (config: OnboardingConfig) => void;
  initialConfig?: Partial<OnboardingConfig>;
}

export const CURRENCIES = [
  { code: "KES", label: "Kenyan Shilling (KES)" },
  { code: "USD", label: "US Dollar (USD)" },
  { code: "GBP", label: "British Pound (GBP)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "UGX", label: "Ugandan Shilling (UGX)" },
  { code: "TZS", label: "Tanzanian Shilling (TZS)" },
  { code: "NGN", label: "Nigerian Naira (NGN)" },
  { code: "ZAR", label: "South African Rand (ZAR)" },
];

export const TIMEZONES = [
  "Africa/Nairobi",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Africa/Kampala",
  "Africa/Dar_es_Salaam",
  "Africa/Cairo",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
];

export const SPECIALTIES = [
  "General Practice",
  "Dermatology",
  "Physiotherapy",
  "Dental",
  "Ophthalmology",
  "ENT",
  "Pediatrics",
  "Obstetrics & Gynecology",
  "Mental Health",
  "Nutrition & Dietetics",
  "Chiropractic",
  "Acupuncture",
];

export const SCHEDULE_PRESETS = [
  "Mon-Fri 8am-5pm",
  "Mon-Sat 8am-5pm",
  "Mon-Fri 9am-6pm",
  "Mon-Fri 7am-7pm",
  "Custom",
];

export const DEFAULT_CONFIG: OnboardingConfig = {
  clinicName: "",
  baseCurrency: "KES",
  timezone: "Africa/Nairobi",
  whatsappEnabled: false,
  whatsappInstanceId: "",
  practitioners: [],
  notificationEmail: "",
};

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
              i < current
                ? "bg-emerald-600 text-white"
                : i === current
                  ? "bg-emerald-100 text-emerald-700 border-2 border-emerald-600"
                  : "bg-gray-100 text-gray-400"
            }`}
          >
            {i < current ? <Check className="w-4 h-4" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div
              className={`w-8 h-0.5 ${i < current ? "bg-emerald-600" : "bg-gray-200"}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function ClinicInfoStep({
  config,
  onChange,
}: {
  config: OnboardingConfig;
  onChange: (updates: Partial<OnboardingConfig>) => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Clinic Information</h3>
      <p className="text-sm text-gray-500">
        Tell us about your clinic to personalize your experience.
      </p>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Clinic Name
        </label>
        <input
          type="text"
          value={config.clinicName}
          onChange={(e) => onChange({ clinicName: e.target.value })}
          placeholder="e.g. Kay's Wellness Centre"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Base Currency
          </label>
          <select
            value={config.baseCurrency}
            onChange={(e) => onChange({ baseCurrency: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Timezone
          </label>
          <select
            value={config.timezone}
            onChange={(e) => onChange({ timezone: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notification Email
        </label>
        <input
          type="email"
          value={config.notificationEmail}
          onChange={(e) => onChange({ notificationEmail: e.target.value })}
          placeholder="admin@clinic.com"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        />
      </div>
    </div>
  );
}

function WhatsAppStep({
  config,
  onChange,
}: {
  config: OnboardingConfig;
  onChange: (updates: Partial<OnboardingConfig>) => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">WhatsApp Integration</h3>
      <p className="text-sm text-gray-500">
        Connect WhatsApp to send appointment reminders and follow-ups automatically.
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange({ whatsappEnabled: !config.whatsappEnabled })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            config.whatsappEnabled ? "bg-emerald-600" : "bg-gray-200"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              config.whatsappEnabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <span className="text-sm font-medium text-gray-700">
          {config.whatsappEnabled ? "WhatsApp Enabled" : "WhatsApp Disabled"}
        </span>
      </div>

      {config.whatsappEnabled && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            WhatsApp Instance ID
          </label>
          <input
            type="text"
            value={config.whatsappInstanceId}
            onChange={(e) => onChange({ whatsappInstanceId: e.target.value })}
            placeholder="e.g. your-evolution-api-instance"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            Enter your Evolution API or Baileys instance identifier.
          </p>
        </div>
      )}
    </div>
  );
}

function PractitionersStep({
  config,
  onChange,
}: {
  config: OnboardingConfig;
  onChange: (updates: Partial<OnboardingConfig>) => void;
}) {
  const addPractitioner = () => {
    onChange({
      practitioners: [
        ...config.practitioners,
        { name: "", specialty: SPECIALTIES[0], schedule: SCHEDULE_PRESETS[0] },
      ],
    });
  };

  const updatePractitioner = (index: number, field: string, value: string) => {
    const updated = config.practitioners.map((p, i) =>
      i === index ? { ...p, [field]: value } : p,
    );
    onChange({ practitioners: updated });
  };

  const removePractitioner = (index: number) => {
    onChange({
      practitioners: config.practitioners.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Practitioner Schedules</h3>
      <p className="text-sm text-gray-500">
        Add your practitioners and their availability to enable online booking.
      </p>

      {config.practitioners.map((practitioner, idx) => (
        <div
          key={idx}
          className="p-3 border border-gray-200 rounded-lg space-y-3 bg-gray-50"
        >
          <div className="flex items-center justify-between">
            <Badge variant="outline">Practitioner {idx + 1}</Badge>
            <button
              onClick={() => removePractitioner(idx)}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Remove
            </button>
          </div>

          <input
            type="text"
            value={practitioner.name}
            onChange={(e) => updatePractitioner(idx, "name", e.target.value)}
            placeholder="Practitioner name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />

          <div className="grid grid-cols-2 gap-3">
            <select
              value={practitioner.specialty}
              onChange={(e) => updatePractitioner(idx, "specialty", e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {SPECIALTIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              value={practitioner.schedule}
              onChange={(e) => updatePractitioner(idx, "schedule", e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {SCHEDULE_PRESETS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addPractitioner}
        className="w-full"
      >
        + Add Practitioner
      </Button>
    </div>
  );
}

function ReviewStep({ config }: { config: OnboardingConfig }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Review & Confirm</h3>
      <p className="text-sm text-gray-500">
        Review your configuration before completing setup.
      </p>

      <div className="space-y-3">
        <div className="flex justify-between py-2 border-b border-gray-100">
          <span className="text-sm text-gray-500">Clinic Name</span>
          <span className="text-sm font-medium text-gray-900">
            {config.clinicName || "Not set"}
          </span>
        </div>
        <div className="flex justify-between py-2 border-b border-gray-100">
          <span className="text-sm text-gray-500">Currency</span>
          <span className="text-sm font-medium text-gray-900">{config.baseCurrency}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-gray-100">
          <span className="text-sm text-gray-500">Timezone</span>
          <span className="text-sm font-medium text-gray-900">{config.timezone}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-gray-100">
          <span className="text-sm text-gray-500">WhatsApp</span>
          <span className="text-sm font-medium text-gray-900">
            {config.whatsappEnabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <div className="flex justify-between py-2 border-b border-gray-100">
          <span className="text-sm text-gray-500">Practitioners</span>
          <span className="text-sm font-medium text-gray-900">
            {config.practitioners.length} added
          </span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-sm text-gray-500">Notification Email</span>
          <span className="text-sm font-medium text-gray-900">
            {config.notificationEmail || "Not set"}
          </span>
        </div>
      </div>

      {config.practitioners.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Practitioner Details</h4>
          {config.practitioners.map((p, i) => (
            <div key={i} className="text-sm text-gray-600 py-1">
              {p.name || "Unnamed"} — {p.specialty} ({p.schedule})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OnboardingWizard({
  orgId,
  onComplete,
  initialConfig,
}: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [config, setConfig] = useState<OnboardingConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const steps = [
    { label: "Clinic Info", component: ClinicInfoStep },
    { label: "WhatsApp", component: WhatsAppStep },
    { label: "Practitioners", component: PractitionersStep },
    { label: "Review", component: ReviewStep },
  ];

  const updateConfig = useCallback((updates: Partial<OnboardingConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const canProceed = () => {
    if (currentStep === 0) return config.clinicName.trim().length > 0;
    return true;
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      onComplete(config);
    } finally {
      setIsSubmitting(false);
    }
  };

  const StepComponent = steps[currentStep].component;

  return (
    <div className="max-w-lg mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Setup Your Clinic</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure your clinic in a few steps to get started.
        </p>
      </div>

      <StepIndicator current={currentStep} total={steps.length} />

      <div className="mb-8">
        <StepComponent config={config} onChange={updateConfig} />
      </div>

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
          disabled={currentStep === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>

        {currentStep < steps.length - 1 ? (
          <Button
            onClick={() => setCurrentStep((s) => s + 1)}
            disabled={!canProceed()}
          >
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleComplete} disabled={isSubmitting || !canProceed()}>
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Complete Setup
          </Button>
        )}
      </div>
    </div>
  );
}
