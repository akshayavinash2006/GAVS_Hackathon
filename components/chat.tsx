"use client";

import { Mic, Send, Sparkles, Square, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/util";

interface Msg {
  role: "user" | "assistant";
  text: string;
  steps?: { tool: string; result: string }[];
  orderIds?: string[];
}

/** Bold (**x** or *x*) inside a line, as React nodes. Never injects HTML. */
function inline(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) || /^\*[^*\s][^*]*\*$/.test(part) ? <strong key={i}>{part.replace(/^\*+|\*+$/g, "")}</strong> : part,
  );
}

/** Minimal rendering for the model's replies: paragraphs, bullet lists and bold. */
function RichText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { indent: boolean; text: string }[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={blocks.length} className="my-1 space-y-1">
        {list.map((li, i) => (
          <li key={i} className={cn("flex gap-2", li.indent && "pl-5")}>
            <span className="text-ink-3">•</span>
            <span>{inline(li.text)}</span>
          </li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const line of text.split("\n")) {
    const bullet = line.match(/^(\s*)(?:[*\-•]|\d+\.)\s+(.*)$/);
    if (bullet) {
      list.push({ indent: bullet[1].length >= 2, text: bullet[2] });
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    else if (blocks.length) blocks.push(<div key={blocks.length} className="h-2" />);
  }
  flush();
  return <div className="space-y-0.5">{blocks}</div>;
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = rej;
    r.readAsDataURL(b);
  });
}

export function Chat({ suggestions, aiEnabled }: { suggestions: string[]; aiEnabled: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [msgs, busy]);

  async function send(text: string, audio?: { base64: string; mimeType: string }) {
    if (busy || (!text.trim() && !audio)) return;
    const history = msgs.slice(-8).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: "user", text: audio ? "🎤 Voice note" : text }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, history, audio }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setMsgs((m) => [...m, { role: "assistant", text: data.text, steps: data.steps, orderIds: data.orderIds }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: `⚠️ ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function toggleMic() {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 1000) return;
        await send(input, { base64: await blobToBase64(blob), mimeType: (rec.mimeType || "audio/webm").split(";")[0] });
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
      setTimeout(() => rec.state === "recording" && rec.stop(), 60_000);
    } catch {
      alert("Microphone not available. Check browser permissions.");
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col">
      <div className="flex-1 space-y-3">
        {msgs.length === 0 && (
          <div className="rise flex flex-col items-center pt-10 text-center">
            <div className="relative">
              <span className="absolute inset-0 rounded-full bg-brand/30 blur-2xl" />
              <span className="btn-glow relative grid h-16 w-16 place-items-center rounded-3xl text-brand-ink">
                <Sparkles className="h-7 w-7" />
              </span>
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">How can I help?</h1>
            <p className="mt-1 text-sm text-ink-3">Type or hold the mic, in any language</p>
            {!aiEnabled && <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning-text">Set GEMINI_API_KEY to enable the agent</p>}
            <div className="mt-8 grid w-full grid-cols-2 gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rise lift rounded-2xl border border-line bg-surface px-3 py-3 text-left text-sm text-ink-2 hover:text-ink"
                  style={{ ["--d" as string]: `${80 + i * 40}ms` }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "rise max-w-[88%] px-4 py-3 text-[15px] leading-relaxed",
                m.role === "user" ? "rounded-3xl rounded-br-md bg-gradient-to-br from-brand to-brand-2 font-medium text-brand-ink" : "rounded-3xl rounded-bl-md border border-line bg-surface",
              )}
            >
              {m.role === "assistant" ? <RichText text={m.text} /> : <div className="whitespace-pre-wrap">{m.text}</div>}
              {m.steps && m.steps.length > 0 && (
                <details className="mt-2 text-xs text-ink-3">
                  <summary className="flex cursor-pointer list-none items-center gap-1">
                    <Wrench className="h-3 w-3" /> {m.steps.map((s) => s.tool.replace(/_/g, " ")).join(" → ")}
                  </summary>
                  <ul className="mt-1 space-y-1">
                    {m.steps.map((s, j) => (
                      <li key={j} className="break-all font-mono text-[11px]">
                        {s.tool}: {s.result.slice(0, 220)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {m.orderIds && m.orderIds.length > 0 && (
                <Link href="/orders" className="mt-3 inline-block rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand">
                  Review draft order →
                </Link>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex w-fit items-center gap-1.5 rounded-3xl rounded-bl-md border border-line bg-surface px-4 py-3.5" aria-label="thinking…">
            {[0, 150, 300].map((d) => (
              <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-24 mt-4 flex items-center gap-2 rounded-3xl border border-line-strong bg-surface/90 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl"
      >
        <button
          type="button"
          onClick={toggleMic}
          disabled={busy || !aiEnabled}
          aria-label={recording ? "Stop recording" : "Record voice note"}
          className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-2xl transition", recording ? "pulse-dot bg-critical text-white" : "bg-surface-3 text-ink-2")}
        >
          {recording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={recording ? "Recording… tap ■ to send" : "e.g. Surf ka chhota packet khatam"}
          className="min-w-0 flex-1 bg-transparent px-1 outline-none placeholder:text-ink-3"
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="btn-glow grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-brand-ink disabled:opacity-30 disabled:shadow-none">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
