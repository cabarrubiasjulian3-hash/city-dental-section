import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

// Used by both the Admin Portal and the Doctor Portal (see App.jsx) — a
// doctor can send messages here same as admin, just scoped server-side to
// their own patients (see backend/routes/messages.js). readOnly is kept as
// an option for any future read-only use, but isn't passed by either portal
// route today.
export default function AdminMessages({ readOnly = false }) {
  const [threads, setThreads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  function loadThreads() {
    api.get("/messages/threads").then(setThreads).catch(() => {});
  }
  useEffect(loadThreads, []);

  async function openThread(t) {
    setSelected(t);
    const msgs = await api.get(`/messages?patient_id=${t.patient_id}`);
    setMessages(msgs);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim() || !selected) return;
    await api.post("/messages", { body: text, patient_id: selected.patient_id });
    setText("");
    const msgs = await api.get(`/messages?patient_id=${selected.patient_id}`);
    setMessages(msgs);
    loadThreads();
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold text-forest-950">Messages</h2>
   <div className="border border-cream-200 rounded-2xl flex h-[560px] overflow-hidden shadow-[0_2px_12px_rgba(37,53,34,0.12)]">
        <div className="w-64 border-r border-cream-200 overflow-y-auto bg-cream-100">
          {threads.map((t) => (
            <button
              key={t.patient_id}
              onClick={() => openThread(t)}
              className={`w-full text-left px-4 py-3 border-b border-cream-200 hover:bg-cream-100 ${
                selected?.patient_id === t.patient_id ? "bg-cream-200" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm text-forest-950 truncate">{t.name}</p>
                {/* Only present for admin (see GET /messages/threads) — shows
                    which doctor is on file for this patient's latest visit,
                    so admin can see who's handling them at a glance. */}
                {t.assigned_doctor && (
                  <span className="shrink-0 text-[10px] font-semibold text-forest-700 bg-cream-200 rounded-full px-2 py-0.5">
                    Dr. {t.assigned_doctor.replace(/^(dr\.?|doctor)\s+/i, "")}
                  </span>
                )}
              </div>
              <p className="text-xs text-forest-700 truncate">{t.last_message || "No messages yet"}</p>
            </button>
          ))}
          {threads.length === 0 && <p className="text-sm text-forest-700 p-4">No patients yet.</p>}
        </div>

        <div className="flex-1 flex flex-col bg-cream-50">
          {selected ? (
            <>
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {messages.map((m) => {
                  // Both admin and doctor replies are "outgoing" bubbles —
                  // only the patient's own messages sit on the left.
                  const outgoing = m.sender === "admin" || m.sender === "doctor";
                  return (
                    <div key={m.id} className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-md px-4 py-2 rounded-2xl text-sm ${
                          outgoing ? "bg-brand-900 text-brand-50" : "bg-cream-200 text-forest-950"
                        }`}
                      >
                        {m.body}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <fieldset disabled={readOnly} style={{ display: "contents" }}>
                <form onSubmit={send} className="flex items-center gap-3 border-t border-cream-200 p-4">
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={readOnly ? "This view is read-only." : `Message ${selected.name}…`}
                    className="flex-1 rounded-full border border-cream-200 bg-cream-100 px-4 py-2 text-sm outline-none focus:border-forest-700 disabled:opacity-60"
                  />
                  <button className="w-10 h-10 rounded-full bg-brand-900 text-brand-50 flex items-center justify-center disabled:opacity-60">➤</button>
                </form>
              </fieldset>
            </>
          ) : (
            <p className="m-auto text-sm text-forest-700">Select a conversation to view messages.</p>
          )}
        </div>
      </div>
    </div>
  );
}