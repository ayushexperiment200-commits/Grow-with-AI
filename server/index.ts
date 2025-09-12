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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(apiKey) });
});

app.post('/api/news', async (req, res) => {
  try {
    if (!genai) return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });
    const { topics, minArticles } = req.body as { topics: string[]; minArticles: number };
    if (!Array.isArray(topics) || !topics.length) return res.status(400).json({ error: 'topics required' });
    const min = typeof minArticles === 'number' && minArticles > 0 ? minArticles : 5;

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
    if (!Array.isArray(articles) || articles.length === 0) throw new Error('No articles returned');
    res.json(articles);
  } catch (err) {
    console.error('[/api/news] error', err);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

app.post('/api/newsletter', async (req, res) => {
  try {
    if (!genai) return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });
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

    const response = await genai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
    const newsletterHtml = response.text;
    if (!newsletterHtml) throw new Error('Empty newsletter');
    res.json({ html: newsletterHtml });
  } catch (err) {
    console.error('[/api/newsletter] error', err);
    res.status(500).json({ error: 'Failed to generate newsletter' });
  }
});

app.post('/api/image', async (req, res) => {
  try {
    if (!genai) return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });
    const { prompt } = req.body as { prompt: string };
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt required' });

    const response = await genai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt,
      config: { numberOfImages: 1, outputMimeType: 'image/png', aspectRatio: '16:9' },
    });

    if (!response.generatedImages || response.generatedImages.length === 0) throw new Error('No image');
    const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
    res.json({ imageBase64: base64ImageBytes });
  } catch (err) {
    console.error('[/api/image] error', err);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

app.post('/api/refine', async (req, res) => {
  try {
    if (!genai) return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });
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

    const response = await genai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
    const resultText = response.text.trim();
    if (!resultText) throw new Error('Empty refinement');
    res.json({ result: resultText });
  } catch (err) {
    console.error('[/api/refine] error', err);
    res.status(500).json({ error: 'Failed to refine newsletter' });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 5174;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

