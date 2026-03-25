"use client";

import { FormEvent, useRef, useState } from "react";

type ActionItem = {
  task: string;
  owner: string | null;
  deadline: string | null;
};

type SummaryPayload = {
  executiveSummary: string;
  keyDecisions: string[];
  actionItems: ActionItem[];
  risksConcerns: string[];
  nextSteps: string[];
  clientRecap: string;
};

type ApiResult = {
  fileName: string;
  durationSeconds: number | null;
  processingMs: number;
  transcriptPreview: string;
  transcriptWasTruncated: boolean;
  transcriptCharacterCount: number;
  remainingRequestsThisHour: number;
  summary: SummaryPayload;
};

function fmtDuration(s: number | null) {
  if (!s) return null;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [email, setEmail] = useState("");
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [copied, setCopied] = useState(false);

  function pickFile(f: File | null) {
    setFile(f);
    setResult(null);
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;

    setSubmitting(true);
    setError("");
    setResult(null);
    setProgress(10);

    const timer = setInterval(() => {
      setProgress((p) => (p >= 90 ? p : p + 5));
    }, 600);

    try {
      const fd = new FormData();
      fd.append("audio", file, file.name);
      if (email.trim()) fd.append("email", email.trim());

      const res = await fetch("/api/call-summary", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Something went wrong.");

      setResult(data as ApiResult);
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
      setProgress(0);
    } finally {
      clearInterval(timer);
      setSubmitting(false);
    }
  }

  function copyRecap() {
    if (!result) return;
    navigator.clipboard.writeText(result.summary.clientRecap).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <main className="stack" style={{ gap: 28 }}>
      {/* ── Hero ── */}
      <section className="stack" style={{ gap: 12, paddingBottom: 8 }}>
        <span className="eyebrow">Free during beta</span>
        <h1 className="hero-title">
          Turn any client call into a<br />clean summary in seconds
        </h1>
        <p className="hero-sub">
          Upload your recording — you get an executive summary, action
          items, key decisions, risks, next steps, and a polished
          client-ready recap. No sign-up required.
        </p>
      </section>

      {/* ── How it works ── */}
      <div className="steps">
        {[
          { n: "1", title: "Upload audio", body: "MP3, WAV, M4A, MP4, WEBM or OGG up to 20 MB." },
          { n: "2", title: "AI transcribes", body: "Whisper converts the recording to text in seconds." },
          { n: "3", title: "Get your summary", body: "GPT structures decisions, actions, and your client recap." },
        ].map((s) => (
          <div className="step-card" key={s.n}>
            <div className="step-num">{s.n}</div>
            <strong>{s.title}</strong>
            <span className="small">{s.body}</span>
          </div>
        ))}
      </div>

      {/* ── Upload form ── */}
      <section className="card stack">
        <h2 style={{ fontSize: 20 }}>Try it now — free, no account needed</h2>

        <form className="stack" onSubmit={onSubmit}>
          {/* Drop zone */}
          <div
            className={`upload-zone${dragging ? " drag-over" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files?.[0] ?? null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            <div className="upload-icon">🎙</div>
            {file ? (
              <>
                <strong>{file.name}</strong>
                <p className="small">{(file.size / 1024 / 1024).toFixed(2)} MB · click to change</p>
              </>
            ) : (
              <>
                <strong>Drag and drop your call recording here</strong>
                <p className="small">or click to browse · MP3, WAV, M4A, MP4, WEBM, OGG · max 20 MB</p>
              </>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.mp4,.mpeg,.webm,.ogg"
            style={{ display: "none" }}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />

          <div className="row">
            <input
              type="email"
              placeholder="Email (optional — we'll never spam you)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn-primary" type="submit" disabled={!file || submitting}>
              {submitting ? "Processing…" : "Generate summary →"}
            </button>
          </div>

          {submitting && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="small">Transcribing and summarising your call…</span>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {error && <p className="error-msg">{error}</p>}
        </form>
      </section>

      {/* ── Result ── */}
      {result && (
        <section className="card stack" style={{ gap: 24 }}>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ fontSize: 20 }}>Your call summary</h2>
            <span className="small">
              {result.fileName}
              {fmtDuration(result.durationSeconds) ? ` · ${fmtDuration(result.durationSeconds)}` : ""}
              {" · "}{(result.processingMs / 1000).toFixed(1)}s to process
            </span>
          </div>

          {/* Executive summary */}
          <div className="stack" style={{ gap: 6 }}>
            <p className="section-label">Executive summary</p>
            <p style={{ lineHeight: 1.75 }}>{result.summary.executiveSummary}</p>
          </div>

          <div className="cols-2">
            {/* Key decisions */}
            <div className="stack" style={{ gap: 6 }}>
              <p className="section-label">Key decisions</p>
              <ul className="clean">
                {result.summary.keyDecisions.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>

            {/* Risks */}
            <div className="stack" style={{ gap: 6 }}>
              <p className="section-label">Risks / concerns</p>
              <ul className="clean">
                {result.summary.risksConcerns.length
                  ? result.summary.risksConcerns.map((r, i) => <li key={i}>{r}</li>)
                  : <li style={{ color: "#6b7280" }}>None identified</li>}
              </ul>
            </div>
          </div>

          {/* Action items */}
          <div className="stack" style={{ gap: 6 }}>
            <p className="section-label">Action items</p>
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Owner</th>
                  <th>Deadline</th>
                </tr>
              </thead>
              <tbody>
                {result.summary.actionItems.map((a, i) => (
                  <tr key={i}>
                    <td>{a.task}</td>
                    <td>{a.owner ?? "—"}</td>
                    <td>{a.deadline ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Next steps */}
          <div className="stack" style={{ gap: 6 }}>
            <p className="section-label">Next steps</p>
            <ul className="clean">
              {result.summary.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>

          {/* Client recap */}
          <div className="stack" style={{ gap: 8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <p className="section-label" style={{ marginBottom: 0 }}>Client-ready recap</p>
              <button className="copy-btn" onClick={copyRecap} type="button">
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <div className="recap-box">{result.summary.clientRecap}</div>
          </div>

          {/* Transcript preview */}
          <details>
            <summary>Transcript preview ({result.transcriptCharacterCount.toLocaleString()} chars)</summary>
            <pre>
              {result.transcriptPreview}
              {result.transcriptWasTruncated ? "\n\n[Transcript truncated — only first 45,000 chars summarised]" : ""}
            </pre>
          </details>

          <p className="small">
            Requests remaining this hour: <strong>{result.remainingRequestsThisHour}</strong>
          </p>
        </section>
      )}

      {/* ── Pricing callout ── */}
      <section className="card" style={{ textAlign: "center", background: "linear-gradient(135deg, rgba(238,242,255,0.9), rgba(245,243,255,0.9))" }}>
        <div className="stack" style={{ gap: 8, alignItems: "center" }}>
          <h2 style={{ fontSize: 22 }}>Want unlimited summaries?</h2>
          <p className="hero-sub" style={{ fontSize: 16, maxWidth: 480 }}>
            During beta this is completely free. When we launch pricing it will be
            2 € per call or 19 €/month unlimited. Lock in early access below.
          </p>
          <a href="mailto:your@email.com?subject=CallSnap early access" style={{ textDecoration: "none" }}>
            <button className="btn-primary" type="button">Get early access →</button>
          </a>
        </div>
      </section>
    </main>
  );
}
