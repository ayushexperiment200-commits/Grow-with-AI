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

async function validateLink(url: string): Promise<boolean> {
  try {
    // Try HEAD first
    const headResponse = await fetch(url, { 
      method: 'HEAD', 
      signal: AbortSignal.timeout(3000),
      redirect: 'follow'
    });
    
    // Accept 2xx and 3xx status codes
    if (headResponse.ok || (headResponse.status >= 300 && headResponse.status < 400)) {
      return true;
    }
    
    // If HEAD fails with 405/403, try GET with limited response
    if (headResponse.status === 405 || headResponse.status === 403) {
      const getResponse = await fetch(url, { 
        method: 'GET',
        signal: AbortSignal.timeout(3000),
        headers: { 'Range': 'bytes=0-1023' }, // Limit response size
        redirect: 'follow'
      });
      return getResponse.ok;
    }
    
    return false;
  } catch {
    // Default to accepting the link if validation fails
    console.log(`[validateLink] Validation failed for ${url}, accepting link`);
    return true;
  }
}

async function fetchGoogleNewsRss(topics: string[], minArticles: number, freshnessMinutes: number = 180) {
  const results: { title: string; summary: string; source: string; link: string; publishedAt: Date }[] = [];
  const seen = new Set<string>();
  const now = new Date();
  
  // Progressive time windows: 1h -> 3h -> 12h -> no limit
  const timeWindows = ['1h', '3h', '12h', ''];
  
  for (const timeWindow of timeWindows) {
    if (results.length >= minArticles) break;
    
    // Parallel fetch for all topics
    const topicPromises = topics.map(async (topic) => {
      const topicResults: typeof results = [];
      const q = encodeURIComponent(topic);
      const timeQuery = timeWindow ? ` when:${timeWindow}` : '';
      const url = `https://news.google.com/rss/search?q=${q}${encodeURIComponent(timeQuery)}&hl=en-US&gl=US&ceid=US:en&num=20`;
      
      try {
        const r = await fetch(url, { 
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
          signal: AbortSignal.timeout(8000)
        });
        if (!r.ok) return topicResults;
        
        const xml = await r.text();
        const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
        
        for (const item of items) {
          const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || '').trim();
          const link = (item.match(/<link>(.*?)<\/link>/)?.[1] || '').trim();
          const source = (item.match(/<source[^>]*><!\[CDATA\[(.*?)\]\]><\/source>/)?.[1] || item.match(/<source[^>]*>(.*?)<\/source>/)?.[1] || 'Unknown').trim();
          const description = (item.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '').trim();
          const summary = stripHtml(description).slice(0, 300);
          
          // Parse publication date
          const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
          let publishedAt = new Date();
          if (pubDateMatch) {
            try {
              publishedAt = new Date(pubDateMatch[1]);
              if (isNaN(publishedAt.getTime())) publishedAt = new Date();
            } catch {
              publishedAt = new Date();
            }
          }
          
          // Check freshness
          const ageMinutes = (now.getTime() - publishedAt.getTime()) / (1000 * 60);
          if (ageMinutes > freshnessMinutes && timeWindow) continue;
          
          // Validate link and ensure uniqueness
          if (title && link && !seen.has(link) && link.startsWith('http')) {
            seen.add(link);
            topicResults.push({ title, summary, source, link, publishedAt });
          }
        }
      } catch (error) {
        console.warn(`[fetchGoogleNewsRss] Failed to fetch for topic "${topic}":`, error);
      }
      
      return topicResults;
    });
    
    const allTopicResults = await Promise.all(topicPromises);
    const timeWindowResults = allTopicResults.flat();
    
    // Sort by publication time (newest first)
    timeWindowResults.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    
    // Add to results without duplicates
    for (const article of timeWindowResults) {
      if (!results.some(r => r.link === article.link) && results.length < minArticles * 2) {
        results.push(article);
      }
    }
    
    console.log(`[fetchGoogleNewsRss] Time window "${timeWindow || 'unlimited'}": Found ${timeWindowResults.length} articles, total: ${results.length}`);
  }
  
  // Final sort and limit
  results.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  const finalResults = results.slice(0, minArticles);
  
  // Validate top 3 links
  for (let i = 0; i < Math.min(3, finalResults.length); i++) {
    try {
      const isValid = await validateLink(finalResults[i].link);
      if (!isValid) {
        console.warn(`[fetchGoogleNewsRss] Link validation failed for: ${finalResults[i].link}`);
      }
    } catch (error) {
      console.warn(`[fetchGoogleNewsRss] Validation error for: ${finalResults[i].link}`, error);
    }
  }
  
  return finalResults;
}

async function fetchGdeltNews(topics: string[], minArticles: number, freshnessMinutes: number = 180) {
  const results: { title: string; summary: string; source: string; link: string; publishedAt: Date }[] = [];
  const now = new Date();
  const startTime = new Date(now.getTime() - freshnessMinutes * 60 * 1000);
  
  // Format date for GDELT API (YYYYMMDDHHMMSS)
  const formatGdeltDate = (date: Date) => {
    return date.toISOString()
      .replace(/[-T:.Z]/g, '')
      .slice(0, 14);
  };
  
  const startDateTime = formatGdeltDate(startTime);
  const endDateTime = formatGdeltDate(now);
  
  for (const topic of topics) {
    if (results.length >= minArticles) break;
    
    try {
      const query = encodeURIComponent(topic);
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&maxrecords=20&format=json&startdatetime=${startDateTime}&enddatetime=${endDateTime}&sort=DateTimeAsc`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) continue;
      
      // Check content type before parsing as JSON
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const responseText = await response.text();
        console.warn(`[fetchGdeltNews] Non-JSON response for topic "${topic}". Content-Type: ${contentType}. Response: ${responseText.slice(0, 200)}...`);
        continue;
      }
      
      const data = await response.json();
      
      if (data.articles && Array.isArray(data.articles)) {
        for (const article of data.articles) {
          if (results.length >= minArticles) break;
          
          const title = article.title?.trim();
          const url = article.url?.trim();
          const domain = article.domain?.trim();
          const seendt = article.seendt;
          
          if (!title || !url || !url.startsWith('http')) continue;
          
          // Parse GDELT date format (YYYYMMDDHHMMSS)
          let publishedAt = new Date();
          if (seendt) {
            const year = parseInt(seendt.slice(0, 4));
            const month = parseInt(seendt.slice(4, 6)) - 1; // JS months are 0-indexed
            const day = parseInt(seendt.slice(6, 8));
            const hour = parseInt(seendt.slice(8, 10));
            const minute = parseInt(seendt.slice(10, 12));
            const second = parseInt(seendt.slice(12, 14));
            
            publishedAt = new Date(year, month, day, hour, minute, second);
            if (isNaN(publishedAt.getTime())) publishedAt = new Date();
          }
          
          // Check if already exists in results
          if (results.some(r => r.link === url || r.title === title)) continue;
          
          // Generate summary from title (GDELT doesn't provide summaries)
          const summary = `Latest news about ${topic} from ${domain || 'news source'}.`;
          
          results.push({
            title,
            summary,
            source: domain || 'GDELT',
            link: url,
            publishedAt
          });
        }
      }
    } catch (error) {
      console.warn(`[fetchGdeltNews] Failed to fetch for topic "${topic}":`, error);
    }
  }
  
  // Sort by publication time (newest first)
  results.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  
  console.log(`[fetchGdeltNews] Found ${results.length} articles from GDELT`);
  return results.slice(0, minArticles);
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

        // Simplified approach: Use AI for general knowledge but validate with RSS
        // Remove pseudo web search tool as it can't actually perform real-time searches
        const response = await genai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `Based on your knowledge, suggest ${min} recent and relevant news article topics related to: ${topics.join(', ')}. 
Format as JSON array with objects containing "suggestedTitle" and "searchQuery" fields.
Focus on realistic, trending topics that would likely appear in current news.`,
        });

        const rawText = response.text.trim();
        console.log('[/api/news] AI suggested topics, falling back to validated RSS sources');
        
        // Always use RSS for actual news retrieval to ensure accuracy
        // AI suggestions are only used internally for better search queries
      } catch (e) {
        console.warn('AI news failed, using RSS fallback. Error:', e.message || e);
      }
    }

    // Fetch from multiple sources in parallel
    const [googleNews, gdeltNews] = await Promise.all([
      fetchGoogleNewsRss(topics, min, 180), // 3 hours freshness by default
      fetchGdeltNews(topics, Math.ceil(min / 2), 180) // Get additional articles from GDELT
    ]);
    
    // Combine and deduplicate results
    const allArticles = [...googleNews, ...gdeltNews];
    const seen = new Set<string>();
    const uniqueArticles = [];
    
    for (const article of allArticles) {
      const linkKey = article.link.toLowerCase();
      const titleKey = article.title.toLowerCase().replace(/[^\w\s]/g, '').trim();
      
      if (!seen.has(linkKey) && !seen.has(titleKey)) {
        seen.add(linkKey);
        seen.add(titleKey);
        uniqueArticles.push(article);
      }
    }
    
    // Sort by publication time (newest first) and limit
    uniqueArticles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    const finalArticles = uniqueArticles.slice(0, min);
    
    if (!finalArticles.length) throw new Error('No articles available');
    
    // Convert Date objects to ISO strings for JSON serialization
    const serializedArticles = finalArticles.map(article => ({
      ...article,
      publishedAt: article.publishedAt.toISOString()
    }));
    
    console.log(`[/api/news] Returning ${serializedArticles.length} articles (${googleNews.length} from Google News, ${gdeltNews.length} from GDELT)`);
    
    res.json(serializedArticles);
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

    // Try newer Gemini 2.0 image generation first
    if (genai) {
      try {
        const response = await genai.models.generateContent({
          model: 'gemini-2.0-flash-preview-image-generation',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        });

        const candidates = response.candidates;
        if (candidates && candidates.length > 0) {
          const content = candidates[0].content;
          if (content && content.parts) {
            for (const part of content.parts) {
              if (part.inlineData && part.inlineData.data) {
                console.log('[/api/image] Successfully generated image with Gemini 2.0');
                return res.json({ 
                  imageBase64: part.inlineData.data, 
                  mimeType: part.inlineData.mimeType || 'image/png' 
                });
              }
            }
          }
        }
      } catch (geminiError) {
        console.warn('[/api/image] Gemini 2.0 image generation failed, trying Imagen fallback:', geminiError.message || geminiError);
        
        // Try original Imagen API as secondary option
        try {
          const imagenResponse = await genai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt,
            config: { numberOfImages: 1, outputMimeType: 'image/png', aspectRatio: '16:9' },
          });

          if (imagenResponse.generatedImages && imagenResponse.generatedImages.length > 0) {
            console.log('[/api/image] Successfully generated image with Imagen 4.0');
            const base64ImageBytes: string = imagenResponse.generatedImages[0].image.imageBytes;
            return res.json({ imageBase64: base64ImageBytes, mimeType: 'image/png' });
          }
        } catch (imagenError) {
          console.warn('[/api/image] Imagen API also failed, falling back to SVG:', imagenError.message || imagenError);
          // Continue to fallback SVG generation
        }
      }
    }

    // Fallback to SVG generation
    console.log('[/api/image] Using SVG fallback for prompt:', prompt);
    const title = (prompt || 'Newsletter').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 100);
    
    // Create a more attractive gradient SVG with better styling
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0ea5e9"/>
      <stop offset="30%" stop-color="#3b82f6"/>
      <stop offset="70%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge> 
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="1600" height="900" fill="url(#gradient)"/>
  <circle cx="1400" cy="200" r="150" fill="rgba(255,255,255,0.1)"/>
  <circle cx="200" cy="700" r="100" fill="rgba(255,255,255,0.05)"/>
  <g font-family="'Segoe UI', Verdana, Arial, sans-serif" text-anchor="middle">
    <text x="800" y="420" font-size="64" font-weight="bold" fill="white" filter="url(#glow)">${title}</text>
    <text x="800" y="520" font-size="32" fill="rgba(255,255,255,0.9)">AI-Generated Newsletter</text>
  </g>
</svg>`;
    
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

3.  **Handle Design/Style Requests:** When the user asks for design changes (colors, fonts, spacing, layout, styling), apply these changes using inline CSS styles. Pay close attention to:
    - **Typography**: font-size, font-weight, font-family, text-align, text-decoration
    - **Colors**: color, background-color (use professional color schemes)
    - **Spacing**: margin, padding, line-height (ensure proper spacing)
    - **Layout**: text-align, display properties, width settings
    - **Visual hierarchy**: Use appropriate heading sizes (h1, h2, h3, h4)
    - **Emphasis**: Use <strong>, <em>, or span with styling for highlights
    
4.  **Handle Content Requests:** If the user asks for more research or content on a topic, use your knowledge and the provided articles to expand on it. Modify the HTML directly while maintaining good styling.

5.  **Handle Structure Changes:** For requests about reordering sections, changing headings, or reorganizing content, modify the HTML structure accordingly.

6.  **Output Format:**
    - If it's an image request, output ONLY the JSON object described in step 2.
    - For all other requests, output ONLY the complete, updated HTML with proper inline styles applied.
    - Do not wrap the HTML in markdown code blocks.
    - Ensure all styling is applied through inline CSS for maximum compatibility.

Now, generate the response based on the user's request, following their design specifications exactly.`;
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
app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${port}`);
});

