// ONE place for every Print and Export measurement, so the printed form and the exported
// Word file always use exactly the same sizes and spacing.
// Change a number here and BOTH follow:  AdminMonthlyReport.jsx (print) and exportOfficialForm.js (Word).
//
// Units: font sizes in pt, spaces in in / mm / px (written as CSS strings).

export const PRINT_SPEC = {
  fontFamily: 'Calibri, Carlito, "Segoe UI", Arial, sans-serif',

  // Legal paper, landscape. Page margin is 0 on purpose (that is what hides the browser's own
  // date / title / web address / "1/1" text); pagePad is the real margin.
  pageSize: "14in 8.5in",
  pagePad: { top: "6mm", right: "10mm", bottom: "5mm", left: "10mm" },

  // Extra space left and right of the table, SAME on both sides.
  // B = Quarterly / Annual / range. A = Monthly (dentist). C = Barangay sheet.
  sideInset: { A: "0.3in", B: "0.6in", C: "0.3in" },

  // Seals: 1in square, at the top, this far in from the left / right edge of the table.
  seal: { size: "1in", inset: "1.4in" },

  header: {
    lineHeight: 1.35,
    gapAfter: "0.35in", // space between the header and the table
    small: 11, // Republic of the Philippines / Province / City
    office: 20, // City Dental Office
    title: 16, // the report title + period
    sectionOffice: 14, // Barangay sheet: "City Dental Office"
    sectionTitle: 18, // Barangay sheet: "CITY DENTAL SECTION"
  },

  footer: {
    font: 12,
    lineHeight: 1.5, // the printed page gets this from the site's base style; the Word file needs it written out
    marginTop: "0.2in", // space between the table and "Prepared by"
    gap: "0.2in", // space between a label and the name under it (raise it if you want room to sign)
    labelIndent: "0.5in", // "Prepared by:" starts this far from the left of the table
    nameIndent: "0.2in", // the left name starts this far right of its label
    leftColumn: "61.5%", // "Noted by" / "Submitted to" starts here
  },

  // Widths (in %) of the first column(s); every other column is the same width.
  colFixed: { A: [14], B: [], C: [12, 7] },

  table: {
    // Quarterly (B): few columns, so bigger type and a tall header row
    wide: { th: 14.5, td: 14.5, tag: 9.5, thPad: "10px 4px", tdPad: "7px 3px", tagPadY: "7px", thLine: 1.2, tdLine: 1.1, subHeaderHeight: "1.75in" },
    // Monthly (A) and Barangay (C): about 23 columns, so smaller type.
    // tdLine: the printed page gets 1.333 from the table's text-xs class; the Word file needs it written out.
    narrow: { th: 10.5, td: 11.5, tag: 8.5, thPad: "5px 4px", tdPad: "4px 3px", thLine: 1.2, tdLine: 1.333 },
    base: 16, // month totals, grand total of the Barangay sheet
    xl: 18, // the big overall totals
  },
};