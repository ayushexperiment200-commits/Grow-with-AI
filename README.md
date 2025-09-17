# Grow With AI

A full-stack AI newsletter generator built with Vite + React and an Express server using Google's Gemini API.

## Features

- **Real-time News Research**: Fetches latest trending news from multiple sources
- **AI-Powered Content Generation**: Uses Google Gemini for newsletter creation
- **Multiple News Sources**: 
  - Google News RSS (primary source)
  - NewsAPI.org (optional, 100 free requests/day)
  - GDELT Project (global news database)
- **Smart Deduplication**: Removes duplicate articles across sources
- **Customizable Output**: Control tone, format, length, and industry focus
- **Header Image Generation**: AI-generated images with fallback to SVG
- **Newsletter Refinement**: Natural language editing of generated content

## Quick Start

1. Copy env and set your key:

```
cp .env.example .env
```

Edit `.env` and configure your API keys:
- `GEMINI_API_KEY`: Required for AI features (get from [Google AI Studio](https://aistudio.google.com/app/apikey))
- `NEWS_API_KEY`: Optional for NewsAPI.org integration (get from [NewsAPI.org](https://newsapi.org/register))

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

## News Sources

The app uses multiple news sources for comprehensive coverage:

1. **Google News RSS** (Primary): Free, real-time news from Google News
2. **NewsAPI.org** (Optional): 100 free requests/day, high-quality articles
3. **GDELT Project** (Supplementary): Global news database with extensive coverage

All sources are automatically deduplicated and sorted by publication time.

## API Endpoints

- `POST /api/news` - Fetch trending news articles
- `POST /api/newsletter` - Generate newsletter from articles
- `POST /api/image` - Generate header images
- `POST /api/refine` - Refine existing newsletters
- `GET /api/health` - Check API status

## Production

Build the client:

```
npm run build
```

Host the static `dist/` with your preferred platform and deploy the server from `server/index.ts` (Node 18+). 

Required environment variables:
- `GEMINI_API_KEY`: For AI features
- `NEWS_API_KEY`: Optional for enhanced news coverage
- `PORT`: Server port (default: 5174)
