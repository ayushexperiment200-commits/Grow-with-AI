
export interface NewsArticle {
  title: string;
  summary: string;
  source: string;
  link: string;
  publishedAt?: string; // ISO date string for frontend compatibility
}
