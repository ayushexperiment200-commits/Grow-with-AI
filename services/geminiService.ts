import { GoogleGenAI } from "@google/genai";
import type { NewsArticle } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
  const prompt = `Find the most recent (within the last 48 hours), top trending news articles for the following topics: ${topics.join(', ')}. 
  Focus on significant developments and announcements. For each article, find its title, a brief summary, the source website, and a direct link. 
  Return at least ${minArticles} diverse articles in total across all topics. Ensure the links are valid.
  Format the output as a valid JSON array of objects, where each object has keys: "title", "summary", "source", and "link".
  Do not include any introductory text, closing text, or markdown formatting like \`\`\`json. The entire response should be only the JSON array.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const rawText = response.text.trim();
    const jsonText = rawText.replace(/^```json\n?/, '').replace(/\n?```$/, '');

    const articles = JSON.parse(jsonText) as NewsArticle[];
    if (!articles || articles.length === 0) {
      throw new Error("The AI returned no articles. The response might be empty or in an unexpected format.");
    }
    return articles;
  } catch (error) {
    console.error("Error fetching news from Gemini:", error);
    if (error instanceof SyntaxError) {
        throw new Error("Failed to parse the news data from the AI. The format was invalid.");
    }
    throw new Error("Failed to fetch news from the AI. Check API key or try again later.");
  }
};

export const generateNewsletter = async (articles: NewsArticle[], options: GenerationOptions): Promise<string> => {
    const { industry, companyName, tone, newsFormat, wordLength, additionalInstructions } = options;
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
    ${articlesJson}
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        
        const newsletterHtml = response.text;
        if (!newsletterHtml) {
            throw new Error("The AI returned an empty response for the newsletter.");
        }
        return newsletterHtml;

    } catch (error) {
        console.error("Error generating newsletter with Gemini:", error);
        throw new Error("Failed to generate the newsletter from the AI. Please try again.");
    }
};

export const generateHeaderImage = async (prompt: string): Promise<string> => {
  try {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/png',
        aspectRatio: '16:9',
      },
    });

    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error('The AI returned no images.');
    }

    const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
    return base64ImageBytes;
  } catch (error) {
    console.error("Error generating header image with Gemini:", error);
    throw new Error("Failed to generate the header image from the AI. Please try again.");
  }
};

export const refineNewsletter = async (
  currentHtml: string,
  articles: NewsArticle[],
  refinementPrompt: string
): Promise<string> => {
  const prompt = `You are an AI assistant helping a user refine a newsletter. You will be given the current newsletter HTML, the original news articles it was based on, and a user's request for changes. Your task is to process the request and provide an updated newsletter.

**User Request:** "${refinementPrompt}"

**Current Newsletter HTML:**
${currentHtml}

**Original News Articles (for context):**
${JSON.stringify(articles, null, 2)}

**Instructions:**
1.  **Analyze the User Request:** Understand what the user wants to change. This could be content, style, structure, or even the header image.
2.  **Handle Image Requests:** If the user asks for a new image (e.g., "change the image to be about space exploration"), you MUST ONLY respond with a JSON object of this exact format: \`{"requestType": "image", "newImagePrompt": "a detailed prompt for the new image based on the user request"}\`. Do not return any HTML or other text.
3.  **Handle Research Requests:** If the user asks for more research or content on a topic, use your knowledge and the provided articles to expand on it. Modify the HTML directly.
4.  **Handle HTML/Style Changes:** For any other request (changing text, headings, reordering sections), you must modify the provided HTML.
    -   Return the FULL, complete, updated HTML for the newsletter body.
5.  **Output Format:**
    -   If it's an image request, output ONLY the JSON object described in step 2.
    -   For all other requests, output ONLY the raw, updated HTML. Do not wrap it in markdown like \`\`\`html.

Now, generate the response based on the user's request.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    
    const resultText = response.text.trim();
    if (!resultText) {
      throw new Error("The AI returned an empty response for the refinement request.");
    }
    return resultText;
  } catch (error) {
    console.error("Error refining newsletter with Gemini:", error);
    throw new Error("Failed to refine the newsletter from the AI. Please try again.");
  }
};