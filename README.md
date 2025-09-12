# Grow With AI

A full-stack AI newsletter generator built with Vite + React and an Express server using Google's Gemini API.

## Quick Start

1. Copy env and set your key:

```
cp .env.example .env
```

Edit `.env` and set `GEMINI_API_KEY` to your Google AI Studio key.

2. Install dependencies:

```
npm install
```

3. Run dev (client + server):

```
npm run dev
```

This starts:
- Client at http://localhost:5173
- Server at http://localhost:5174

Vite proxies `/api/*` to the server in development.

## Production

Build the client:

```
npm run build
```

Host the static `dist/` with your preferred platform and deploy the server from `server/index.ts` (Node 18+). Ensure environment variable `GEMINI_API_KEY` is set.
