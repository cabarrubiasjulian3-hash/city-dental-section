// Barangay Health Stations (BHS) each dentist covers, the weekday they are
// there, and the barangays that station is meant for. Choosing the station's
// barangay in "Add schedule" fills in the place, the day (weekly rotation) and
// the barangay list for you (all still editable). Barangay names match lib/barangays.js.
//
// day: 0 = Sunday … 6 = Saturday. closed: the station's dental clinic is
// closed, so it isn't used for auto-fill.

export const CITY_DENTAL_OFFICE = "City Dental Office";

export const STATION_GROUPS = [
  {
    dentist: "Dr. Orias",
    nameMatch: /orias/i,
    stations: [
      { id: "orias-baguio", name: "BHS Baguio", host: "Baguio", day: 3, barangays: ["Baguio", "Malaoa", "Calantas"] },
      {
        id: "orias-angustias",
        name: "BHS Angustias",
        host: "Angustias Zone I",
        day: 1,
        // "Poblacion" = the Angustias zones
        barangays: ["Angustias Zone I", "Angustias Zone II", "Angustias Zone III", "Angustias Zone IV"],
      },
      { id: "orias-wakas", name: "BHS Wakas", host: "Wakas", day: 4, barangays: ["Wakas", "Tongko", "Lita"] },
      {
        id: "orias-anos",
        name: "BHS Anos",
        host: "Anos",
        day: null,
        closed: true,
        note: "Dental clinic closed",
        barangays: [
          "Isabang", "Calumpang", "Gibanga", "Domoit Kanluran", "Domoit Silangan",
          "Mayowe", "Anos", "Potol", "Bukal Ibaba", "Bukal Ilaya",
        ],
      },
    ],
  },
  {
    dentist: "Dr. Mildred",
    nameMatch: /mildred/i,
    stations: [
      { id: "mildred-camaysa", name: "BHS Camaysa", host: "Camaysa", day: 1, barangays: ["Camaysa", "Ibas", "Dapdap"] },
      {
        id: "mildred-lalo",
        name: "BHS Lalo",
        host: "Lalo",
        day: 3,
        barangays: ["Lalo", "Opias", "Tamlong", "Banilad", "Katigan Kanluran", "Pook"],
      },
      {
        id: "mildred-angustias",
        name: "BHS Angustias",
        host: "Angustias Zone I",
        day: 2,
        barangays: ["San Isidro Zone I", "San Isidro Zone II", "San Isidro Zone III", "San Isidro Zone IV", "Ipilan", "Alitao"],
      },
    ],
  },
  {
    dentist: "Dr. Mano",
    nameMatch: /\bmano\b/i,
    stations: [
      {
        id: "mano-lakawan",
        name: "BHS Lakawan",
        host: "Lakawan",
        day: 1,
        barangays: ["Lakawan", "Mate", "Pandakaki", "Lawigue", "Alsam Ibaba", "Alsam Ilaya"],
      },
      {
        id: "mano-ilasan",
        name: "BHS Ilasan",
        host: "Ilasan Ibaba",
        day: 2,
        barangays: ["Talolong", "Ilasan Ibaba", "Ilasan Ilaya", "Masin", "Katigan Silangan", "Valencia"],
      },
      {
        id: "mano-palale",
        name: "BHS Iba Palale",
        host: "Palale Ibaba",
        day: 3,
        barangays: ["Palale Ibaba", "Palale Ilaya", "Palale Silangan", "Palale Kanluran"],
      },
    ],
  },
];

const FLAT = STATION_GROUPS.flatMap((g) => g.stations.map((st) => ({ ...st, dentist: g.dentist, nameMatch: g.nameMatch })));

// The BHS held in this barangay (e.g. "Camaysa" -> BHS Camaysa). When two
// stations share a host barangay ("Angustias Zone I"), the one whose dentist
// is already picked wins. Closed stations are skipped. null if none.
export function stationForHost(host, dentistName = "") {
  const matches = FLAT.filter((st) => !st.closed && st.host === host);
  return matches.find((st) => st.nameMatch.test(dentistName)) || matches[0] || null;
}

// Staff dropdown name for a station's dentist ("Dr. Anthony Orias" for "Dr. Orias"), or "".
export function staffNameFor(station, staffNames) {
  return staffNames.find((n) => station.nameMatch.test(n)) || "";
}