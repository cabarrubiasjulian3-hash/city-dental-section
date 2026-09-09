import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

export default function PatientMessages() {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  function load() {
    api.get("/messages").then(setMessages).catch(() => {});
  }

  useEffect(load, []);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    await api.post("/messages", { body: text });
    setText("");
    load();
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold text-forest-950">Messages</h2>
      <div className="bg-cream-50 border border-cream-200 rounded-2xl flex flex-col h-[520px]">
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {messages.length === 0 && (
            <p className="text-sm text-forest-700 text-center py-10">
              No messages yet. Send a message to the clinic below.
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender === "patient" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-md px-4 py-2 rounded-2xl text-sm ${
                  m.sender === "patient" ? "bg-brand-900 text-brand-50" : "bg-cream-200 text-forest-950"
                }`}
              >
                {m.body}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={send} className="flex items-center gap-3 border-t border-cream-200 p-4">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message to the clinic…"
            className="flex-1 rounded-full border border-cream-200 bg-cream-100 px-4 py-2 text-sm outline-none focus:border-forest-700"
          />
          <button className="w-10 h-10 rounded-full bg-brand-900 text-brand-50 flex items-center justify-center">➤</button>
        </form>
      </div>
    </div>
  );
}