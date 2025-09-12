import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
if (!apiKey) {
  // Do not throw; allow server to start so healthchecks work. Endpoints will validate.
  console.warn('Warning: GEMINI_API_KEY not set. AI endpoints will return 500 until configured.');
}

const genai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Fallback utilities
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchGoogleNewsRss(topics: string[], minArticles: number) {
  const results: { title: string; summary: string; source: string; link: string }[] = [];
  const seen = new Set<string>();
  for (const topic of topics) {
    const q = encodeURIComponent(topic);
    const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) continue;
      const xml = await r.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const item of items) {
        const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || '').trim();
        const link = (item.match(/<link>(.*?)<\/link>/)?.[1] || '').trim();
        const source = (item.match(/<source[^>]*><!\[CDATA\[(.*?)\]\]><\/source>/)?.[1] || item.match(/<source[^>]*>(.*?)<\/source>/)?.[1] || 'Unknown').trim();
        const description = (item.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '').trim();
        const summary = stripHtml(description).slice(0, 300);
        if (title && link && !seen.has(link)) {
          seen.add(link);
          results.push({ title, summary, source, link });
        }
        if (results.length >= minArticles) break;
      }
    } catch {
      // ignore
    }
    if (results.length >= minArticles) break;
  }
  return results;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(apiKey) });
});

app.post('/api/news', async (req, res) => {
  try {
    const { topics, minArticles } = req.body as { topics: string[]; minArticles: number };
    if (!Array.isArray(topics) || !topics.length) return res.status(400).json({ error: 'topics required' });
    const min = typeof minArticles === 'number' && minArticles > 0 ? minArticles : 5;

    if (genai) {
      try {
        const prompt = `Find the most recent (within the last 48 hours), top trending news articles for the following topics: ${topics.join(', ')}.
Focus on significant developments and announcements. For each article, find its title, a brief summary, the source website, and a direct link.
Return at least ${min} diverse articles in total across all topics. Ensure the links are valid.
Format the output as a valid JSON array of objects, where each object has keys: "title", "summary", "source", and "link".
Do not include any introductory text, closing text, or markdown formatting like \`\`\`json. The entire response should be only the JSON array.`;

        const response = await genai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { tools: [{ googleSearch: {} }] },
        });

        const rawText = response.text.trim();
        const jsonText = rawText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        const articles = JSON.parse(jsonText);
        if (Array.isArray(articles) && articles.length) return res.json(articles);
      } catch (e) {
        console.warn('AI news failed, using RSS fallback');
      }
    }

    const rss = await fetchGoogleNewsRss(topics, min);
    if (!rss.length) throw new Error('No articles available');
    res.json(rss);
  } catch (err) {
    console.error('[/api/news] error', err);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

app.post('/api/newsletter', async (req, res) => {
  try {
    const { articles, options } = req.body as { articles: unknown; options: any };
    const { industry, companyName, tone, newsFormat, wordLength, additionalInstructions } = options || {};
    const articlesJson = JSON.stringify(articles, null, 2);
    const prompt = `
You are an expert content creator for "${companyName}", a leading voice in the ${industry} sector.
Your task is to generate a professional newsletter.
The audience is savvy and expects high-quality, relevant information.

**Newsletter Specifications:**
- **Company:** ${companyName}
- **Industry:** ${industry}
- **Tone:** ${tone}. The writing must reflect this tone consistently.
- **News Format:** Each news summary should be a single ${newsFormat}.
- **Summary Length:** Each summary should be approximately ${wordLength} words.
- **Additional Instructions:** ${additionalInstructions || 'None'}

**Instructions:**
1.  **Main Title:** Create a compelling title for the newsletter that reflects the key themes.
2.  **Introduction:** Write a short, engaging introduction (2-3 sentences) that sets the stage.
3.  **Article Sections:** For each article, create a section with:
    - A clear, bolded heading (<h4>).
    - A summary of the article, adhering to the specified format (paragraph/bullets) and length (~${wordLength} words).
    - A "Read More" link (<a>) to the original article, using the source name as the link text.
4.  **Closing:** Add a brief closing remark.
5.  **Styling:** Generate clean, modern HTML. Do not use inline styles or <style> blocks. Use semantic tags like <h1>, <h2>, <p>, <h4>, <a>, <strong>, <em>, <ul>, <li>, and <hr>.
6.  **Output:** Provide a single block of HTML code, starting with <h1>. Do not wrap it in markdown.

**News Articles Data:**
${articlesJson}`;

    if (genai) {
      const response = await genai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const newsletterHtml = response.text;
      if (!newsletterHtml) throw new Error('Empty newsletter');
      return res.json({ html: newsletterHtml });
    }

    // Fallback deterministic HTML
    const list = Array.isArray(articles) ? (articles as any[]) : [];
    const sections = list.map((a) => {
      const title = String(a.title || '').slice(0, 180);
      const summary = String(a.summary || '').slice(0, 600);
      const link = String(a.link || '#');
      const source = String(a.source || 'Source');
      return newsFormat === 'bullets'
        ? `<section><h4>${title}</h4><ul><li>${summary}</li></ul><p><a href="${link}" target="_blank" rel="noopener noreferrer">${source}</a></p></section>`
        : `<section><h4>${title}</h4><p>${summary}</p><p><a href="${link}" target="_blank" rel="noopener noreferrer">${source}</a></p></section>`;
    }).join('\n');

    const html = `<h1>${companyName} Weekly</h1>\n<h2>${industry} Highlights</h2>\n<p><em>Tone: ${tone}. ${additionalInstructions || ''}</em></p>\n<hr/>${sections}`;
    res.json({ html });
  } catch (err) {
    console.error('[/api/newsletter] error', err);
    res.status(500).json({ error: 'Failed to generate newsletter' });
  }
});

app.post('/api/image', async (req, res) => {
  try {
    const { prompt } = req.body as { prompt: string };
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt required' });

    if (genai) {
      const response = await genai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt,
        config: { numberOfImages: 1, outputMimeType: 'image/png', aspectRatio: '16:9' },
      });

      if (!response.generatedImages || response.generatedImages.length === 0) throw new Error('No image');
      const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
      return res.json({ imageBase64: base64ImageBytes, mimeType: 'image/png' });
    }

    const title = (prompt || 'Newsletter').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 140);
    const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0ea5e9"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><g font-family="Verdana, DejaVu Sans, Arial" text-anchor="middle"><text x="800" y="470" font-size="72" fill="white" opacity="0.95">${title}</text></g></svg>`;
    const base64 = Buffer.from(svg, 'utf8').toString('base64');
    res.json({ imageBase64: base64, mimeType: 'image/svg+xml' });
  } catch (err) {
    console.error('[/api/image] error', err);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

app.post('/api/refine', async (req, res) => {
  try {
    const { currentHtml, articles, refinementPrompt } = req.body as { currentHtml: string; articles: unknown; refinementPrompt: string };
    const prompt = `You are an AI assistant helping a user refine a newsletter. You will be given the current newsletter HTML, the original news articles it was based on, and a user's request for changes. Your task is to process the request and provide an updated newsletter.

**User Request:** "${refinementPrompt}"

**Current Newsletter HTML:**
${currentHtml}

**Original News Articles (for context):**
${JSON.stringify(articles, null, 2)}

**Instructions:**
1.  **Analyze the User Request:** Understand what the user wants to change. This could be content, style, structure, or even the header image.
2.  **Handle Image Requests:** If the user asks for a new image (e.g., "change the image to be about space exploration"), you MUST ONLY respond with a JSON object of this exact format: {"requestType": "image", "newImagePrompt": "a detailed prompt for the new image based on the user request"}. Do not return any HTML or other text.
3.  **Handle Research Requests:** If the user asks for more research or content on a topic, use your knowledge and the provided articles to expand on it. Modify the HTML directly.
4.  **Handle HTML/Style Changes:** For any other request (changing text, headings, reordering sections), you must modify the provided HTML.
    -   Return the FULL, complete, updated HTML for the newsletter body.
5.  **Output Format:**
    -   If it's an image request, output ONLY the JSON object described in step 2.
    -   For all other requests, output ONLY the raw, updated HTML. Do not wrap it in markdown like \`\`\`html.

Now, generate the response based on the user's request.`;
    if (genai) {
      const response = await genai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const resultText = response.text.trim();
      if (!resultText) throw new Error('Empty refinement');
      return res.json({ result: resultText });
    }

    // Fallback: echo current HTML with a note about manual edits
    const fallback = `${currentHtml}\n<!-- Refinement requested: ${refinementPrompt} (AI unavailable) -->`;
    res.json({ result: fallback });
  } catch (err) {
    console.error('[/api/refine] error', err);
    res.status(500).json({ error: 'Failed to refine newsletter' });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 5174;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

