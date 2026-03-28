# Call Summary MVP

Standalone Next.js 15 + TypeScript app for summarising client call recordings.

## What it does

- Upload audio (MP3/WAV/M4A/MP4/WEBM/OGG)
- Transcribe with Whisper
- Generate structured summary with GPT
- Return executive summary, decisions, action items, risks, next steps, and client recap

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:3000.

## Environment variables

- `OPENAI_API_KEY` required
- `OPENAI_CHEAP_MODE` default `true` (forces cheap model set)
- `OPENAI_CHEAP_TRANSCRIBE_MODEL` default `whisper-1`
- `OPENAI_CHEAP_SUMMARY_MODEL` default `gpt-4.1-mini`
- `OPENAI_TRANSCRIBE_MODEL` used only when `OPENAI_CHEAP_MODE=false`
- `OPENAI_SUMMARY_MODEL` used only when `OPENAI_CHEAP_MODE=false`
- `MAX_SUMMARY_OUTPUT_TOKENS` default `700` (caps summary output spend)
- `MAX_AUDIO_FILE_MB` max upload size
- `MAX_TRANSCRIPT_CHARS` max transcript size
- `CALL_SUMMARY_RATE_LIMIT_PER_HOUR` basic per-IP limiter
- `AUTO_STOP_ON_LARGE_TRANSCRIPT` default `true` (hard-fail if transcript exceeds max)

## Cheap mode behavior

With `OPENAI_CHEAP_MODE=true`, the app always uses the cheap model variables even if more expensive standard model env vars are configured.

## Auto-stop behavior

When `AUTO_STOP_ON_LARGE_TRANSCRIPT=true`, oversized transcripts are rejected with HTTP `413` before summary generation. This prevents additional summarisation spend on very large calls.

## Deploy (Vercel)

1. Push this folder to its own GitHub repository.
2. Import the repo in Vercel.
3. Set required env vars (at minimum `OPENAI_API_KEY`).
4. Deploy.
