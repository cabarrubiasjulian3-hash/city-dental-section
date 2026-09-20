import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";

// Used by both the Admin Portal and the Doctor Portal (see App.jsx). In the
// Doctor Portal this is the shared chat inbox: every patient who messages in
// through the Patient Portal chatbot shows up here for ALL doctors (plus each
// doctor's own patients), and any doctor can reply. Every reply is stamped
// with the sender's name — "Last reply by ..." in the list and above each
// bubble — so the doctors can see who spoke to the patient last.
// readOnly is kept as an option for any future read-only use, but isn't
// passed by either portal route today.

const POLL_MS = 5000; // how often to check for new messages

// SQLite's datetime('now') is UTC, written "YYYY-MM-DD HH:MM:SS" with no zone.
function parseServerTime(value) {
  const d = new Date(`${String(value).replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatTime(value) {
  const d = parseServerTime(value);
  return d ? d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}

// "Doctor Ana Lopez" / "Dr. Ana Lopez" / "Ana Lopez"  →  "Dr. Ana Lopez"
function staffLabel(name, role) {
  const clean = (name || "").trim();
  if (role === "doctor") return clean ? `Dr. ${clean.replace(/^(dr\.?|doctor)\s+/i, "")}` : "Doctor";
  return clean || "Staff";
}

export default function AdminMessages({ readOnly = false }) {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  // Clicking a "New message from ..." notification lands here as
  // /doctor/messages?patient_id=5 — once the list has loaded, open that
  // patient's conversation, then clear the param so clicking the same
  // notification again works too.
  const [searchParams, setSearchParams] = useSearchParams();
  // The open patient's id, readable from inside the polling timer / async
  // callbacks (state would be stale there) — also lets a slow response for a
  // conversation we've already left be ignored.
  const selectedIdRef = useRef(null);

  function loadThreads() {
    api.get("/messages/threads").then(setThreads).catch(() => {});
  }

  function loadMessages(patientId) {
    return api
      .get(`/messages?patient_id=${patientId}`)
      .then((rows) => {
        if (selectedIdRef.current === patientId) setMessages(rows);
      })
      .catch(() => {});
  }

  // Load the list, then keep both the list and the open conversation fresh.
  useEffect(() => {
    loadThreads();
    const id = setInterval(() => {
      if (document.hidden) return;
      loadThreads();
      if (selectedIdRef.current) loadMessages(selectedIdRef.current);
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const targetId = searchParams.get("patient_id");
    if (!targetId || threads.length === 0) return;
    const match = threads.find((t) => String(t.patient_id) === targetId);
    if (match) {
      openThread(match);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, searchParams]);

  async function openThread(t) {
    selectedIdRef.current = t.patient_id;
    setSelected(t);
    setMessages([]);
    setError("");
    await loadMessages(t.patient_id);
  }

  // Jump to the newest message when a conversation opens or a message is
  // added (not on every background check, so reading older messages isn't
  // interrupted).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, selected?.patient_id]);

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !selected || sending) return;
    setSending(true);
    setError("");
    try {
      await api.post("/messages", { body, patient_id: selected.patient_id });
      setText("");
      await loadMessages(selected.patient_id);
      loadThreads();
    } catch (err) {
      setError(err.message || "Couldn't send the message.");
    } finally {
      setSending(false);
    }
  }

  // Live version of the open thread (the list refreshes; `selected` is just
  // the row that was clicked).
  const current = selected ? threads.find((t) => t.patient_id === selected.patient_id) || selected : null;
  const lastReplyLabel = current?.last_reply_by ? staffLabel(current.last_reply_by, current.last_reply_role) : null;

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold text-forest-950">Messages</h2>
      <div className="border border-cream-200 rounded-2xl flex h-[560px] overflow-hidden shadow-[0_2px_12px_rgba(37,53,34,0.12)]">
        <div className="w-72 shrink-0 border-r border-cream-200 overflow-y-auto bg-cream-100">
          {threads.map((t) => {
            const waiting = t.last_sender === "patient";
            const replier = t.last_reply_by ? staffLabel(t.last_reply_by, t.last_reply_role) : null;
            return (
              <button
                key={t.patient_id}
                onClick={() => openThread(t)}
                className={`w-full text-left px-4 py-3 border-b border-cream-200 hover:bg-cream-200 ${
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
                {waiting ? (
                  <span className="inline-block mt-1 text-[10px] font-semibold text-brand-50 bg-brand-900 rounded-full px-2 py-0.5">
                    Waiting for reply
                  </span>
                ) : (
                  replier && <p className="text-[11px] text-forest-600 mt-0.5 truncate">Last reply by {replier}</p>
                )}
              </button>
            );
          })}
          {threads.length === 0 && <p className="text-sm text-forest-700 p-4">No conversations yet.</p>}
        </div>

        <div className="flex-1 min-w-0 flex flex-col bg-cream-50">
          {selected ? (
            <>
              <div className="px-5 py-3 border-b border-cream-200 bg-cream-100">
                <p className="font-semibold text-sm text-forest-950">{current.name}</p>
                <p className="text-xs text-forest-600">
                  {lastReplyLabel ? `Last reply by ${lastReplyLabel}` : "No reply from the doctors yet"}
                </p>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
                {messages.length === 0 && <p className="text-center text-sm text-forest-600">No messages yet.</p>}
                {messages.map((m) => {
                  // Admin and doctor replies are "outgoing" bubbles (with the
                  // sender's name above) — only the patient's own messages sit
                  // on the left.
                  const outgoing = m.sender === "admin" || m.sender === "doctor";
                  const isMine = outgoing && m.sender_name && m.sender_name === user?.name;
                  return (
                    <div key={m.id} className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-md flex flex-col ${outgoing ? "items-end" : "items-start"}`}>
                        {outgoing && (
                          <span className="text-[11px] font-semibold text-forest-700 mb-1 px-1">
                            {staffLabel(m.sender_name, m.sender)}
                            {isMine ? " (you)" : ""}
                          </span>
                        )}
                        <div
                          className={`px-4 py-2 rounded-2xl text-sm whitespace-pre-line break-words ${
                            outgoing ? "bg-brand-900 text-brand-50" : "bg-cream-200 text-forest-950"
                          }`}
                        >
                          {m.body}
                        </div>
                        <span className="text-[10px] text-forest-500 mt-1 px-1">{formatTime(m.sent_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {error && <p className="px-5 pb-1 text-xs text-red-600">{error}</p>}
              <fieldset disabled={readOnly} style={{ display: "contents" }}>
                <form onSubmit={send} className="flex items-center gap-3 border-t border-cream-200 p-4">
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={readOnly ? "This view is read-only." : `Reply to ${selected.name} as ${staffLabel(user?.name, user?.role)}…`}
                    className="flex-1 rounded-full border border-cream-200 bg-cream-100 px-4 py-2 text-sm outline-none focus:border-forest-700 disabled:opacity-60"
                  />
                  <button
                    disabled={sending}
                    className="w-10 h-10 rounded-full bg-brand-900 text-brand-50 flex items-center justify-center disabled:opacity-60"
                  >
                    ➤
                  </button>
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