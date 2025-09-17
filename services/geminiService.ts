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
  if (!topics.length) {
    throw new Error('At least one topic is required');
  }
  
  const res = await fetch('/api/news', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topics, minArticles })
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch news: ${res.status} ${res.statusText}`);
  }
  
  const data = await res.json();
  
  if (!Array.isArray(data)) {
    throw new Error('Invalid response format from news API');
  }
  
  return data as NewsArticle[];
};

export const generateNewsletter = async (articles: NewsArticle[], options: GenerationOptions): Promise<string> => {
  if (!articles.length) {
    throw new Error('At least one article is required to generate a newsletter');
  }
  
  const res = await fetch('/api/newsletter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articles, options })
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to generate newsletter: ${res.status} ${res.statusText}`);
  }
  
  const data = await res.json();
  
  if (!data.html || typeof data.html !== 'string') {
    throw new Error('Invalid newsletter response format');
  }
  
  return data.html as string;
};

export const generateHeaderImage = async (prompt: string): Promise<string> => {
  if (!prompt.trim()) {
    throw new Error('Image prompt cannot be empty');
  }
  
  const res = await fetch('/api/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: prompt.trim() })
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to generate image: ${res.status} ${res.statusText}`);
  }
  
  const data = await res.json();
  
  if (!data.imageBase64 || !data.mimeType) {
    throw new Error('Invalid image response format');
  }
  
  const mime: string = data.mimeType || 'image/png';
  const base64: string = data.imageBase64 as string;
  return `data:${mime};base64,${base64}`;
};

export const refineNewsletter = async (
  currentHtml: string,
  articles: NewsArticle[],
  refinementPrompt: string
): Promise<string> => {
  if (!currentHtml.trim()) {
    throw new Error('Current newsletter HTML is required');
  }
  
  if (!refinementPrompt.trim()) {
    throw new Error('Refinement prompt cannot be empty');
  }
  
  const res = await fetch('/api/refine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      currentHtml: currentHtml.trim(), 
      articles, 
      refinementPrompt: refinementPrompt.trim() 
    })
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to refine newsletter: ${res.status} ${res.statusText}`);
  }
  
  const data = await res.json();
  
  if (!data.result || typeof data.result !== 'string') {
    throw new Error('Invalid refinement response format');
  }
  
  return data.result as string;
};