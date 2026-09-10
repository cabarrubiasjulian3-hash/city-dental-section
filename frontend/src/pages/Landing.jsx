import { useState } from "react";
import { Link } from "react-router-dom";
import LoginModal from "../components/LoginModal";
import ForgotPasswordModal from "../components/ForgotPasswordModal";
import AdminLoginModal from "../components/AdminLoginModal";
import SignupModal from "../components/SignupModal";
import CitizenCharterSection from "../components/CitizenCharterSection";
import ServicesOfferedSection from "../components/ServicesOfferedSection";
import NewsEventsSection from "../components/NewsEventsSection";
const SLIDES = [
  {
    image: "/city-hall-bg.jpg",
    seal: "/city-health-seal.png",
    heading: "Welcome to City Dental Section",
    kind: "welcome",
  },
  {
    image: "/carousel-1.jpg",
    heading: "Smile brighter with City Dental Care",
    body: "Get access to free and affordable dental services provided by the government through your local City Dental Office. Sign up today to book appointments, track treatments, and take charge of your oral health!",
    kind: "pitch",
  },
  {
    image: "/carousel-2.jpg",
    heading: "Smile brighter with City Dental Care",
    body: "Get access to free and affordable dental services provided by the government through your local City Dental Office. Sign up today to book appointments, track treatments, and take charge of your oral health!",
    kind: "pitch",
  },
  {
    image: "/carousel-3.jpg",
    heading: "Smile brighter with City Dental Care",
    body: "Get access to free and affordable dental services provided by the government through your local City Dental Office. Sign up today to book appointments, track treatments, and take charge of your oral health!",
    kind: "pitch",
  },
  {
    image: "/carousel-4.jpg",
    heading: "Smile brighter with City Dental Care",
    body: "Get access to free and affordable dental services provided by the government through your local City Dental Office. Sign up today to book appointments, track treatments, and take charge of your oral health!",
    kind: "pitch",
  },
  {
    image: "/carousel-5.jpg",
    heading: "Smile brighter with City Dental Care",
    body: "Get access to free and affordable dental services provided by the government through your local City Dental Office. Sign up today to book appointments, track treatments, and take charge of your oral health!",
    kind: "pitch",
  },
  
];

const faqs = [
  {
    q: "What services does the City Dental Section provide?",
    a: "Free dental examinations, cleaning, extractions, fillings, and basic oral health consultations for residents.",
  },
  {
    q: "Are the dental services free?",
    a: "Yes. Services are provided free of charge to registered residents through the city government's public health program.",
  },
  {
    q: "Do I need an appointment before visiting?",
    a: "We recommend booking an appointment online so we can prepare your records and reduce your waiting time.",
  },
  {
    q: "What time does the City Dental Section operate?",
    a: "Monday to Friday, 8:00 AM to 5:00 PM, excluding public holidays.",
  },
];

export default function Landing() {
  const [slide, setSlide] = useState(0);
  const [loginOpen, setLoginOpen] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
    
  function next() {
    setSlide((s) => (s + 1) % SLIDES.length);
  }
  function prev() {
    setSlide((s) => (s - 1 + SLIDES.length) % SLIDES.length);
  }

  return (
    <div className="min-h-screen bg-cream-100">
      {/* Top bar */}
     <header className="bg-[linear-gradient(to_right,_#395d2e_0%,_#395d2e_45%,_#ececc3_100%)] border-t border-[#181f14] text-cream-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-1 py-5">
          <div className="flex items-center gap-3">
           <div className="w-14 h-14 rounded-full bg-cream-50/10 flex items-center justify-center overflow-hidden">
              <img src="/logo.png" alt="City Dental Section logo" className="w-full h-full object-cover" />
            </div>
            <div className="w-14 h-14 rounded-full bg-cream-50/10 flex items-center justify-center overflow-hidden">
              <img src="/city-hall-seal.png" alt="Tayabas City Hall seal" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="font-display font-bold leading-tight">City Dental Section</p>
              <p className="text-xs text-cream-100/80">City of Tayabas, Quezon Province</p>
            </div>
          </div>
          <nav className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAdminLoginOpen(true)}
              className="text-sm font-bold bg-white text-ink-900 border border-forest-800 rounded-full px-5 py-2 shadow-[3px_3px_4px_0_rgba(61,83,53,0.6)] hover:bg-[#859336] hover:border-transparent hover:text-cream-50 transition-colors"
            >
              Admin Portal
            </button>
            <button
              type="button"
              onClick={() => setSignupOpen(true)}
              className="text-sm font-bold bg-white text-ink-900 border border-forest-800 rounded-full px-5 py-2 shadow-[3px_3px_4px_0_rgba(61,83,53,0.6)] hover:bg-[#859336] hover:border-transparent hover:text-cream-50 transition-colors"
            >
              Sign up
            </button>
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="text-sm font-bold bg-white text-ink-900 border border-forest-800 rounded-full px-5 py-2 shadow-[3px_3px_4px_0_rgba(61,83,53,0.6)] hover:bg-[#859336] hover:border-transparent hover:text-cream-50 transition-colors"
            >
              Log in
            </button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      {/* Unified hero carousel — City Hall welcome slide first, then the
          pitch slides. Click the arrows (or the dots) to move between them. */}
      <section className="relative h-[26rem] md:h-[32rem] overflow-hidden">
        {SLIDES.map((s, i) => (
          <div
            key={s.image}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === slide ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <img src={s.image} alt="" className="absolute inset-0 w-full h-full object-cover" />

            {s.kind === "welcome" ? (
              <>
                <div className="absolute inset-0 bg-cream-50/70" />
                <div className="relative h-full flex flex-col items-center justify-center text-center px-6">
                <h1 className="font-heading text-2xl md:text-4xl font-bold text-forest-950 uppercase tracking-wide">
                    {s.heading}
                  </h1>
                  <img
                    src={s.seal}
                    alt="City Health Office Tayabas seal"
                    className="w-32 h-32 md:w-40 md:h-40 object-contain mt-4 drop-shadow-lg"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="absolute inset-0 bg-gradient-to-r from-cream-50 via-cream-50/60 to-transparent" />
                <div className="relative max-w-6xl mx-auto h-full flex items-center px-6">
                  <div className="max-w-md">
                    <h2 className="font-display text-4xl md:text-5xl font-bold text-forest-950 leading-tight">
                      {s.heading}
                    </h2>
                    <p className="mt-5 text-forest-800 text-lg leading-relaxed">{s.body}</p>
                    <div className="mt-8 flex gap-3">
                      <Link
                        to="/signup"
                        className="bg-forest-900 text-cream-50 font-semibold rounded-full px-6 py-3 hover:bg-forest-800 transition-colors"
                      >
                        Get started
                      </Link>
                      <Link
                        to="/login"
                        className="bg-cream-200 text-forest-900 font-semibold rounded-full px-6 py-3 hover:bg-cream-50 transition-colors"
                      >
                        I already have an account
                      </Link>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}

        {/* Left / right arrows — this is the clickable navigation you asked for */}
        <button
          onClick={prev}
          aria-label="Previous slide"
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-cream-50/90 hover:bg-cream-50 text-forest-900 flex items-center justify-center shadow-lg z-10"
        >
          ‹
        </button>
        <button
          onClick={next}
          aria-label="Next slide"
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-cream-50/90 hover:bg-cream-50 text-forest-900 flex items-center justify-center shadow-lg z-10"
        >
          ›
        </button>

        {/* Dot indicators */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              aria-label={`Slide ${i + 1}`}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                i === slide ? "bg-forest-900" : "bg-cream-50/80 border border-forest-900/30"
              }`}
            />
          ))}
        </div>

      </section>
  
      {/* Feature cards — image version */}
      <section className="bg-[#e8e9bf] py-16">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-3 gap-10">
          {[
            {
              image: "/feature-about.jpg",
              label: "About us",
              title: "Public service with a personal touch.",
              body: "We're your local City Dental Office, offering accessible dental care through government programs. Our mission: to make quality oral health services available to every resident.",
            },
            {
              image: "/feature-features.jpg",
              label: "Features",
              title: "Everything you need for a healthier smile.",
              body: "From tooth extractions to dentures, enjoy a full range of government-supported dental services. Easy booking, treatment tracking, and clinic updates — all at your fingertips.",
            },
            {
              image: "/feature-faq.jpg",
              label: "FAQ's",
              title: "Got questions? We've got answers.",
              body: "Learn how to book appointments, what services are covered, and who qualifies for free or subsidized dental care. Your dental journey starts with clarity.",
            },
          ].map((c) => (
            <div key={c.label} className="text-center">
              <div className="relative rounded-3xl overflow-hidden aspect-[4/3] shadow-lg">
                <img src={c.image} alt={c.label} className="w-full h-full object-cover" />
                <span className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#859336] text-white text-sm font-semibold rounded-full px-6 py-2 shadow-md">
                  {c.label}
                </span>
              </div>
              <h3 className="font-display font-bold text-ink-900 mt-5 mb-2">{c.title}</h3>
              <p className="text-sm text-forest-800 leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Citizen's Charter — service information */}
      <CitizenCharterSection />
      
      {/* Services Offered carousel */}
      <ServicesOfferedSection />

      {/* News and Events */}
      <NewsEventsSection />

      {/* FAQ */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="font-display text-2xl font-bold text-forest-950 mb-6">Frequently asked questions</h2>
        <div className="space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="bg-cream-50 border border-cream-200 rounded-xl px-5 py-4 group">
              <summary className="cursor-pointer font-medium text-forest-900 flex items-center justify-between">
                {f.q}
                <span className="text-forest-700 group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="text-sm text-forest-700 mt-3 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="bg-forest-950 text-cream-100/70 text-sm text-center py-6">
        © {new Date().getFullYear()} City Dental Section — City of Tayabas, Quezon Province
      </footer>

      <LoginModal
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onForgotPassword={() => {
          setLoginOpen(false);
          setForgotOpen(true);
        }}
        onSwitchToSignup={() => {
          setLoginOpen(false);
          setSignupOpen(true);
        }}
      />
      <ForgotPasswordModal isOpen={forgotOpen} onClose={() => setForgotOpen(false)} />
      <AdminLoginModal isOpen={adminLoginOpen} onClose={() => setAdminLoginOpen(false)} />
      <SignupModal
        isOpen={signupOpen}
        onClose={() => setSignupOpen(false)}
        onSwitchToLogin={() => {
          setSignupOpen(false);
          setLoginOpen(true);
        }}
      />
    </div>
  );
}