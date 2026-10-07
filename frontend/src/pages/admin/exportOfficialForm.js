// Exports the on-screen official e-FHSIS form as an EDITABLE Word file (.doc).
// Open it in Word / LibreOffice / Google Docs, change any number or text, save.
//
// It reuses the table that is already drawn on screen (same colours, same merged cells) and
// adds the header (seals + "Republic of the Philippines" lines) and the "Prepared by / Noted by"
// footer. Every size and space comes from printSpec.js, the SAME file the Print layout uses,
// so the exported file matches the printed form.
//
// No extra npm package needed.

import { PRINT_SPEC as S } from "./printSpec";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// "1.4in" / "10mm" / "7px" / "0.5in" -> inches (number)
function toIn(v) {
  const n = parseFloat(v);
  if (String(v).endsWith("mm")) return n / 25.4;
  if (String(v).endsWith("px")) return n / 96;
  if (String(v).endsWith("cm")) return n / 2.54;
  return n; // in
}
const toCm = (v) => `${(toIn(v) * 2.54).toFixed(2)}cm`;
const toPx = (v) => Math.round(toIn(v) * 96);

// Reads an image and turns it into a data: URI so it travels inside the file.
async function toDataUri(src) {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null; // dev server answered with index.html
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

let FORM_MODE = "A";
const wide = () => FORM_MODE === "B";
const T = () => (wide() ? S.table.wide : S.table.narrow);

// Font size of a table cell: the big totals keep their size, everything else uses the spec.
function cellFontPt(tag, px) {
  const size = parseFloat(px);
  if (size >= 19) return `${S.table.xl}pt`;
  if (size >= 15) return `${S.table.base}pt`;
  return `${tag === "TH" ? T().th : T().td}pt`;
}

// Copies the look of every element (borders, colours, weights) into inline styles,
// because Word does not understand the Tailwind classes. Sizes and spacing come from the spec.
function inlineStyles(orig, clone) {
  if (orig.tagName === "COLGROUP" || orig.tagName === "COL") return;
  const cs = getComputedStyle(orig);

  // "MALE | 15" cells use flexbox on screen; Word can't, so rebuild them as a tiny 2-cell table.
  if (orig.tagName === "DIV" && cs.display === "flex" && orig.children.length === 2) {
    const [lab, val] = orig.children;
    const w = S.table.wide;
    const n = S.table.narrow;
    const bw = getComputedStyle(val).fontWeight;
    const big = wide() ? w.td : n.td;
    const tag = wide() ? w.tag : n.tag;
    const padY = wide() ? w.tagPadY : "4px";
    clone.removeAttribute("class");
    clone.setAttribute("style", "margin:0;");
    clone.innerHTML = `<table style="width:100%;border-collapse:collapse;"><tr>
      <td style="width:60%;text-align:center;padding:${padY} 0;font-size:${tag}pt;font-weight:bold;">${esc(lab.textContent)}</td>
      <td style="width:40%;text-align:center;padding:${padY} 0;border-left:1px solid #1c261d;font-size:${big}pt;font-weight:${bw};line-height:${w.tdLine};">${esc(val.textContent)}</td>
    </tr></table>`;
    return;
  }

  const isTh = orig.tagName === "TH";
  const isCell = isTh || orig.tagName === "TD";
  const holdsSexCell = isCell && [...orig.children].some((c) => c.tagName === "DIV" && getComputedStyle(c).display === "flex");
  const parts = [
    `color:${cs.color}`,
    `font-family:${S.fontFamily}`,
    `font-size:${isCell ? cellFontPt(orig.tagName, cs.fontSize) : `${parseFloat(cs.fontSize) * 0.75}pt`}`,
    `font-weight:${cs.fontWeight}`,
    `text-transform:${cs.textTransform}`,
  ];
  if (isCell) {
    const t = T();
    parts.push(
      `background-color:${cs.backgroundColor}`,
      `text-align:${cs.textAlign === "start" ? "left" : cs.textAlign}`,
      `vertical-align:middle`,
      `border-top:${cs.borderTop}`,
      `border-right:${cs.borderRight}`,
      `border-bottom:${cs.borderBottom}`,
      `border-left:${cs.borderLeft}`,
      `padding:${holdsSexCell ? "0" : isTh ? t.thPad : t.tdPad}`
    );
    if (isTh) parts.push(`line-height:${t.thLine}`);
    else if (wide()) parts.push(`line-height:${t.tdLine}`);
    // the tall second header row of the Quarterly form (the A. / B. adolescent columns)
    if (wide() && isTh && orig.closest("thead") && orig.parentElement.rowIndex === 1) {
      parts.push(`height:${S.table.wide.subHeaderHeight}`);
    }
  }
  if (orig.tagName === "TABLE") {
    parts.push("border-collapse:collapse", "width:100%");
  }
  clone.setAttribute("style", parts.join(";"));
  clone.removeAttribute("class");

  for (let i = 0; i < orig.children.length; i++) inlineStyles(orig.children[i], clone.children[i]);
}

// How many grid columns the table really has (cells with colSpan / rowSpan counted properly).
function gridColumns(table) {
  const taken = [];
  let max = 0;
  [...table.rows].forEach((tr, r) => {
    let c = 0;
    [...tr.cells].forEach((cell) => {
      while (taken[r]?.[c]) c++;
      for (let i = 0; i < cell.rowSpan; i++) {
        taken[r + i] = taken[r + i] || [];
        for (let j = 0; j < cell.colSpan; j++) taken[r + i][c + j] = true;
      }
      c += cell.colSpan;
    });
    max = Math.max(max, c);
  });
  return max;
}

// Same column widths as the print layout: equal, except the first column(s) of forms A and C.
// They are hints, so a column still widens if a word doesn't fit.
function colgroupHtml(mode, n) {
  const fixed = S.colFixed[mode] || [];
  const rest = (100 - fixed.reduce((a, b) => a + b, 0)) / (n - fixed.length);
  const widths = [...fixed, ...Array(n - fixed.length).fill(rest)];
  return `<colgroup>${widths.map((w) => `<col width="${w.toFixed(2)}%" style="width:${w.toFixed(2)}%;">`).join("")}</colgroup>`;
}

function headerHtml(model, leftImg, rightImg) {
  const H = S.header;
  const sealPx = toPx(S.seal.size);
  const insetPx = toPx(S.seal.inset);
  const img = (src) =>
    src ? `<img src="${src}" width="${sealPx}" height="${sealPx}" style="width:${sealPx}px;height:${sealPx}px;" />` : "&nbsp;";
  const line = (text, size, extra = "") =>
    `<p style="margin:0;text-align:center;font-family:${S.fontFamily};font-size:${size}pt;line-height:${H.lineHeight};${extra}">${text}</p>`;

  let top;
  let titleRow = "";
  if (model.mode === "C") {
    top = [
      line("Tayabas City", H.small),
      line("City Dental Office", H.sectionOffice, "font-weight:bold;"),
      line("CITY DENTAL SECTION", H.sectionTitle, "font-weight:bold;"),
    ].join("");
  } else {
    top = [
      line("Republic of the Philippines", H.small),
      line("Province of Quezon", H.small),
      line("City of Tayabas", H.small),
      line("City Dental Office", H.office, "font-weight:bold;"),
    ].join("");
    titleRow = `<tr><td colspan="5" style="text-align:center;">${line(
      `${esc(model.title)} <span style="${model.underline ? "font-weight:bold;text-decoration:underline;" : ""}">${esc(model.period)}</span>`,
      H.title
    )}</td></tr>`;
  }

  return `<table width="100%" style="width:100%;border-collapse:collapse;margin-bottom:${H.gapAfter};">
    <tr>
      <td width="${insetPx}" style="width:${insetPx}px;">&nbsp;</td>
      <td width="${sealPx}" style="width:${sealPx}px;text-align:left;vertical-align:top;">${img(leftImg)}</td>
      <td style="text-align:center;vertical-align:top;">${top}</td>
      <td width="${sealPx}" style="width:${sealPx}px;text-align:right;vertical-align:top;">${img(rightImg)}</td>
      <td width="${insetPx}" style="width:${insetPx}px;">&nbsp;</td>
    </tr>
    ${titleRow}
  </table>`;
}

// "Prepared by" at the left, "Noted by" / "Submitted to" starting at the same % across as the print layout.
function footerHtml(model, signatories) {
  const F = S.footer;
  const { preparedBy, notedBy } = signatories;
  const label = model.mode === "B" ? "Noted by:" : "Submitted to:";
  const font = `font-family:${S.fontFamily};font-size:${F.font}pt;`;
  const nameLeft = `${(toIn(F.labelIndent) + toIn(F.nameIndent)).toFixed(2)}in`;
  const block = (title, p, labelLeft, nameLeftPad) => `
    <table style="border-collapse:collapse;">
      <tr><td style="${font}padding:0 0 0 ${labelLeft};">${title}</td></tr>
      <tr><td style="${font}padding:${F.gap} 0 0 ${nameLeftPad};text-align:center;white-space:nowrap;">${esc(p.name)}<br><b>${esc(p.title)}</b></td></tr>
    </table>`;
  return `<table width="100%" style="width:100%;border-collapse:collapse;margin-top:${F.marginTop};">
    <tr>
      <td width="${F.leftColumn}" style="width:${F.leftColumn};vertical-align:top;">${block("Prepared by:", preparedBy, F.labelIndent, nameLeft)}</td>
      <td style="vertical-align:top;">${block(label, notedBy, "0", "0")}</td>
    </tr>
  </table>`;
}

/**
 * @param {object}      opts
 * @param {object}      opts.model        the report model from ReportFormSection
 * @param {HTMLElement} opts.container    document.getElementById("printable-monthly-report")
 * @param {string[]}    opts.seals        [leftSealUrl, rightSealUrl]
 * @param {object}      opts.signatories  { preparedBy: {name,title}, notedBy: {name,title} }
 */
export async function exportOfficialForm({ model, container, seals, signatories }) {
  const table = container?.querySelector("table");
  if (!table) throw new Error("There is no report to export for these filters.");

  const [leftImg, rightImg] = await Promise.all(seals.map(toDataUri));

  FORM_MODE = model.mode;
  const tableClone = table.cloneNode(true);
  inlineStyles(table, tableClone);
  tableClone.querySelectorAll("colgroup").forEach((g) => g.remove());
  tableClone.insertAdjacentHTML("afterbegin", colgroupHtml(model.mode, gridColumns(table)));

  // Same page as the print layout: legal landscape, same margins + the same extra left/right space.
  const pad = S.pagePad;
  const side = S.sideInset[model.mode] || "0in";
  const [pageW, pageH] = S.pageSize.split(" ");
  const margin = `${toCm(pad.top)} ${(toIn(pad.right) + toIn(side)) * 2.54}cm ${toCm(pad.bottom)} ${(toIn(pad.left) + toIn(side)) * 2.54}cm`;

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${esc(model.title || "City Dental Section")} ${esc(model.period)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>
  @page Section1 { size: ${toCm(pageW)} ${toCm(pageH)}; mso-page-orientation: landscape; margin: ${margin}; }
  div.Section1 { page: Section1; }
  body, p, td, th { font-family: ${S.fontFamily}; }
  table { border-collapse: collapse; }
  tr { page-break-inside: avoid; }
</style>
</head>
<body>
<div class="Section1">
${headerHtml(model, leftImg, rightImg)}
${tableClone.outerHTML}
${footerHtml(model, signatories)}
</div>
</body>
</html>`;

  const name = `${model.title || "City Dental Section"} ${model.period}`
    .replace(/[–—]/g, "-")
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-");

  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}