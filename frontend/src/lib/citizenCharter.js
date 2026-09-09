// Citizen's Charter content for each frontline dental service.
// Sourced from the City Dental Section's official Citizen's Charter.
// To add another service, just push another object onto this array —
// the landing page section renders whatever is here automatically.

export const CITIZEN_CHARTER_SERVICES = [
  {
    title: "Dental Examination",
    aboutService:
      "Ang Serbisyong Dental ay may layuning itaas ang kamalayan at mapabuti ang kalalagayang pang-dental, at upang mapababa ang kaso ng pagkasira ng ngipin at sakit sa bibig sa Lungsod ng Tayabas.",
    venue: "The City Dental Office of Tayabas is situated at Gen. Luna St. cor J.P. Rizal St. Tayabas City.",
    client:
      "Batang may edad na anim na taon pababa, nagdadalaga/nagbibinata na may edad 10 hanggang 24 taong gulang, mga buntis, nagpapaayos, may edad 60 taong gulang pataas, at mga may espesyal na pangangailangan (Persons with Special Needs) at iba pang indibidwal na nangangailangan ng serbisyong dental.",
    documentsNeeded: ["Dental Form 1", "Request Slip", "Official Receipt"],
    availability: "Lunes – Biyernes, 8:00 AM – 5:00 PM",
    fees: [
      { label: "Tooth Extraction", amount: "Php 150.00" },
      { label: "Tooth Consultation", amount: "Free" },
      { label: "E-Consultation", amount: "Free" },
    ],
    processingTime: "20-30 minutes",
    steps: [
      {
        title: "Magpunta sa Informaran para makakuha ng number sa pila at mag fill up ng Request Slip.",
        bullets: [
          "CHO Employee: Magbigay ng number, i-fill up ang request slip at tawagin ang pasyente ayon sa pagkakasunud-sunod",
        ],
        time: "3 mins",
        responsible: "Dental Aide",
      },
      {
        title: "Magpa-interview para sa medical history at dental history, magpa-kuha ng vital signs.",
        bullets: [
          "CHO Employee: Mag-interview sa pasyente at sagutan ang medical at dental history, at kunin ang vital signs",
        ],
        time: "5–10 mins",
        responsible: "Dental Aide",
      },
      {
        title: "Magbayad ng Fees sa Treasurer's Office at humingi ng kaukulang resibo.",
        bullets: ["CHO Employee: Kunin ang bayad sa Dental service at ibigay ang resibo"],
        time: "5–10 mins",
        responsible: "Dental Aide",
      },
      {
        title: "Pumunta sa dental room para sa:",
        bullets: [
          "Tooth extraction",
          "Tooth Consultation",
          "E-Consultation",
          "CHO Employee: Isagawa ang kaukulang serbisyo sa pasyente",
        ],
        time: "20-30 mins",
        responsible: "Dentist",
      },
    ],
  },
  {
    title: "Toothbrushing Drill",
    aboutService: "Ang serbisyong dental ay may layuning turuan magsipilyo ang mga batang may edad na 6–71 na buwan.",
    venue: "The City Dental Office of Tayabas is situated at Gen. Luna St. cor J.P. Rizal St. Tayabas City.",
    client: "Batang may edad 6–71 na buwan.",
    documentsNeeded: ["Dental Form 1"],
    availability: "Monthly",
    fees: "Free",
    processingTime: "90 minutes",
    steps: [
      {
        title: "Making sa bibig/igay na pangkalusugang edukasyon at impormasyon.",
        bullets: [
          "CHO Employee: Magbigay ng pangkalusugang edukasyon at impormasyon sa magulang ng batang may edad 6–71 na buwan",
        ],
        time: "20–30 mins",
        responsible: "Dentist",
      },
      {
        title: "Handa ang mga bata 6–71 buwan at magsagawa ng toothbrushing drill.",
        bullets: ["CHO Employee: Isagawa ang toothbrushing drill sa mga batang 6–71 na buwan"],
        time: "30–60 mins",
        responsible: "Dentist",
      },
    ],
  },
];