import type { NewsArticle } from '../types';

interface GenerationOptions {
    topics: string[];
    industry: string;
    companyName: string;
    tone: string;
    newsFormat: 'paragraph' | 'bullets';
    wordLength: number;
    additionalInstructions: string;
}

export const fetchTrendingNews = async (topics: string[], minArticles: number): Promise<NewsArticle[]> => {
  const res = await fetch('/api/news', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topics, minArticles })
  });
  if (!res.ok) throw new Error('Failed to fetch news from server');
  const data = await res.json();
  return data as NewsArticle[];
};

export const generateNewsletter = async (articles: NewsArticle[], options: GenerationOptions): Promise<string> => {
  const res = await fetch('/api/newsletter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articles, options })
  });
  if (!res.ok) throw new Error('Failed to generate newsletter');
  const data = await res.json();
  return data.html as string;
};

export const generateHeaderImage = async (prompt: string): Promise<string> => {
  const res = await fetch('/api/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt })
  });
  if (!res.ok) throw new Error('Failed to generate header image');
  const data = await res.json();
  // If server returns PNG bytes, data:image prefix will be added by caller.
  // If server returns SVG, caller can still use the same prefix with correct mime.
  const mime: string = data.mimeType || 'image/png';
  const base64: string = data.imageBase64 as string;
  return `data:${mime};base64,${base64}`;
};

export const refineNewsletter = async (
  currentHtml: string,
  articles: NewsArticle[],
  refinementPrompt: string
): Promise<string> => {
  const res = await fetch('/api/refine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentHtml, articles, refinementPrompt })
  });
  if (!res.ok) throw new Error('Failed to refine newsletter');
  const data = await res.json();
  return data.result as string;
};