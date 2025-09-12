import React, { useState, useCallback, FC, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Header } from './components/Header';
import { TopicInput } from './components/TopicInput';
import { NewsletterPreview } from './components/NewsletterPreview';
import { Loader } from './components/Loader';
import { fetchTrendingNews, generateNewsletter, generateHeaderImage, refineNewsletter } from './services/geminiService';
import type { NewsArticle } from './types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { Footer } from './components/Footer';

// UI Helper Components
const InputGroup: FC<{label: string, children: React.ReactNode}> = ({ label, children }) => (
    <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-cyan-300 tracking-wide">{label}</label>
        {children}
    </div>
);
const TextInput: FC<InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input {...props} className="w-full px-4 py-2 bg-cyan-900/50 text-slate-100 border border-cyan-400/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 placeholder:text-slate-400" />
);
const SelectInput: FC<SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
    <select {...props} className="w-full px-4 py-2 bg-cyan-900/50 text-slate-100 border border-cyan-400/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400" />
);
const TextAreaInput: FC<TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
    <textarea {...props} className="w-full px-4 py-2 bg-cyan-900/50 text-slate-100 border border-cyan-400/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 placeholder:text-slate-400" />
);


const App: React.FC = () => {
  // Form State
  const [topics, setTopics] = useLocalStorage<string[]>('grow-with-ai-topics', ['AI in healthcare', 'Renewable energy breakthroughs']);
  const [industry, setIndustry] = useLocalStorage<string>('grow-with-ai-industry', 'Technology');
  const [companyName, setCompanyName] = useLocalStorage<string>('grow-with-ai-company', 'Innovate Inc.');
  const [visualKeywords, setVisualKeywords] = useLocalStorage<string>('grow-with-ai-visuals', 'abstract, futuristic, blue, network');
  const [minArticles, setMinArticles] = useLocalStorage<number>('grow-with-ai-minArticles', 5);
  const [wordLength, setWordLength] = useLocalStorage<number>('grow-with-ai-wordLength', 100);
  const [tone, setTone] = useLocalStorage<string>('grow-with-ai-tone', 'Professional');
  const [newsFormat, setNewsFormat] = useLocalStorage<'paragraph' | 'bullets'>('grow-with-ai-newsFormat', 'paragraph');
  const [customImagePrompt, setCustomImagePrompt] = useState<string>('');
  const [additionalInstructions, setAdditionalInstructions] = useState<string>('');
  const [shouldGenerateImage, setShouldGenerateImage] = useState<boolean>(true);

  // App State
  const [newsletterHtml, setNewsletterHtml] = useState<string | null>(null);
  const [headerImageUrl, setHeaderImageUrl] = useState<string | null>(null);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [refinementPrompt, setRefinementPrompt] = useState<string>('');
  const [loadingAction, setLoadingAction] = useState<'generate' | 'refine' | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const isLoading = loadingAction !== null;

  const handleGenerateNewsletter = useCallback(async () => {
    if (topics.length === 0) {
      setError('Please add at least one topic.');
      return;
    }

    setLoadingAction('generate');
    setError(null);
    setNewsletterHtml(null);
    setHeaderImageUrl(null);
    setArticles([]);

    try {
      setLoadingMessage('Researching trending news...');
      const articlesData: NewsArticle[] = await fetchTrendingNews(topics, minArticles);
      setArticles(articlesData);
      
      if (articlesData.length === 0) {
        throw new Error('Could not find any relevant news articles. Try different topics.');
      }

      setLoadingMessage('Crafting your newsletter...');
      const newsletterOptions = { topics, industry, companyName, tone, newsFormat, wordLength, additionalInstructions };
      const htmlContent = await generateNewsletter(articlesData, newsletterOptions);
      setNewsletterHtml(htmlContent);

      if (shouldGenerateImage) {
        setLoadingMessage('Generating header image...');
        const imagePrompt = customImagePrompt.trim() || `A professional and visually appealing header image for a newsletter from ${companyName} about "${topics.join(', ')}". The style should be: ${visualKeywords}. Abstract and suitable for a ${industry} audience. Avoid text.`;
        const imageBase64 = await generateHeaderImage(imagePrompt);
        setHeaderImageUrl(`data:image/png;base64,${imageBase64}`);
      }

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setLoadingAction(null);
      setLoadingMessage('');
    }
  }, [topics, minArticles, industry, companyName, tone, newsFormat, wordLength, additionalInstructions, shouldGenerateImage, customImagePrompt, visualKeywords]);

  const handleRefineNewsletter = useCallback(async () => {
    if (!refinementPrompt.trim() || !newsletterHtml) return;
    setLoadingAction('refine');
    setError(null);
    try {
        setLoadingMessage('Refining your newsletter...');
        const result = await refineNewsletter(newsletterHtml, articles, refinementPrompt);
        
        const isJsonLike = result.trim().startsWith('{') && result.trim().endsWith('}');
        if (isJsonLike) {
            try {
                const jsonResponse = JSON.parse(result);
                if (jsonResponse.requestType === 'image' && jsonResponse.newImagePrompt) {
                    setLoadingMessage('Generating new header image...');
                    const imageBase64 = await generateHeaderImage(jsonResponse.newImagePrompt);
                    setHeaderImageUrl(`data:image/png;base64,${imageBase64}`);
                } else {
                    throw new Error("AI returned an unexpected JSON format.");
                }
            } catch (e) {
                console.error("Failed to parse or validate JSON from refinement:", e);
                throw new Error("AI response was not in the expected format. Please rephrase.");
            }
        } else {
            setNewsletterHtml(result);
        }

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setLoadingAction(null);
      setLoadingMessage('');
      setRefinementPrompt('');
    }
  }, [refinementPrompt, newsletterHtml, articles]);


  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          {/* --- COMMAND CENTER --- */}
          <div className="bg-slate-900/50 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-lg border border-cyan-400/20">
            <h2 className="text-2xl font-bold text-cyan-300 mb-2 tracking-wide">Command Center</h2>
            <p className="text-slate-400 mb-6">Configure the parameters for your AI-powered newsletter.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <InputGroup label="Newsletter Topics">
                        <TopicInput topics={topics} setTopics={setTopics} />
                    </InputGroup>
                </div>

                <InputGroup label="Industry / Domain">
                    <TextInput type="text" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g., Artificial Intelligence" />
                </InputGroup>
                <InputGroup label="Company Name">
                    <TextInput type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g., FutureTech" />
                </InputGroup>

                <InputGroup label="Min. News Articles">
                     <TextInput type="number" value={minArticles} onChange={(e) => setMinArticles(Number(e.target.value))} min="1" max="10" />
                </InputGroup>
                <InputGroup label="Word Length / Summary">
                    <TextInput type="number" value={wordLength} onChange={(e) => setWordLength(Number(e.target.value))} step="10" min="20" />
                </InputGroup>

                <InputGroup label="Tone">
                    <SelectInput value={tone} onChange={(e) => setTone(e.target.value)}>
                        <option>Professional</option>
                        <option>Casual</option>
                        <option>Optimistic</option>
                        <option>Formal</option>
                        <option>Enthusiastic</option>
                    </SelectInput>
                </InputGroup>
                <InputGroup label="News Format">
                    <SelectInput value={newsFormat} onChange={(e) => setNewsFormat(e.target.value as 'paragraph' | 'bullets')}>
                        <option value="paragraph">Paragraph</option>
                        <option value="bullets">Bullets</option>
                    </SelectInput>
                </InputGroup>

                <div className="md:col-span-2">
                    <InputGroup label="Visual Design Keywords">
                        <TextInput type="text" value={visualKeywords} onChange={(e) => setVisualKeywords(e.target.value)} placeholder="modern, abstract, tech, vibrant" />
                    </InputGroup>
                </div>

                <div className="md:col-span-2">
                    <InputGroup label="Custom Image Prompt (Optional)">
                        <TextAreaInput value={customImagePrompt} onChange={(e) => setCustomImagePrompt(e.target.value)} placeholder="Overrides visual keywords if filled." rows={2} />
                    </InputGroup>
                </div>
                 <div className="md:col-span-2">
                    <InputGroup label="Additional Instructions (Optional)">
                        <TextAreaInput value={additionalInstructions} onChange={(e) => setAdditionalInstructions(e.target.value)} placeholder="e.g., Start with a quote about AI." rows={2} />
                    </InputGroup>
                </div>
            </div>

            <div className="mt-6 flex items-center justify-center">
              <input type="checkbox" id="generate-image" checked={shouldGenerateImage} onChange={(e) => setShouldGenerateImage(e.target.checked)} className="h-4 w-4 rounded border-slate-600 text-cyan-500 focus:ring-cyan-400 bg-slate-700" />
              <label htmlFor="generate-image" className="ml-3 block text-sm font-medium text-slate-300">Generate Header Image</label>
            </div>

            <div className="mt-6 text-center">
              <button onClick={handleGenerateNewsletter} disabled={isLoading || topics.length === 0} className={`w-full sm:w-auto bg-cyan-600 text-white font-bold py-3 px-12 rounded-lg shadow-lg hover:bg-cyan-500 disabled:bg-cyan-800 disabled:text-slate-400 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-400 ${loadingAction === 'generate' ? 'glow-animate' : ''}`}>
                {loadingAction === 'generate' ? 'GENERATING...' : 'GENERATE'}
              </button>
            </div>
          </div>
          {/* --- END COMMAND CENTER --- */}


          {isLoading && <Loader message={loadingMessage} />}
          
          {error && (
            <div className="mt-8 bg-red-900/50 border border-red-500 text-red-300 px-4 py-3 rounded-lg" role="alert">
              <strong className="font-bold">Error: </strong>
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          {newsletterHtml && (
            <div className="mt-12">
              <h2 className="text-3xl font-bold text-center text-cyan-300 mb-6 tracking-wider">Holographic Preview</h2>
              <NewsletterPreview htmlContent={newsletterHtml} headerImageUrl={headerImageUrl} />
            
              <div className="mt-8 bg-slate-900/50 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-lg border border-cyan-400/20">
                <h3 className="text-xl font-bold text-cyan-300 mb-2">Refine with AI</h3>
                <p className="text-slate-400 mb-4">Describe any changes. e.g., "Make the intro more exciting", "Change the header image to be about renewable energy"</p>
                <TextAreaInput value={refinementPrompt} onChange={(e) => setRefinementPrompt(e.target.value)} placeholder="Enter your instructions..." rows={3} disabled={isLoading} />
                <div className="mt-4 text-center">
                    <button onClick={handleRefineNewsletter} disabled={isLoading || !refinementPrompt.trim()} className={`w-full sm:w-auto bg-fuchsia-600 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:bg-fuchsia-500 disabled:bg-fuchsia-800 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-fuchsia-500 ${loadingAction === 'refine' ? 'glow-animate' : ''}`}>
                        {loadingAction === 'refine' ? 'Refining...' : 'Refine Newsletter'}
                    </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default App;
