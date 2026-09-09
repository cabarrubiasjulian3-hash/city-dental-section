import { useEffect, useState } from "react";
import { CITIZEN_CHARTER_SERVICES } from "../lib/citizenCharter";

/* ---------- Icons (inline SVG, no external icon package needed) ---------- */

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function WrenchIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2-2 2.5-2.5Z" />
    </svg>
  );
}

function PinIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function ShieldIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M12 3 4 6v6c0 4.5 3.2 7.9 8 9 4.8-1.1 8-4.5 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function ClipboardIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 11h6M9 15h6M9 7h6" />
    </svg>
  );
}

function DocumentIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M7 3h7l4 4v14H7Z" />
      <path d="M14 3v4h4" />
      <path d="M9.5 13h5M9.5 16.5h5" />
    </svg>
  );
}

function ReceiptIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

function CalendarIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function CheckCircleIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

const DOC_ICONS = {
  "Dental Form 1": ClipboardIcon,
  "Request Slip": DocumentIcon,
  "Official Receipt": ReceiptIcon,
};

/* ---------------------------- Layout pieces ---------------------------- */

function InfoCard({ icon: Icon, title, children }) {
  return (
    <div className="bg-[#c8f0b8] rounded-2xl p-5 shadow-[0_18px_35px_-8px_rgba(45,90,39,0.45)] flex flex-col items-center text-center h-full">
      <div className="w-14 h-14 rounded-full bg-forest-800 text-cream-50 flex items-center justify-center mb-3 shrink-0">
        <Icon className="w-6 h-6" />
      </div>
      <h4 className="font-display font-bold text-forest-950 text-sm tracking-wide mb-2">{title}</h4>
      <p className="text-sm text-forest-900 leading-relaxed">{children}</p>
    </div>
  );
}

function ChecklistColumn({ heading, children }) {
  return (
    <div>
      <h4 className="font-display font-bold text-forest-950 text-sm tracking-wide text-center mb-3">{heading}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ChecklistRow({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 justify-center text-center">
      <span className="w-6 h-6 rounded-full bg-[#a8e492] text-forest-900 flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
      </span>
      <span className="text-sm text-forest-800">{children}</span>
    </div>
  );
}

function ServicePanel({ service }) {
  const [activeStep, setActiveStep] = useState(0);
  const step = service.steps[activeStep];

  // Reset to the first step whenever a different service is selected.
  useEffect(() => {
    setActiveStep(0);
  }, [service]);

  return (
    <div className="bg-cream-50 border border-cream-200 rounded-b-3xl rounded-tr-3xl p-6 md:p-8">
      {/* About / Venue / Client */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <InfoCard icon={WrenchIcon} title="ABOUT THE SERVICE">
          {service.aboutService}
        </InfoCard>
        <InfoCard icon={PinIcon} title="VENUE">
          {service.venue}
        </InfoCard>
        <InfoCard icon={ShieldIcon} title="CLIENT">
          {service.client}
        </InfoCard>
      </div>

      {/* Documents / Availability / Fees */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <ChecklistColumn heading="DOCUMENTS NEEDED">
          {service.documentsNeeded.map((doc) => (
            <ChecklistRow key={doc} icon={DOC_ICONS[doc] || ClipboardIcon}>
              {doc}
            </ChecklistRow>
          ))}
        </ChecklistColumn>

        <ChecklistColumn heading="AVAILABILITY">
          <ChecklistRow icon={CalendarIcon}>{service.availability}</ChecklistRow>
        </ChecklistColumn>

        <div>
          <h4 className="font-display font-bold text-forest-950 text-sm tracking-wide text-center mb-3">FEES</h4>
          <div className="space-y-2">
            {service.fees === "Free" ? (
              <ChecklistRow icon={CheckCircleIcon}>Free</ChecklistRow>
            ) : (
              service.fees.map((fee) => (
                <ChecklistRow key={fee.label} icon={CheckCircleIcon}>
                  {fee.label} — {fee.amount}
                </ChecklistRow>
              ))
            )}
          </div>
          <p className="text-xs text-forest-700 text-center mt-3 font-medium">
            Processing Time: {service.processingTime}
          </p>
        </div>
      </div>

      {/* Step-by-step procedures */}
      <div>
        <h4 className="font-display font-bold text-forest-950 text-sm tracking-wide mb-4">STEP-BY-STEP PROCEDURES</h4>
        <div className="flex flex-wrap gap-3 mb-5">
          {service.steps.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveStep(i)}
              aria-pressed={activeStep === i}
              className={`w-11 h-11 rounded-full font-display font-bold flex items-center justify-center transition-colors ${
                activeStep === i
                  ? "bg-forest-800 text-cream-50"
                  : "bg-forest-800/40 text-cream-50/80 hover:bg-forest-800/60"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <div className="bg-[#c8f0b8] rounded-2xl p-6 shadow-[0_18px_35px_-8px_rgba(45,90,39,0.45)]">
          <p className="font-display font-bold text-forest-950 mb-3">{step.title}</p>
          <ul className="space-y-1.5 list-disc list-inside text-sm text-forest-900">
            {step.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-forest-900 mt-3">
            <p>
              <span className="font-semibold">Time:</span> {step.time}
            </p>
            <p>
              <span className="font-semibold">Responsible:</span> {step.responsible}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CitizenCharterSection() {
  const services = CITIZEN_CHARTER_SERVICES;
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <section className="max-w-6xl mx-auto px-6 pb-20">
      <div className="text-center mb-8">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-forest-950">Our Services</h2>
        <p className="text-forest-700 mt-2">Citizen's Charter — what to expect for each dental service</p>
      </div>

      <div className="flex flex-wrap overflow-x-auto no-scrollbar">
        {services.map((service, i) => (
          <button
            key={service.title}
            type="button"
            onClick={() => setActiveIndex(i)}
            className={`shrink-0 px-6 py-4 font-display font-semibold text-sm md:text-base rounded-t-2xl mr-1 transition-colors ${
              activeIndex === i
                ? "bg-forest-800 text-cream-50 relative z-10"
                : "bg-forest-950/90 text-cream-50/70 hover:text-cream-50"
            }`}
          >
            {service.title}
          </button>
        ))}
      </div>

      <ServicePanel service={services[activeIndex]} />
    </section>
  );
}