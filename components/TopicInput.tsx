import React, { useState } from 'react';

interface TopicInputProps {
  topics: string[];
  setTopics: (topics: string[]) => void;
}

export const TopicInput: React.FC<TopicInputProps> = ({ topics, setTopics }) => {
  const [inputValue, setInputValue] = useState('');

  const handleAddTopic = () => {
    if (inputValue.trim() && !topics.includes(inputValue.trim())) {
      setTopics([...topics, inputValue.trim()]);
      setInputValue('');
    }
  };

  const handleRemoveTopic = (topicToRemove: string) => {
    setTopics(topics.filter(topic => topic !== topicToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTopic();
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g., Quantum Computing"
          className="flex-grow w-full px-4 py-2 bg-cyan-900/50 text-slate-100 border border-cyan-400/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 placeholder:text-slate-400"
        />
        <button
          onClick={handleAddTopic}
          className="bg-cyan-600 text-white font-semibold px-5 py-2 rounded-lg hover:bg-cyan-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-400"
        >
          Add Topic
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {topics.map((topic) => (
          <span key={topic} className="flex items-center bg-cyan-400/10 border border-cyan-400/20 text-cyan-300 text-sm font-medium px-3 py-1 rounded-full">
            {topic}
            <button
              onClick={() => handleRemoveTopic(topic)}
              className="ml-2 text-cyan-400 hover:text-cyan-200 focus:outline-none"
              aria-label={`Remove topic: ${topic}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
      </div>
    </div>
  );
};