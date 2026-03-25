import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
const SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL || "gpt-4.1-mini";
const MAX_AUDIO_FILE_MB = Number(process.env.MAX_AUDIO_FILE_MB || "20");
const MAX_TRANSCRIPT_CHARS = Number(process.env.MAX_TRANSCRIPT_CHARS || "45000");
const RATE_LIMIT_PER_HOUR = Number(process.env.CALL_SUMMARY_RATE_LIMIT_PER_HOUR || "15");

type RateLimitEntry = { count: number; windowStart: number };

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

// In-memory rate limiter (resets on cold start — fine for MVP)
const globalRef = globalThis as typeof globalThis & {
  __csRateLimitStore?: Map<string, RateLimitEntry>;
};
const rateLimitStore =
  globalRef.__csRateLimitStore || (globalRef.__csRateLimitStore = new Map());

function getIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0]?.trim() ?? "unknown" : req.headers.get("x-real-ip") ?? "unknown";
}

function checkRate(ip: string): { allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const entry = rateLimitStore.get(ip);

  if (!entry || now - entry.windowStart >= windowMs) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT_PER_HOUR - 1 };
  }

  if (entry.count >= RATE_LIMIT_PER_HOUR) {
    const retryAfterSeconds = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  entry.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_PER_HOUR - entry.count };
}

async function transcribeAudio(file: File): Promise<{ transcript: string; durationSeconds: number | null }> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");

  const form = new FormData();
  form.append("file", file, file.name);
  form.append("model", TRANSCRIBE_MODEL);
  form.append("response_format", "verbose_json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Transcription failed (${res.status}): ${txt}`);
  }

  const payload = await res.json() as { text?: string; duration?: number };
  const transcript = payload.text?.trim() ?? "";

  if (!transcript) throw new Error("Transcription returned empty text.");

  return {
    transcript,
    durationSeconds: typeof payload.duration === "number" ? payload.duration : null,
  };
}

async function summarise(transcript: string): Promise<SummaryPayload> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SUMMARY_MODEL,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "call_summary",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              executiveSummary: { type: "string" },
              keyDecisions: { type: "array", items: { type: "string" } },
              actionItems: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    task: { type: "string" },
                    owner: { type: ["string", "null"] },
                    deadline: { type: ["string", "null"] },
                  },
                  required: ["task", "owner", "deadline"],
                },
              },
              risksConcerns: { type: "array", items: { type: "string" } },
              nextSteps: { type: "array", items: { type: "string" } },
              clientRecap: { type: "string" },
            },
            required: [
              "executiveSummary",
              "keyDecisions",
              "actionItems",
              "risksConcerns",
              "nextSteps",
              "clientRecap",
            ],
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            "You are an expert meeting assistant. Extract only facts from the transcript. Do not invent owners, deadlines, or decisions. Keep all output concise and business-ready.",
        },
        {
          role: "user",
          content:
            "Summarise this client call transcript into the JSON schema provided.\n\nTranscript:\n" +
            transcript,
        },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Summarisation failed (${res.status}): ${txt}`);
  }

  const payload = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Summarisation returned an empty response.");

  let parsed: SummaryPayload;
  try {
    parsed = JSON.parse(content) as SummaryPayload;
  } catch {
    throw new Error("Could not parse summary output from model.");
  }

  return {
    executiveSummary: parsed.executiveSummary?.trim() ?? "",
    keyDecisions: (parsed.keyDecisions ?? []).filter(Boolean),
    actionItems: (parsed.actionItems ?? [])
      .map((a) => ({
        task: a.task?.trim() ?? "",
        owner: a.owner?.trim() || null,
        deadline: a.deadline?.trim() || null,
      }))
      .filter((a) => a.task),
    risksConcerns: (parsed.risksConcerns ?? []).filter(Boolean),
    nextSteps: (parsed.nextSteps ?? []).filter(Boolean),
    clientRecap: parsed.clientRecap?.trim() ?? "",
  };
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const ip = getIp(request);
    const rate = checkRate(ip);

    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again shortly.", retryAfterSeconds: rate.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
    }

    if (audio.size === 0) {
      return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
    }

    const isAudio =
      audio.type.startsWith("audio/") ||
      /\.(mp3|wav|m4a|mp4|mpeg|webm|ogg)$/i.test(audio.name);

    if (!isAudio) {
      return NextResponse.json({ error: "Please upload a supported audio file (MP3, WAV, M4A, MP4, WEBM, OGG)." }, { status: 400 });
    }

    const maxBytes = MAX_AUDIO_FILE_MB * 1024 * 1024;
    if (audio.size > maxBytes) {
      return NextResponse.json(
        { error: `File too large. Maximum is ${MAX_AUDIO_FILE_MB} MB.` },
        { status: 400 }
      );
    }

    const { transcript, durationSeconds } = await transcribeAudio(audio);
    const wasTruncated = transcript.length > MAX_TRANSCRIPT_CHARS;
    const transcriptForSummary = wasTruncated ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) : transcript;
    const summary = await summarise(transcriptForSummary);

    return NextResponse.json({
      fileName: audio.name,
      durationSeconds,
      processingMs: Date.now() - startedAt,
      transcriptPreview: transcriptForSummary.slice(0, 1200),
      transcriptWasTruncated: wasTruncated,
      transcriptCharacterCount: transcript.length,
      remainingRequestsThisHour: rate.remaining,
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
