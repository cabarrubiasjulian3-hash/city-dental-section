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

function conditionInfo(value) {
  return CONDITIONS.find((c) => c.value === value) || CONDITIONS[0];
}

export default function ToothChart({ patientId, isAdmin }) {
  const [chart, setChart] = useState([]);
  const [dmft, setDmft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingTooth, setEditingTooth] = useState(null);

  useEffect(() => {
    if (!patientId) return;
    setLoading(true);
    api
      .get(`/patients/${patientId}/tooth-chart`)
      .then((data) => {
        setChart(data.chart);
        setDmft(data.dmft);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patientId]);

  function toothData(toothNumber) {
    return chart.find((t) => t.tooth_number === toothNumber) || { condition: "sound", treatment_note: "" };
  }

  async function setCondition(toothNumber, condition) {
    const updated = await api.patch(`/patients/${patientId}/tooth-chart/${toothNumber}`, { condition });
    setChart((list) => {
      const withoutThis = list.filter((t) => t.tooth_number !== toothNumber);
      return [...withoutThis, { tooth_number: toothNumber, ...updated }];
    });
    setEditingTooth(null);
  }

  function Tooth({ number }) {
    const data = toothData(number);
    const info = conditionInfo(data.condition);
    return (
      <div className="relative flex flex-col items-center">
        <button
          type="button"
          onClick={() => isAdmin && setEditingTooth(editingTooth === number ? null : number)}
          title={`Tooth ${number}: ${info.label}${data.treatment_note ? ` — ${data.treatment_note}` : ""}`}
          className={`w-6 h-6 rounded-full border-2 ${info.tooth} ${isAdmin ? "cursor-pointer hover:ring-2 hover:ring-forest-400" : "cursor-default"}`}
        />
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

  return (
    <div className="bg-cream-50 border border-cream-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-forest-700">Oral Health Chart</p>
        <p className="text-xs text-forest-700">
          DMFT: <span className="font-bold text-forest-950">{dmft}</span>
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
        {isAdmin ? "Click a tooth to set its condition." : "Hover a tooth to see its condition."}
      </p>
      <div className="flex flex-wrap justify-center gap-4 mt-3">
        {CONDITIONS.map((c) => (
          <span key={c.value} className="flex items-center gap-1.5 text-xs text-forest-700">
            <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}