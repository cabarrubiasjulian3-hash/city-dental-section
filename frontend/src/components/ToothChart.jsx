import { useEffect, useState } from "react";
import { api } from "../lib/api";

const UPPER_ROW = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const LOWER_ROW = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];

const CONDITIONS = [
  { value: "sound", label: "Sound", dot: "bg-green-200", tooth: "bg-green-100 border-green-300" },
  { value: "decayed", label: "Decayed", dot: "bg-lime-500", tooth: "bg-lime-400 border-lime-600" },
  { value: "filled", label: "Filled", dot: "bg-brand-800", tooth: "bg-brand-800 border-brand-900" },
  { value: "for_extraction", label: "For Extraction", dot: "bg-red-500", tooth: "bg-red-500 border-red-700" },
  { value: "missing", label: "Missing", dot: "bg-cream-200 border border-forest-300", tooth: "bg-transparent border-dashed border-forest-300" },
];

// Conditions that count toward the DMFT number shown in "draft" mode below
// (a preview only — once the patient is saved, the server's number is used).
const DMFT_CONDITIONS = ["decayed", "missing", "filled", "for_extraction"];

function conditionInfo(value) {
  return CONDITIONS.find((c) => c.value === value) || CONDITIONS[0];
}

// The Oral Health Chart. Three ways to use it:
//
//   <ToothChart patientId={id} isAdmin />
//       Editable, and every click is saved to that patient straight away.
//       (Used inside "Add Service Record".)
//
//   <ToothChart patientId={id} isAdmin={false} />
//       View only — hover a tooth to see its condition. (Used in the Patient
//       Summary; the patient portal uses it the same way.)
//
//   <ToothChart patientId={id} isAdmin lockRecorded />
//       Same as the first, for a returning patient's new visit: the chart
//       opens with everything recorded before. Any tooth that already has a
//       recorded condition (decayed, filled, for extraction, missing) is
//       locked; only teeth with no record yet (sound) can be edited. Teeth
//       changed during this visit get a ring.
//
//   <ToothChart patientId={id} isAdmin recordId={record.id} />
//       Used while an existing service record is being edited: only the teeth
//       that this record set (amber ring) and teeth with no record yet can be
//       changed; teeth set by other visits (other dates) are locked.
//
//   <ToothChart isAdmin draft={map} onDraftChange={setMap} />
//       For a patient that doesn't exist yet (New Patient Record): nothing is
//       sent to the server; the chart lives in `map` ({ "16": "decayed", … })
//       and the parent saves it once the patient has been created.
export default function ToothChart({ patientId, isAdmin, draft, onDraftChange, lockRecorded = false, recordId = null, onTeethChanged }) {
  const draftMode = draft !== undefined;
  const [chart, setChart] = useState([]);
  const [dmft, setDmft] = useState(0);
  const [loading, setLoading] = useState(!draftMode);
  const [editingTooth, setEditingTooth] = useState(null);
  const [error, setError] = useState("");
  // Teeth that already had a recorded condition when the chart was opened (locked when
  // lockRecorded is on) and teeth changed since then (highlighted).
  const [lockedTeeth, setLockedTeeth] = useState([]);
  const [changedTeeth, setChangedTeeth] = useState([]);

  // Tell the parent which teeth were changed (Add Service Record sends them
  // along so the server ties them to the new visit).
  useEffect(() => {
    onTeethChanged?.(changedTeeth);
  }, [changedTeeth]);

  useEffect(() => {
    if (draftMode || !patientId) return;
    setLoading(true);
    api
      .get(`/patients/${patientId}/tooth-chart`)
      .then((data) => {
        setChart(data.chart);
        setDmft(data.dmft);
        setLockedTeeth(lockRecorded ? data.chart.filter((t) => t.condition && t.condition !== "sound").map((t) => t.tooth_number) : []);
        setChangedTeeth([]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patientId, draftMode, lockRecorded, recordId]);

  function toothData(toothNumber) {
    if (draftMode) return { condition: draft[toothNumber] || "sound", treatment_note: "" };
    return chart.find((t) => t.tooth_number === toothNumber) || { condition: "sound", treatment_note: "" };
  }

  async function setCondition(toothNumber, condition) {
    setError("");
    if (draftMode) {
      onDraftChange?.({ ...draft, [toothNumber]: condition });
      setEditingTooth(null);
      return;
    }
    try {
      await api.patch(`/patients/${patientId}/tooth-chart/${toothNumber}`, recordId ? { condition, record_id: recordId } : { condition });
      // Reload so the chart and the DMFT number always match what the server
      // actually saved (the server decides what counts toward DMFT).
      const fresh = await api.get(`/patients/${patientId}/tooth-chart`);
      setChart(fresh.chart);
      setDmft(fresh.dmft);
      setChangedTeeth((list) => (list.includes(toothNumber) ? list : [...list, toothNumber]));
      setEditingTooth(null);
    } catch (err) {
      setError(err.message || "Could not save that change.");
    }
  }

  function Tooth({ number }) {
    const data = toothData(number);
    const info = conditionInfo(data.condition);
    // Add Service Record: every tooth that already had a condition is locked.
    // Editing a record: teeth set by a different visit are locked.
    const lockedByOtherVisit = !!recordId && data.condition !== "sound" && data.record_id != null && data.record_id !== recordId;
    const locked = lockedTeeth.includes(number) || lockedByOtherVisit;
    const changed = changedTeeth.includes(number) || (!!recordId && data.condition !== "sound" && data.record_id === recordId);
    return (
      <div
        className="relative flex flex-col items-center"
        title={locked ? `Tooth ${number}: ${info.label} — locked (already recorded${recordId ? " in another visit" : ""})` : undefined}
      >
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            if (!isAdmin || locked) return;
            setError("");
            setEditingTooth(editingTooth === number ? null : number);
          }}
          title={`Tooth ${number}: ${info.label}${data.treatment_note ? ` — ${data.treatment_note}` : ""}${locked ? " (locked — already has a record)" : ""}${changed ? (recordId ? " (set in this record)" : " (changed this visit)") : ""}`}
          aria-label={`Tooth ${number}: ${info.label}${locked ? " (locked)" : ""}`}
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${info.tooth} ${
            !isAdmin ? "cursor-default" : locked ? "cursor-not-allowed opacity-60 pointer-events-none" : "cursor-pointer hover:ring-2 hover:ring-forest-400"
          } ${changed ? "ring-2 ring-amber-400" : ""}`}
        >
          {locked && <span className="text-[9px] leading-none">🔒</span>}
        </button>
        <span className="text-[10px] text-forest-700 mt-0.5">{number}</span>

        {editingTooth === number && (
          <div className="absolute z-20 top-8 bg-cream-50 border border-cream-200 rounded-lg shadow-lg p-1.5 w-36">
            {CONDITIONS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCondition(number, c.value)}
                className="w-full flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-cream-100 text-left"
              >
                <span className={`w-3 h-3 rounded-full ${c.dot}`} />
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (loading) return <p className="text-sm text-forest-700">Loading tooth chart…</p>;

  const dmftShown = draftMode ? Object.values(draft).filter((c) => DMFT_CONDITIONS.includes(c)).length : dmft;

  return (
    <div className="bg-cream-50 border border-cream-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-forest-700">Oral Health Chart</p>
        <p className="text-xs text-forest-700">
          DMFT: <span className="font-bold text-forest-950">{dmftShown}</span>
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-1.5 mb-1">
        {UPPER_ROW.map((n) => (
          <Tooth key={n} number={n} />
        ))}
      </div>
      <div className="border-t border-cream-200 my-2" />
      <div className="flex flex-wrap justify-center gap-1.5 mt-1">
        {LOWER_ROW.map((n) => (
          <Tooth key={n} number={n} />
        ))}
      </div>

      <p className="text-xs text-forest-700 text-center mt-4">
        {!isAdmin
          ? "View only — hover a tooth to see its condition."
          : recordId
          ? "Editing this record: you can change the teeth marked in this record (ringed) and teeth with no record yet. Teeth recorded in other visits (🔒) are locked."
          : lockRecorded
          ? "Shows the patient's latest chart. Click a tooth to record what changed at this visit — teeth that already have a record (🔒) are locked."
          : "Click a tooth to set its condition."}
      </p>
      {error && <p className="text-xs text-red-600 text-center mt-1">{error}</p>}
      <div className="flex flex-wrap justify-center gap-4 mt-3">
        {CONDITIONS.map((c) => (
          <span key={c.value} className="flex items-center gap-1.5 text-xs text-forest-700">
            <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
            {c.label}
          </span>
        ))}
        {(lockRecorded || recordId) && isAdmin && (
          <span className="flex items-center gap-1.5 text-xs text-forest-700">
            <span className="w-2.5 h-2.5 rounded-full ring-2 ring-amber-400 bg-cream-100" />
            {recordId ? "Set in this record" : "Changed this visit"}
          </span>
        )}
      </div>
    </div>
  );
}