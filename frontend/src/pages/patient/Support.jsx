const faqs = [
  { q: "What services does the City Dental Section provide?", a: "Free dental examinations, cleaning, extractions, fillings, and basic oral health consultations." },
  { q: "Are the dental services free?", a: "Yes, for registered residents through the city's public health program." },
  { q: "Who can avail of the services?", a: "Any resident of the city with a verified address may register and avail of services." },
  { q: "What do I need to bring when visiting the City Dental Section?", a: "A valid ID and your appointment confirmation, if you booked online." },
  { q: "Do I need an appointment before visiting?", a: "It's recommended, though walk-ins are accommodated based on availability." },
  { q: "What time does the City Dental Section operate?", a: "Monday to Friday, 8:00 AM to 5:00 PM." },
  { q: "Is there a dentist available every day?", a: "Yes, at least one dentist is on duty every clinic day." },
  { q: "Do you accept walk-in patients?", a: "Yes, though patients with appointments are prioritized." },
];

export default function PatientSupport() {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold text-forest-950">Support</h2>
      <div className="space-y-3">
        {faqs.map((f) => (
          <details key={f.q} className="bg-cream-50 border border-cream-200 rounded-xl px-5 py-4 group">
            <summary className="cursor-pointer font-semibold text-forest-900 flex items-center justify-between">
              {f.q}
              <span className="text-forest-700 group-open:rotate-45 transition-transform">+</span>
            </summary>
            <p className="text-sm text-forest-700 mt-3 leading-relaxed">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
