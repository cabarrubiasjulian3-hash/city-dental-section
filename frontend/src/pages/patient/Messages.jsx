import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { getBotReply, QUICK_REPLIES, WELCOME_MESSAGE } from "../../lib/chatbot";

// Patient Portal → Messages.
//
// Every message the patient sends is saved on the server (POST /messages), so
// ALL doctors can read it in their Messages page and either one can reply.
// Doctor replies show up here on their own (the page checks the server every
// few seconds), each labelled with the doctor's name so the patient knows who
// they're talking to.
//
// The automated bot answers instantly on top of that. Its replies are worked
// out in lib/chatbot.js and then SAVED on the server too (POST
// /messages/bot-reply), so the doctors see the bot's replies in the same
// conversation. Each one is pinned right under the patient message that
// triggered it. (Older bot replies that were only ever kept in this browser —
// localStorage — still show, and a reply that couldn't be saved falls back to
// the browser copy.)

const REPLY_DELAY_MS = 700; // how long the "typing…" dots show before the bot replies
const POLL_MS = 5000; // how often to check for new doctor replies

// SQLite's datetime('now') is UTC, written "YYYY-MM-DD HH:MM:SS" with no zone.
function parseServerTime(value) {
  const d = new Date(`${String(value).replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatTime(date) {
  return date ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}

// "Doctor Ana Lopez" / "Dr. Ana Lopez" / "Ana Lopez"  →  "Dr. Ana Lopez"
function staffLabel(m) {
  const name = (m.sender_name || "").trim();
  if (m.sender === "doctor") return name ? `Dr. ${name.replace(/^(dr\.?|doctor)\s+/i, "")}` : "Doctor";
  return name || "Staff";
}

// What the server sent is the full conversation. Keep any message we just
// sent that the server list (fetched a moment earlier) doesn't have yet, so a
// poll can't erase it.
function replaceFromServer(prev, incoming) {
  const seen = new Set(incoming.map((m) => m.id));
  const newestIncoming = Math.max(0, ...incoming.filter((m) => typeof m.id === "number").map((m) => m.id));
  const justSent = prev.filter((m) => !seen.has(m.id) && typeof m.id === "number" && m.id > newestIncoming);
  return [...incoming, ...justSent];
}

function addIfMissing(prev, message) {
  return prev.some((m) => m.id === message.id) ? prev : [...prev, message];
}

export default function PatientMessages() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const botKey = `cds_chat_bot_${user?.id ?? "guest"}`;

  const [serverMsgs, setServerMsgs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [botMsgs, setBotMsgs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(botKey) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  // Remember the bot's replies (last 100) across refreshes.
  useEffect(() => {
    try {
      localStorage.setItem(botKey, JSON.stringify(botMsgs.slice(-100)));
    } catch {
      /* storage full / blocked — chat still works */
    }
  }, [botMsgs, botKey]);

  // Load the conversation, then keep checking for new doctor replies.
  useEffect(() => {
    let cancelled = false;
    function load() {
      api
        .get("/messages")
        .then((rows) => {
          if (cancelled) return;
          setServerMsgs((prev) => replaceFromServer(prev, rows));
          setLoadError(false);
          setLoaded(true);
        })
        .catch(() => {
          if (cancelled) return;
          setLoadError(true);
          setLoaded(true);
        });
    }
    load();
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Don't fire a pending bot reply after leaving the page.
  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Patient messages + doctor replies (from the server) in order, with each
  // bot reply placed right under the message that triggered it.
  const timeline = useMemo(() => {
    // Bot replies saved on the server (sender "bot"), by the message they answered.
    const botsByAnchor = new Map();
    const localBotsByAnchor = new Map();
    for (const row of serverMsgs) {
      if (row.sender !== "bot") continue;
      const list = botsByAnchor.get(row.reply_to) || [];
      list.push({
        id: row.id,
        text: row.body,
        link: row.link,
        prefill: row.prefill,
        at: (parseServerTime(row.sent_at) || new Date()).toISOString(),
      });
      botsByAnchor.set(row.reply_to, list);
    }
    // Browser-only bot replies (older ones, or ones that couldn't be saved) —
    // used only where the server has no reply for that message.
    for (const b of botMsgs) {
      if (botsByAnchor.has(b.afterId)) continue;
      const list = localBotsByAnchor.get(b.afterId) || [];
      list.push(b);
      localBotsByAnchor.set(b.afterId, list);
    }
    const items = [];
    for (const m of serverMsgs) {
      if (m.sender === "bot") continue;
      items.push({ key: `s-${m.id}`, kind: m.sender === "patient" ? "me" : "staff", m });
      for (const b of botsByAnchor.get(m.id) || []) items.push({ key: b.id, kind: "bot", b });
      for (const b of localBotsByAnchor.get(m.id) || []) items.push({ key: b.id, kind: "bot", b });
    }
    return items;
  }, [serverMsgs, botMsgs]);

  // Jump to the newest message — but only when something was actually added,
  // so the background check doesn't yank the view while someone is reading.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [timeline.length, typing]);

  // Let the message box grow with what's typed (the form is several lines).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const busy = sending || typing;

  async function send(raw) {
    const body = raw.trim();
    if (!body || busy) return;

    setError("");
    setSending(true);
    let saved;
    try {
      saved = await api.post("/messages", { body });
    } catch (err) {
      setError(err.message || "Hindi naipadala ang mensahe. Subukan po ulit.");
      setSending(false);
      return;
    }
    setServerMsgs((prev) => addIfMissing(prev, saved));
    setText("");
    setSending(false);
    setTyping(true);

    timerRef.current = setTimeout(() => {
      const reply = getBotReply(body);
      const localBot = {
        id: `b-${saved.id}`,
        afterId: saved.id,
        text: reply.text,
        link: reply.link,
        prefill: reply.prefill,
        at: new Date().toISOString(),
      };
      // Show it right away from the browser copy, and save it on the server
      // so the doctors see it too (the server copy then replaces this one).
      setBotMsgs((prev) => [...prev.slice(-99), localBot]);
      setTyping(false);
      api
        .post("/messages/bot-reply", { reply_to: saved.id, body: reply.text, link: reply.link, prefill: reply.prefill })
        .then((row) => {
          setServerMsgs((prev) => addIfMissing(prev, row));
          setBotMsgs((prev) => prev.filter((b) => b.id !== localBot.id));
        })
        .catch(() => {
          /* stays as the browser-only copy */
        });
    }, REPLY_DELAY_MS);
  }

  function handleSubmit(e) {
    e.preventDefault();
    send(text);
  }

  // Enter sends; Shift+Enter makes a new line.
  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(text);
    }
  }

  function usePrefill(prefill) {
    setText(prefill);
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold text-forest-950">Messages</h2>

      <div className="border border-cream-200 rounded-2xl flex flex-col h-[620px] overflow-hidden bg-cream-50 shadow-[0_2px_12px_rgba(37,53,34,0.12)]">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-cream-200 bg-cream-100">
          <div className="w-10 h-10 rounded-full bg-brand-900 overflow-hidden shrink-0">
            <img src="/logo.png" alt="" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-forest-950 leading-tight">City Dental Section</p>
            <p className="text-xs text-forest-600">Automated assistant · Doctors reply here</p>
          </div>
        </div>

        {/* Conversation */}
        <div ref={scrollRef} aria-live="polite" className="flex-1 overflow-y-auto p-5 space-y-3">
          <Bubble variant="bot" text={WELCOME_MESSAGE} label="Automated assistant" />

          {!loaded && <p className="text-center text-xs text-forest-500">Loading messages…</p>}
          {loadError && (
            <p className="text-center text-xs text-red-600">
              Hindi makakonekta sa server ngayon. Subukan po ulit mamaya.
            </p>
          )}

          {timeline.map((item) =>
            item.kind === "me" ? (
              <Bubble key={item.key} variant="me" text={item.m.body} time={formatTime(parseServerTime(item.m.sent_at))} />
            ) : item.kind === "staff" ? (
              <Bubble
                key={item.key}
                variant="staff"
                label={staffLabel(item.m)}
                text={item.m.body}
                time={formatTime(parseServerTime(item.m.sent_at))}
              />
            ) : (
              <Bubble
                key={item.key}
                variant="bot"
                label="Automated reply"
                text={item.b.text}
                time={formatTime(new Date(item.b.at))}
                link={item.b.link}
                onLink={(to) => navigate(to)}
                prefill={item.b.prefill}
                onPrefill={usePrefill}
              />
            )
          )}

          {typing && (
            <div className="flex justify-start">
              <div className="bg-cream-200 rounded-2xl px-4 py-3 flex items-center gap-1" aria-label="Nagta-type…">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="w-1.5 h-1.5 rounded-full bg-forest-600 animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick replies + input */}
        <div className="border-t border-cream-200 bg-cream-50">
          <div className="px-4 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-forest-500 text-center mb-2">
              Tap to send
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_REPLIES.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={busy}
                  className="rounded-full border border-cream-200 bg-cream-100 px-3.5 py-1.5 text-xs font-semibold text-forest-900 hover:bg-cream-200 transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="px-5 pt-2 text-xs text-red-600">{error}</p>}

          <form onSubmit={handleSubmit} className="flex items-end gap-3 p-4">
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Mag-type ng mensahe…"
              className="flex-1 resize-none rounded-2xl border border-cream-200 bg-cream-100 px-4 py-2 text-sm outline-none focus:border-forest-700"
            />
            <button
              type="submit"
              disabled={!text.trim() || busy}
              className="w-10 h-10 shrink-0 rounded-full bg-brand-900 text-brand-50 flex items-center justify-center disabled:opacity-50"
              title="Send"
            >
              ➤
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// variant: "me" (the patient) · "bot" (automated reply) · "staff" (a doctor)
function Bubble({ variant, label, text, time, link, onLink, prefill, onPrefill }) {
  const mine = variant === "me";
  const styles = {
    me: "bg-brand-900 text-brand-50",
    bot: "bg-cream-200 text-forest-950",
    staff: "bg-cream-50 border-2 border-leaf-300 text-forest-950",
  };
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] sm:max-w-md flex flex-col ${mine ? "items-end" : "items-start"}`}>
        {label && (
          <span className={`text-[11px] font-semibold mb-1 px-1 ${variant === "staff" ? "text-forest-800" : "text-forest-500"}`}>
            {label}
          </span>
        )}
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line break-words ${styles[variant]}`}>
          {text}
        </div>
        {prefill && (
          <button
            onClick={() => onPrefill(prefill)}
            className="mt-2 rounded-full bg-brand-900 text-brand-50 text-xs font-semibold px-3.5 py-1.5 hover:opacity-90 transition-opacity"
          >
            I-fill up ang form dito ↓
          </button>
        )}
        {link && (
          <button
            onClick={() => onLink(link.to)}
            className="mt-2 rounded-full bg-brand-900 text-brand-50 text-xs font-semibold px-3.5 py-1.5 hover:opacity-90 transition-opacity"
          >
            {link.label} →
          </button>
        )}
        {time && <span className="text-[10px] text-forest-500 mt-1 px-1">{time}</span>}
      </div>
    </div>
  );
}