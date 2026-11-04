import { useCallback, useEffect, useRef, useState } from "react";

// Website-wide "interactive" layer. Drop it around <App /> once (see main.jsx) and every page
// gets, without editing the pages themselves:
//   - toast messages after saving / adding / removing something (and when the server says no)
//   - a thin loading bar at the top while the server is working
//   - keyboard shortcuts:  "/" jumps to the search box,  Esc closes the open pop-up
// Animations and hover effects live in interactive.css.

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

// Requests that should stay quiet (login, chat, polling...).
const QUIET = /\/(auth|forgot-password|messages|notifications|chatbot|vitals-poll)(\/|$|\?)/;

// "/dental-records/12" -> "service record", so the toast says what was saved.
const NOUNS = [
  [/\/dental-records/, "service record"],
  [/\/tooth-chart/, "tooth chart"],
  [/\/vitals/, "vital signs"],
  [/\/patients/, "patient"],
  [/\/staff/, "staff"],
  [/\/monthly-reports?/, "report"],
  [/\/(barangay-)?schedule|\/rotations?/, "schedule"],
  [/\/archive/, "archive"],
  [/\/access-codes?|\/doctor-access/, "access code"],
];
const nounFor = (path) => (NOUNS.find(([re]) => re.test(path)) || [null, "changes"])[1];

const VERB = { POST: "Added", PUT: "Saved", PATCH: "Saved", DELETE: "Removed" };

export default function InteractiveLayer({ children }) {
  const [toasts, setToasts] = useState([]);
  const [busy, setBusy] = useState(0);
  const idRef = useRef(1);
  const successTimer = useRef(null);
  const lastSuccess = useRef("");

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (text, tone = "ok") => {
      const id = idRef.current++;
      setToasts((t) => [...t.filter((x) => x.text !== text).slice(-3), { id, text, tone }]);
      setTimeout(() => dismiss(id), tone === "error" ? 6000 : 2800);
    },
    [dismiss]
  );

  // Watches the app's own server calls (not by changing api.js): one toast per action, even
  // if a single click makes several requests (e.g. saving a record + its teeth).
  useEffect(() => {
    const realFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input?.url || "";
      const method = String(init?.method || (typeof input !== "string" && input?.method) || "GET").toUpperCase();
      const ours = url.startsWith(API_URL);
      if (!ours) return realFetch(input, init);

      setBusy((n) => n + 1);
      try {
        const res = await realFetch(input, init);
        const path = url.slice(API_URL.length);
        if (method !== "GET" && !QUIET.test(path)) {
          if (res.ok) {
            lastSuccess.current = `${VERB[method] || "Saved"} — ${nounFor(path)}`;
            clearTimeout(successTimer.current);
            successTimer.current = setTimeout(() => push(lastSuccess.current, "ok"), 500);
          } else if (res.status !== 401) {
            let msg = `Something went wrong (${res.status}).`;
            try {
              msg = (await res.clone().json()).error || msg;
            } catch {
              /* keep the default message */
            }
            push(msg, "error");
          }
        }
        return res;
      } catch (err) {
        if (method !== "GET") push("Can't reach the server. Check your connection and try again.", "error");
        throw err;
      } finally {
        setBusy((n) => Math.max(0, n - 1));
      }
    };
    return () => {
      window.fetch = realFetch;
      clearTimeout(successTimer.current);
    };
  }, [push]);

  // Keyboard shortcuts.
  useEffect(() => {
    function onKey(e) {
      const el = document.activeElement;
      const typing = el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const search = [...document.querySelectorAll("input")].find(
          (i) => /search/i.test(i.placeholder || "") && i.offsetParent !== null
        );
        if (search) {
          e.preventDefault();
          search.focus();
          search.select();
        }
      }
      if (e.key === "Escape") {
        // The "are you sure?" box (z-70) closes itself; otherwise close the top pop-up.
        if (document.querySelector(".z-\\[70\\]")) return;
        const popups = document.querySelectorAll(".fixed.inset-0.z-50");
        const top = popups[popups.length - 1];
        if (top) top.click();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className={`ix-bar ${busy > 0 ? "ix-bar-on" : ""}`} aria-hidden="true" />
      {children}
      <div className="ix-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <button key={t.id} type="button" className={`ix-toast ix-${t.tone}`} onClick={() => dismiss(t.id)}>
            <span aria-hidden="true">{t.tone === "error" ? "!" : "✓"}</span>
            {t.text}
          </button>
        ))}
      </div>
    </>
  );
}