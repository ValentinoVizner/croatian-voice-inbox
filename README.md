# Croatian Voice Inbox

A phone-friendly Croatian AI note-taking app for home projects. Speak or type a raw note, let Gemini parse it, then organize it by spaces like `Ideja`, `Posao`, `Kupovina`, `Materijal`, `Čekam`, and `Gotovo`.

## Features

- Croatian voice/text capture through a large mobile-first inbox.
- Gemini parsing into name, space, tags, priority, timing, status, dependencies, and notes.
- Supabase auth and row-level secured `items` table.
- Zen-style desktop spaces and mobile-friendly filters.
- Inline editing for parsed fields.

## Getting Started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment

Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://kosnitxxjduwqxvspmzy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

`GEMINI_API_KEY` is only used in the server route. Do not expose it with `NEXT_PUBLIC_`.

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/migrations/001_create_items.sql` in the SQL editor or with Supabase CLI.
3. Enable email magic links in Auth.
4. Add the local and deployed app URLs to Auth redirect URLs.

The migration enables row-level security so users can only read and write their own items.

## Verification

```bash
npm run lint
npm test
npm run build
```

## Deploy On Vercel

1. Import this repository into Vercel.
2. Add the three environment variables above.
3. Set the Vercel URL as a Supabase auth redirect URL.
4. Deploy.

If env vars are missing locally, the UI still opens with sample data, but sync and AI parsing require Supabase and Gemini.
