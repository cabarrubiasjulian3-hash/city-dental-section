// Rule-based auto-reply bot for the Patient Portal → Messages page.
//
// No AI/backend involved: getBotReply() checks the patient's message against
// the rules below (top to bottom, first match wins) and returns a canned
// answer. To change what the bot says, edit the text here — nothing else in
// the app needs to change. To add a new question, push another object onto
// RULES (put more specific ones ABOVE more general ones).
//
// Every message a patient sends is ALSO saved for the doctors to read and
// answer (see pages/patient/Messages.jsx and backend/routes/messages.js) — this
// bot only gives the instant automated reply.
//
// Facts (hours, fees, address, documents) come from the Citizen's Charter in
// lib/citizenCharter.js. The vaccine / form replies follow the clinic's
// Facebook Messenger auto-reply. The general FAQ answers below (services,
// eligibility, appointments, etc.) used to live on their own "Support" page
// in the portal — that page is gone now, so this bot answers those
// questions directly in chat instead.

export const CLINIC_HOURS = "Lunes – Biyernes, 8:00 AM – 5:00 PM";
export const CLINIC_ADDRESS = "Gen. Luna St. cor J.P. Rizal St., Tayabas City";

// Shown as the first bubble at the top of the chat (never saved).
export const WELCOME_MESSAGE =
  "Magandang araw po! Ako ang automated assistant ng City Dental Section.\n\n" +
  "Pumili po ng tanong sa ibaba o i-type ang inyong tanong. " +
  "Ang inyong mga mensahe ay mababasa ng aming mga doctor, at sasagot po sila dito sa chat.";

// The "Tap to send" buttons above the message box.
export const QUICK_REPLIES = [
  "Pwede makahingi ng form?",
  "Maari bang bunutang ang walang vaccine?",
  "Anong oras bukas ang clinic?",
  "Magkano ang bunot?",
  "Saan ang schedule sa barangay ko?",
];

// What the "I-fill up ang form dito" button puts in the message box, so the
// patient just types after each colon and sends it to the doctors.
//
// FORM_FIELDS is the single source of truth for this form: both the
// template text above and the "is this form complete?" check below are
// built from it, so a field only needs to be added/renamed here once.
//   key   = short id used only inside this file
//   label = the exact text before the ":" in the template/message
//   test  = regex that finds "label :" (any spacing/case) inside a message
//           and captures whatever comes after it on that line
const FORM_FIELDS = [
  { key: "type", label: "Bunot o Check up" },
  { key: "name", label: "Name (Full name)" },
  { key: "brgy", label: "Brgy" },
  { key: "age", label: "Age" },
  { key: "contact", label: "Contact no" },
  { key: "lastVaccine", label: 'Kailan ang huling turok ng "Covid" Vaccine (mm/dd/yy)' },
  { key: "vaccineName", label: "Name ng vaccine at pang ilan" },
  { key: "booster", label: "Covid booster" },
].map((f) => ({
  ...f,
  // \s* before the colon is fine (label and ":" are always on the same
  // line), but AFTER the colon only spaces/tabs are skipped — using \s*
  // there would eat the newline and spill into the next field's line,
  // making an empty field look "filled" with the next field's answer.
  test: new RegExp(f.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:[ \\t]*([^\\n\\r]*)", "i"),
}));

const FORM_TEMPLATE = FORM_FIELDS.map((f) => `${f.label} : `).join("\n");

const FORM_REPLY =
  "Hi, thanks for contacting us. We've received your message and appreciate you reaching out.\n" +
  "Paki fill up po lahat ng info na mga sumusunod para mahanapan po kayo ng schedule.\n\n" +
  FORM_FIELDS.map((f) => `${f.label} :`).join("\n") +
  "\n\n" +
  "Automated reply.\n" +
  "(Makikintay lang po ng aming reply para sa inyong schedule, etc.)\n" +
  "Maraming salamat po.";

const VACCINE_REPLY =
  "Magandang araw po,\n\n" +
  'Maari naman pong bunutan ang walang "covid vaccine" kailangan lang po ng RTPCR test/Swab test bago bunutan. ' +
  "Dahil po may pandemic po sa panahon ngayon.\n\n" +
  "Maraming salamat po sa malawak nyong pang unawa.";

// Reads a submitted form against FORM_FIELDS: for each field, whatever the
// patient already typed after its colon (trimmed), or "" if it's missing.
function readFormValues(message) {
  return FORM_FIELDS.map((field) => {
    const match = message.match(field.test);
    return { label: field.label, value: match ? match[1].trim() : "" };
  });
}

// Rebuilds the form text with whatever the patient already answered kept in
// place, and only the still-missing fields left blank — so re-tapping
// "I-fill up ang form dito" lets them fill in just what's left, instead of
// retyping everything from a blank template.
function buildPrefillWithAnswers(message) {
  return readFormValues(message)
    .map((f) => `${f.label} : ${f.value}`)
    .join("\n");
}

// Checks a submitted form against FORM_FIELDS. A field only counts as
// filled up if it has a label AND something typed after the colon on that
// line (e.g. "Age : 25") — "Age :" with nothing after it still counts as
// missing.
function checkFilledForm(message) {
  const missing = readFormValues(message)
    .filter((f) => !f.value)
    .map((f) => f.label);
  return { complete: missing.length === 0, missing };
}

// Each rule: `test` is a regex run against the lower-cased message.
const RULES = [
  // ── A form the patient already filled up and sent ──────────────────────
  // Must stay FIRST: a filled form mentions "Covid vaccine", which would
  // otherwise be caught by the vaccine rule below. Runs on the
  // ORIGINAL-case message (not the lower-cased one getBotReply loops with)
  // so it's matched separately below, inside getBotReply.

  // ── From the Messenger auto-reply ──────────────────────────────────────
  { test: /(vaccine|vaccin|bakuna|covid|booster|rtpcr|rt-pcr|swab)/, reply: { text: VACCINE_REPLY } },
  { test: /(\bform\b|fill.?up|application|request slip)/, reply: { text: FORM_REPLY, prefill: FORM_TEMPLATE } },

  // ── Clinic info ────────────────────────────────────────────────────────
  {
    test: /(barangay|brgy|outreach|mission)/,
    reply: {
      text:
        "Makikita po ninyo sa Barangay Appointments kung anong barangay ang pupuntahan ng aming dental team at kailan.",
      link: { label: "Buksan ang Barangay Schedule", to: "/patient/barangay-schedule" },
    },
  },
  {
    test: /(anong oras|what time|oras|\bopen\b|bukas|hours|operating|schedule)/,
    reply: {
      text:
        `Bukas po ang City Dental Section tuwing ${CLINIC_HOURS}.\n\n` +
        "Para sa schedule ng pagbisita namin sa mga barangay, tingnan po ang Barangay Appointments.",
      link: { label: "Buksan ang Barangay Schedule", to: "/patient/barangay-schedule" },
    },
  },
  {
    test: /(libre|\bfree\b|bayad|magkano|presyo|\bfee|price|cost|singil)/,
    reply: {
      text:
        "Ayon po sa Citizen's Charter:\n" +
        "• Tooth Consultation – Libre\n" +
        "• E-Consultation – Libre\n" +
        "• Tooth Extraction (bunot) – Php 150.00",
    },
  },
  {
    test: /(bunot|pabunot|bunutan|bunutin|extract|hilain|hila)/,
    reply: {
      text:
        "Para po sa pagbunot ng ngipin (Tooth Extraction):\n" +
        "• Bayad: Php 150.00\n" +
        `• Bukas: ${CLINIC_HOURS}\n` +
        "• Magpunta po sa Informaran para kumuha ng number sa pila at mag-fill up ng Request Slip.\n" +
        "• Tinatayang oras ng serbisyo: 20–30 minuto\n\n" +
        'Kung wala pa pong "Covid" vaccine, pindutin po ang tanong na "Maari bang bunutang ang walang vaccine?" sa ibaba.',
    },
  },
  {
    test: /(consult|check.?up|pa.?check)/,
    reply: {
      text:
        "Libre po ang Tooth Consultation at E-Consultation.\n\n" +
        "Ang E-Consultation ay online na konsultasyon sa dentista, kaya hindi na po kailangang pumunta sa clinic.",
    },
  },
  {
    test: /(dala|dalhin|requirement|documents?|dokumento|\bbring\b|\bid\b|kailangan)/,
    reply: {
      text:
        "Ayon po sa Citizen's Charter, ang mga kailangan ay: Dental Form 1, Request Slip, at Official Receipt.\n\n" +
        "Magdala rin po ng valid ID. Kung may appointment kayo, dalhin din po ang confirmation.",
    },
  },
  {
    test: /(saan|where|lokasyon|location|address|nasaan|direksyon)/,
    reply: { text: `Ang City Dental Office ay nasa ${CLINIC_ADDRESS}.` },
  },

  // ── General FAQs (moved here from the old Support page) ────────────────
  {
    test: /(anong serbisyo|what service|services)/,
    reply: {
      text:
        "Nag-aalok po kami ng libreng dental examination, cleaning, extraction, filling, at basic oral health " +
        "consultation.",
    },
  },
  {
    test: /(sino.*(puede|pwede|maaari)|who can avail|eligib)/,
    reply: {
      text: "Kahit sinong residente ng lungsod na may verified address ay maaaring mag-rehistro at umavail ng serbisyo.",
    },
  },
  {
    test: /(appointment|walk.?in|book)/,
    reply: {
      text:
        "Inirerekomenda po ang appointment, pero tumatanggap din po kami ng walk-in depende sa availability — " +
        "pinapauna lang po ang mga may appointment.",
    },
  },
  {
    test: /(dentist.*(araw|every day|available))/,
    reply: { text: "Opo, may kahit isang dentist na naka-duty kada clinic day." },
  },

  // ── Small talk ─────────────────────────────────────────────────────────
  {
    test: /(salamat|thank)/,
    reply: { text: "Walang anuman po! Kung may iba pa po kayong tanong, nandito lang po ako." },
  },
  {
    test: /^(hi|hello|hey|kumusta|musta|good|magandang|maayong)\b/,
    reply: { text: "Magandang araw po! Ano po ang maitutulong ko? Pumili po sa mga tanong sa ibaba o i-type ang inyong tanong." },
  },
];

const FALLBACK_REPLY = {
  text:
    "Naipasa na po ang inyong mensahe sa aming mga doctor. Hintayin po ang kanilang reply dito sa chat.\n\n" +
    "(Automated reply po ito. Kung urgent, magpunta po sa City Dental Office " +
    `tuwing ${CLINIC_HOURS}.)`,
};

// Returns { text, link?, prefill? }
//   link    = { label, to } → button that jumps to another portal page
//   prefill = text → button that puts this text in the message box (used for
//             the form, so the patient can fill it up and send it)
export function getBotReply(input) {
  const original = String(input || "");
  const message = original.toLowerCase().trim();

  // A submitted form is checked against the ORIGINAL message (case as typed)
  // so field values like names/dates aren't mangled by lower-casing. It's
  // only treated as "a form" once it clearly mentions at least 3 of the
  // labels with a colon — anything less is probably just a regular message
  // that happens to contain one of those words.
  const labelHits = FORM_FIELDS.filter((f) => f.test.test(original)).length;
  if (labelHits >= 3) {
    const { complete, missing } = checkFilledForm(original);
    if (complete) {
      return {
        text:
          "Salamat po! Natanggap na po ng aming mga doctor ang inyong form.\n\n" +
          "Hintayin po ang kanilang reply dito sa chat para sa inyong schedule.",
      };
    }
    return {
      text:
        "⚠ Incomplete information po. Paki-fill up po muna ang mga sumusunod bago i-send ulit:\n\n" +
        missing.map((label) => `• ${label}`).join("\n") +
        "\n\nParaan pong makumpleto ang inyong request para mahanapan kayo agad ng schedule.",
      // Keeps whatever the patient already typed, and leaves only the
      // still-missing fields blank — so they just type in the rest instead
      // of starting over from an empty form.
      prefill: buildPrefillWithAnswers(original),
    };
  }

  for (const rule of RULES) {
    if (rule.test.test(message)) return rule.reply;
  }
  return FALLBACK_REPLY;
}