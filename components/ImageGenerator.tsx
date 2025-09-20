import React, { useState, useCallback } from 'react';
import { generateHeaderImage } from '../services/geminiService';
import { Loader } from './Loader';

interface ImageGeneratorProps {
  onClose?: () => void;
}

export const ImageGenerator: React.FC<ImageGeneratorProps> = ({ onClose }) => {
  const [prompt, setPrompt] = useState<string>('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateImage = useCallback(async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt for the image generation.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);

    try {
      const imageDataUrl = await generateHeaderImage(prompt.trim());
      setGeneratedImage(imageDataUrl);
    } catch (err) {
      console.error('Image generation failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate image. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [prompt]);

  const handleDownloadImage = useCallback(() => {
    if (!generatedImage) return;

    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `generated-image-${Date.now()}.${generatedImage.includes('svg') ? 'svg' : 'png'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [generatedImage]);

  const handleClearImage = useCallback(() => {
    setGeneratedImage(null);
    setPrompt('');
    setError(null);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-cyan-400/20 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-cyan-300 tracking-wide">AI Image Generator</h2>
            {onClose && (
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white transition-colors text-2xl font-bold"
                aria-label="Close"
              >
                ×
              </button>
            )}
          </div>

          {/* Prompt Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-cyan-300 tracking-wide mb-2">
              Image Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to generate... (e.g., 'A futuristic cityscape with flying cars and neon lights')"
              className="w-full px-4 py-3 bg-cyan-900/50 text-slate-100 border border-cyan-400/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 placeholder:text-slate-400 resize-none"
              rows={3}
              disabled={isLoading}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <button
              onClick={handleGenerateImage}
              disabled={isLoading || !prompt.trim()}
              className={`flex-1 bg-cyan-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:bg-cyan-500 disabled:bg-cyan-800 disabled:text-slate-400 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-400 ${isLoading ? 'glow-animate' : ''}`}
            >
              {isLoading ? 'GENERATING...' : 'GENERATE IMAGE'}
            </button>
            
            {generatedImage && (
              <>
                <button
                  onClick={handleDownloadImage}
                  className="flex-1 bg-green-600 text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:bg-green-500 transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-green-400"
                >
                  DOWNLOAD
                </button>
                <button
                  onClick={handleClearImage}
                  className="flex-1 bg-slate-600 text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:bg-slate-500 transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-slate-400"
                >
                  CLEAR
                </button>
              </>
            )}
          </div>

          {/* Loading State */}
          {isLoading && <Loader message="Generating your image..." />}

          {/* Error Display */}
          {error && (
            <div className="mb-6 bg-red-900/50 border border-red-500 text-red-300 px-4 py-3 rounded-lg" role="alert">
              <strong className="font-bold">Error: </strong>
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          {/* Generated Image Display */}
          {generatedImage && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-cyan-300">Generated Image</h3>
              <div className="relative bg-slate-800/50 rounded-lg p-4 border border-cyan-400/20">
                <img
                  src={generatedImage}
                  alt="Generated image"
                  className="w-full h-auto max-h-96 object-contain rounded-lg"
                  onError={() => setError('Failed to load the generated image.')}
                />
              </div>
              
              {/* Image Info */}
              <div className="text-sm text-slate-400 bg-slate-800/30 rounded-lg p-3">
                <p><strong>Prompt:</strong> {prompt}</p>
                <p><strong>Format:</strong> {generatedImage.includes('svg') ? 'SVG' : 'PNG'}</p>
                <p><strong>Generated:</strong> {new Date().toLocaleString()}</p>
              </div>
            </div>
          )}

          {/* Tips */}
          <div className="mt-6 bg-cyan-900/20 border border-cyan-400/30 rounded-lg p-4">
            <h4 className="text-cyan-300 font-semibold mb-2">💡 Tips for Better Images</h4>
            <ul className="text-slate-300 text-sm space-y-1">
              <li>• Be specific about style, colors, and composition</li>
              <li>• Include artistic styles like "photorealistic", "digital art", "watercolor"</li>
              <li>• Mention lighting conditions: "golden hour", "studio lighting", "dramatic shadows"</li>
              <li>• Specify the mood: "serene", "energetic", "mysterious", "futuristic"</li>
              <li>• Add details about perspective: "close-up", "wide angle", "bird's eye view"</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};