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
  console.warn('Warning: GEMINI_API_KEY not set. AI endpoints will return 500 until configured.');
}

const genai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Initialize models
const imagenModel = genai ? genai.getGenerativeModel({ model: 'imagen-3.0-generate-001' }) : null;
const geminiModel = genai ? genai.getGenerativeModel({ model: 'gemini-2.0-flash-exp' }) : null;

// Utility functions
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'Unknown Source';
  }
}

function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

// Enhanced Google News RSS fetcher with better error handling
async function fetchGoogleNewsRss(topics: string[], minArticles: number, freshnessHours: number = 6) {
  const results: { title: string; summary: string; source: string; link: string; publishedAt: Date }[] = [];
  const seen = new Set<string>();
  const now = new Date();
  
  console.log(`[fetchGoogleNewsRss] Fetching news for topics: ${topics.join(', ')}`);
  
  // Use multiple time windows for better coverage
  const timeWindows = ['1h', '6h', '24h', ''];
  
  for (const timeWindow of timeWindows) {
    if (results.length >= minArticles) break;
    
    const topicPromises = topics.map(async (topic) => {
      const topicResults: typeof results = [];
      
      try {
        const q = encodeURIComponent(topic.trim());
        const timeQuery = timeWindow ? ` when:${timeWindow}` : '';
        const url = `https://news.google.com/rss/search?q=${q}${encodeURIComponent(timeQuery)}&hl=en-US&gl=US&ceid=US:en&num=20`;
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache'
          },
          signal: AbortSignal.timeout(10000)
        });
        
        if (!response.ok) {
          console.warn(`[fetchGoogleNewsRss] HTTP ${response.status} for topic "${topic}"`);
          return topicResults;
        }
        
        const xml = await response.text();
        
        // More robust XML parsing
        const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
        
        for (const item of items) {
          try {
            // Extract title (handle CDATA)
            const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s);
            const title = titleMatch?.[1]?.trim() || '';
            
            // Extract link
            const linkMatch = item.match(/<link>(.*?)<\/link>/);
            const link = linkMatch?.[1]?.trim() || '';
            
            // Extract source
            const sourceMatch = item.match(/<source[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/source>/s);
            const source = sourceMatch?.[1]?.trim() || extractDomain(link);
            
            // Extract description for summary
            const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
            const description = descMatch?.[1] || '';
            const summary = stripHtml(description).slice(0, 300) || `Latest news about ${topic}`;
            
            // Extract publication date
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
            
            // Validate and add article
            if (title && link && isValidUrl(link) && !seen.has(link)) {
              // Check freshness
              const ageHours = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60);
              if (ageHours <= freshnessHours || !timeWindow) {
                seen.add(link);
                topicResults.push({
                  title: title.slice(0, 200),
                  summary: summary.slice(0, 300),
                  source: source.slice(0, 100),
                  link,
                  publishedAt
                });
              }
            }
          } catch (itemError) {
            console.warn(`[fetchGoogleNewsRss] Error parsing item for topic "${topic}":`, itemError);
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
    
    // Add unique results
    for (const article of timeWindowResults) {
      if (!results.some(r => r.link === article.link) && results.length < minArticles * 2) {
        results.push(article);
      }
    }
    
    console.log(`[fetchGoogleNewsRss] Time window "${timeWindow || 'unlimited'}": Found ${timeWindowResults.length} new articles, total: ${results.length}`);
  }
  
  // Final sort and limit
  results.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return results.slice(0, minArticles);
}

// Enhanced NewsAPI.org integration (free tier: 100 requests/day)
async function fetchNewsAPI(topics: string[], minArticles: number) {
  const results: { title: string; summary: string; source: string; link: string; publishedAt: Date }[] = [];
  
  // NewsAPI.org free tier key (you can get one at https://newsapi.org/)
  const newsApiKey = process.env.NEWS_API_KEY;
  if (!newsApiKey) {
    console.log('[fetchNewsAPI] NEWS_API_KEY not set, skipping NewsAPI.org');
    return results;
  }
  
  try {
    const query = topics.join(' OR ');
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&language=en&pageSize=${Math.min(minArticles * 2, 100)}`;
    
    const response = await fetch(url, {
      headers: {
        'X-API-Key': newsApiKey,
        'User-Agent': 'NewsletterApp/1.0'
      },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      console.warn(`[fetchNewsAPI] HTTP ${response.status}: ${response.statusText}`);
      return results;
    }
    
    const data = await response.json();
    
    if (data.articles && Array.isArray(data.articles)) {
      for (const article of data.articles) {
        if (results.length >= minArticles) break;
        
        const title = article.title?.trim();
        const url = article.url?.trim();
        const description = article.description?.trim() || '';
        const sourceName = article.source?.name?.trim() || extractDomain(url);
        const publishedAt = new Date(article.publishedAt || Date.now());
        
        if (title && url && isValidUrl(url) && !title.includes('[Removed]')) {
          results.push({
            title: title.slice(0, 200),
            summary: description.slice(0, 300) || `News about ${topics[0]}`,
            source: sourceName.slice(0, 100),
            link: url,
            publishedAt
          });
        }
      }
    }
    
    console.log(`[fetchNewsAPI] Found ${results.length} articles from NewsAPI.org`);
  } catch (error) {
    console.warn('[fetchNewsAPI] Error:', error);
  }
  
  return results;
}

// Enhanced GDELT integration with better error handling
async function fetchGdeltNews(topics: string[], minArticles: number, freshnessHours: number = 6) {
  const results: { title: string; summary: string; source: string; link: string; publishedAt: Date }[] = [];
  const now = new Date();
  const startTime = new Date(now.getTime() - freshnessHours * 60 * 60 * 1000);
  
  const formatGdeltDate = (date: Date) => {
    return date.toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
  };
  
  const startDateTime = formatGdeltDate(startTime);
  const endDateTime = formatGdeltDate(now);
  
  for (const topic of topics) {
    if (results.length >= minArticles) break;
    
    try {
      const query = encodeURIComponent(topic.trim());
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&maxrecords=15&format=json&startdatetime=${startDateTime}&enddatetime=${endDateTime}&sort=DateDesc`;
      
      const response = await fetch(url, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(12000)
      });
      
      if (!response.ok) {
        console.warn(`[fetchGdeltNews] HTTP ${response.status} for topic "${topic}"`);
        continue;
      }
      
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.warn(`[fetchGdeltNews] Non-JSON response for topic "${topic}"`);
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
          
          if (!title || !url || !isValidUrl(url)) continue;
          
          // Parse GDELT date format (YYYYMMDDHHMMSS)
          let publishedAt = new Date();
          if (seendt && seendt.length >= 14) {
            try {
              const year = parseInt(seendt.slice(0, 4));
              const month = parseInt(seendt.slice(4, 6)) - 1;
              const day = parseInt(seendt.slice(6, 8));
              const hour = parseInt(seendt.slice(8, 10));
              const minute = parseInt(seendt.slice(10, 12));
              const second = parseInt(seendt.slice(12, 14));
              
              publishedAt = new Date(year, month, day, hour, minute, second);
              if (isNaN(publishedAt.getTime())) publishedAt = new Date();
            } catch {
              publishedAt = new Date();
            }
          }
          
          // Check for duplicates
          if (results.some(r => r.link === url || r.title === title)) continue;
          
          const summary = `Breaking news about ${topic} from ${domain || 'international sources'}.`;
          
          results.push({
            title: title.slice(0, 200),
            summary: summary.slice(0, 300),
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
  
  results.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  console.log(`[fetchGdeltNews] Found ${results.length} articles from GDELT`);
  return results;
}

// Main news aggregation function
async function fetchNewsFromMultipleSources(topics: string[], minArticles: number) {
  console.log(`[fetchNewsFromMultipleSources] Fetching news for topics: ${topics.join(', ')}, minimum articles: ${minArticles}`);
  
  // Fetch from all sources in parallel
  const [googleNews, newsApiResults, gdeltNews] = await Promise.all([
    fetchGoogleNewsRss(topics, Math.ceil(minArticles * 0.6), 6),
    fetchNewsAPI(topics, Math.ceil(minArticles * 0.3)),
    fetchGdeltNews(topics, Math.ceil(minArticles * 0.3), 6)
  ]);
  
  // Combine and deduplicate results
  const allArticles = [...googleNews, ...newsApiResults, ...gdeltNews];
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
  const finalArticles = uniqueArticles.slice(0, minArticles);
  
  console.log(`[fetchNewsFromMultipleSources] Returning ${finalArticles.length} articles (Google: ${googleNews.length}, NewsAPI: ${newsApiResults.length}, GDELT: ${gdeltNews.length})`);
  
  return finalArticles;
}

// API Routes
app.get('/api/health', (_req, res) => {
  res.json({ 
    ok: true, 
    hasApiKey: Boolean(apiKey),
    hasNewsApiKey: Boolean(process.env.NEWS_API_KEY),
    timestamp: new Date().toISOString()
  });
});

app.post('/api/news', async (req, res) => {
  try {
    const { topics, minArticles } = req.body as { topics: string[]; minArticles: number };
    
    if (!Array.isArray(topics) || !topics.length) {
      return res.status(400).json({ error: 'Topics array is required and cannot be empty' });
    }
    
    const min = typeof minArticles === 'number' && minArticles > 0 ? Math.min(minArticles, 20) : 5;
    
    // Validate topics
    const validTopics = topics
      .filter(topic => typeof topic === 'string' && topic.trim().length > 0)
      .map(topic => topic.trim())
      .slice(0, 10); // Limit to 10 topics max
    
    if (!validTopics.length) {
      return res.status(400).json({ error: 'At least one valid topic is required' });
    }
    
    console.log(`[/api/news] Processing request for ${validTopics.length} topics, ${min} articles minimum`);
    
    // Fetch news from multiple sources
    const finalArticles = await fetchNewsFromMultipleSources(validTopics, min);
    
    if (!finalArticles.length) {
      return res.status(404).json({ 
        error: 'No recent articles found for the specified topics. Try different or more general topics.',
        topics: validTopics
      });
    }
    
    // Convert Date objects to ISO strings for JSON serialization
    const serializedArticles = finalArticles.map(article => ({
      ...article,
      publishedAt: article.publishedAt.toISOString()
    }));
    
    console.log(`[/api/news] Successfully returning ${serializedArticles.length} articles`);
    
    res.json(serializedArticles);
  } catch (err) {
    console.error('[/api/news] Error:', err);
    res.status(500).json({ 
      error: 'Failed to fetch news. Please try again later.',
      details: err instanceof Error ? err.message : 'Unknown error'
    });
  }
});

app.post('/api/newsletter', async (req, res) => {
  try {
    const { articles, options } = req.body as { articles: unknown; options: any };
    
    if (!Array.isArray(articles) || articles.length === 0) {
      return res.status(400).json({ error: 'Articles array is required and cannot be empty' });
    }
    
    const { industry, companyName, tone, newsFormat, wordLength, additionalInstructions } = options || {};
    
    const prompt = `You are an expert newsletter writer for "${companyName || 'TechNews'}", a leading voice in the ${industry || 'Technology'} sector.

Create a professional, engaging newsletter based on the following real-time news articles. The newsletter should be well-structured, informative, and tailored to a professional audience.

**Newsletter Specifications:**
- **Company:** ${companyName || 'TechNews'}
- **Industry:** ${industry || 'Technology'}
- **Tone:** ${tone || 'Professional'}
- **Format:** ${newsFormat === 'bullets' ? 'Use bullet points for each news item' : 'Use paragraph format for each news item'}
- **Length:** Each news summary should be approximately ${wordLength || 100} words
- **Additional Instructions:** ${additionalInstructions || 'Focus on the most important and impactful news'}

**Instructions:**
1. Create a compelling newsletter title that reflects the key themes from the articles
2. Write a brief, engaging introduction (2-3 sentences)
3. For each article, create a section with:
   - A clear, descriptive heading
   - A well-written summary following the specified format and length
   - Include the source and a link to read more
4. Add a professional closing
5. Use clean HTML with semantic tags (h1, h2, h3, p, strong, em, ul, li, a)
6. Do not use inline styles or style blocks
7. Return only the HTML content, no markdown formatting

**News Articles to Include:**
${JSON.stringify(articles, null, 2)}

Generate the newsletter now:`;

    if (geminiModel) {
      try {
        console.log('[/api/newsletter] Generating newsletter with Gemini...');
        const result = await geminiModel.generateContent(prompt);
        const newsletterHtml = result.response.text();
        
        if (!newsletterHtml || newsletterHtml.trim().length < 100) {
          throw new Error('Generated newsletter is too short or empty');
        }
        
        console.log('[/api/newsletter] Successfully generated newsletter');
        return res.json({ html: newsletterHtml });
      } catch (error) {
        console.error('[/api/newsletter] Gemini generation failed:', error);
        // Fall through to fallback
      }
    }

    // Enhanced fallback newsletter generation
    console.log('[/api/newsletter] Using enhanced fallback generation');
    const articlesList = Array.isArray(articles) ? articles : [];
    
    const newsletterSections = articlesList.map((article: any, index: number) => {
      const title = String(article.title || `News Item ${index + 1}`).slice(0, 200);
      const summary = String(article.summary || 'No summary available').slice(0, wordLength * 2);
      const source = String(article.source || 'Unknown Source');
      const link = String(article.link || '#');
      
      if (newsFormat === 'bullets') {
        return `<section>
  <h3>${title}</h3>
  <ul>
    <li>${summary}</li>
  </ul>
  <p><strong>Source:</strong> <a href="${link}" target="_blank" rel="noopener noreferrer">${source}</a></p>
</section>`;
      } else {
        return `<section>
  <h3>${title}</h3>
  <p>${summary}</p>
  <p><strong>Source:</strong> <a href="${link}" target="_blank" rel="noopener noreferrer">${source}</a></p>
</section>`;
      }
    }).join('\n\n');

    const fallbackHtml = `<h1>${companyName || 'TechNews'} Newsletter</h1>
<h2>Latest ${industry || 'Technology'} Updates</h2>
<p><em>Stay informed with the latest developments in ${industry || 'technology'}. Here are today's most important stories:</em></p>
<hr/>

${newsletterSections}

<hr/>
<p><em>Thank you for reading ${companyName || 'TechNews'} Newsletter. Stay tuned for more updates!</em></p>`;

    res.json({ html: fallbackHtml });
  } catch (err) {
    console.error('[/api/newsletter] Error:', err);
    res.status(500).json({ error: 'Failed to generate newsletter' });
  }
});

app.post('/api/image', async (req, res) => {
  try {
    const { prompt } = req.body as { prompt: string };
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Use Google Imagen 3.0 for image generation
    if (imagenModel) {
      try {
        console.log('[/api/image] Generating image with Imagen 3.0...');
        const imagenResponse = await imagenModel.generateImages({
          prompt: prompt.slice(0, 1000), // Limit prompt length
          numberOfImages: 1,
          outputMimeType: 'image/png',
          aspectRatio: '16:9'
        });

        if (imagenResponse.generatedImages && imagenResponse.generatedImages.length > 0) {
          console.log('[/api/image] Successfully generated image with Imagen 3.0');
          const base64ImageBytes = imagenResponse.generatedImages[0].image.imageBytes;
          return res.json({ imageBase64: base64ImageBytes, mimeType: 'image/png' });
        }
      } catch (imagenError) {
        console.warn('[/api/image] Imagen API failed, falling back to SVG:', imagenError.message || imagenError);
      }
    }

    // Enhanced SVG fallback with better design
    console.log('[/api/image] Using enhanced SVG fallback');
    const title = prompt.replace(/[<>&"']/g, '').slice(0, 80);
    
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0ea5e9"/>
      <stop offset="25%" stop-color="#3b82f6"/>
      <stop offset="50%" stop-color="#6366f1"/>
      <stop offset="75%" stop-color="#8b5cf6"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
      <feMerge> 
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <pattern id="dots" patternUnits="userSpaceOnUse" width="40" height="40">
      <circle cx="20" cy="20" r="2" fill="rgba(255,255,255,0.1)"/>
    </pattern>
  </defs>
  <rect width="1600" height="900" fill="url(#gradient)"/>
  <rect width="1600" height="900" fill="url(#dots)"/>
  <circle cx="1400" cy="200" r="120" fill="rgba(255,255,255,0.08)"/>
  <circle cx="200" cy="700" r="80" fill="rgba(255,255,255,0.06)"/>
  <circle cx="1200" cy="750" r="60" fill="rgba(255,255,255,0.04)"/>
  <g font-family="'Segoe UI', system-ui, -apple-system, sans-serif" text-anchor="middle">
    <text x="800" y="400" font-size="56" font-weight="700" fill="white" filter="url(#glow)">${title}</text>
    <text x="800" y="480" font-size="28" font-weight="400" fill="rgba(255,255,255,0.9)">AI-Powered Newsletter</text>
    <text x="800" y="520" font-size="20" font-weight="300" fill="rgba(255,255,255,0.7)">Real-time News Research</text>
  </g>
</svg>`;
    
    const base64 = Buffer.from(svg, 'utf8').toString('base64');
    res.json({ imageBase64: base64, mimeType: 'image/svg+xml' });
  } catch (err) {
    console.error('[/api/image] Error:', err);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

app.post('/api/refine', async (req, res) => {
  try {
    const { currentHtml, articles, refinementPrompt } = req.body as { 
      currentHtml: string; 
      articles: unknown; 
      refinementPrompt: string 
    };
    
    if (!currentHtml || !refinementPrompt) {
      return res.status(400).json({ error: 'Current HTML and refinement prompt are required' });
    }
    
    const prompt = `You are an AI assistant helping a user refine a newsletter. You will be given the current newsletter HTML, the original news articles it was based on, and a user's request for changes.

**User Request:** "${refinementPrompt}"

**Current Newsletter HTML:**
${currentHtml}

**Original News Articles (for context):**
${JSON.stringify(articles, null, 2)}

**Instructions:**
1. **Analyze the User Request:** Understand what the user wants to change. This could be content, style, structure, or even the header image.

2. **Handle Image Requests:** If the user asks for a new image (e.g., "change the image to be about space exploration"), you MUST ONLY respond with a JSON object of this exact format: {"requestType": "image", "newImagePrompt": "a detailed prompt for the new image based on the user request"}. Do not return any HTML or other text.

3. **Handle Design/Style Requests:** When the user asks for design changes (colors, fonts, spacing, layout, styling), apply these changes using inline CSS styles. Pay close attention to:
   - **Typography**: font-size, font-weight, font-family, text-align, text-decoration
   - **Colors**: color, background-color (use professional color schemes)
   - **Spacing**: margin, padding, line-height (ensure proper spacing)
   - **Layout**: text-align, display properties, width settings
   - **Visual hierarchy**: Use appropriate heading sizes (h1, h2, h3, h4)
   - **Emphasis**: Use <strong>, <em>, or span with styling for highlights

4. **Handle Content Requests:** If the user asks for more research or content on a topic, use your knowledge and the provided articles to expand on it. Modify the HTML directly while maintaining good styling.

5. **Handle Structure Changes:** For requests about reordering sections, changing headings, or reorganizing content, modify the HTML structure accordingly.

6. **Output Format:**
   - If it's an image request, output ONLY the JSON object described in step 2.
   - For all other requests, output ONLY the complete, updated HTML with proper inline styles applied.
   - Do not wrap the HTML in markdown code blocks.
   - Ensure all styling is applied through inline CSS for maximum compatibility.

Now, generate the response based on the user's request.`;

    if (geminiModel) {
      try {
        console.log('[/api/refine] Refining newsletter with Gemini...');
        const result = await geminiModel.generateContent(prompt);
        const resultText = result.response.text().trim();
        
        if (!resultText) throw new Error('Empty refinement result');
        
        console.log('[/api/refine] Successfully refined newsletter');
        return res.json({ result: resultText });
      } catch (error) {
        console.error('[/api/refine] Gemini refinement failed:', error);
      }
    }

    // Fallback: return current HTML with a note
    console.log('[/api/refine] Using fallback refinement');
    const fallback = `${currentHtml}\n<!-- Refinement requested: ${refinementPrompt} (AI refinement unavailable) -->`;
    res.json({ result: fallback });
  } catch (err) {
    console.error('[/api/refine] Error:', err);
    res.status(500).json({ error: 'Failed to refine newsletter' });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 5174;
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server listening on http://0.0.0.0:${port}`);
  console.log(`📰 News sources: Google News RSS, ${process.env.NEWS_API_KEY ? 'NewsAPI.org' : 'NewsAPI.org (disabled)'}, GDELT`);
  console.log(`🤖 AI features: ${apiKey ? 'Enabled' : 'Disabled (set GEMINI_API_KEY)'}`);
});