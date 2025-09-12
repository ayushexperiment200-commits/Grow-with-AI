
import React from 'react';

interface Theme {
    name: string;
    displayName: string;
    description: string;
    previewColors: {
        bg: string;
        heading: string;
        text: string;
        link: string;
    };
}

interface ThemePreviewCardProps {
    theme: Theme;
    isSelected: boolean;
    onClick: () => void;
}

export const ThemePreviewCard: React.FC<ThemePreviewCardProps> = ({ theme, isSelected, onClick }) => {
    return (
        <button
            role="radio"
            aria-checked={isSelected}
            aria-label={theme.displayName}
            onClick={onClick}
            className={`text-left p-3 border rounded-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 ${
                isSelected 
                ? 'bg-white dark:bg-slate-700 ring-2 ring-indigo-500 shadow-lg' 
                : 'bg-white/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md'
            }`}
        >
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{theme.displayName}</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-3">{theme.description}</p>
            <div 
                className="h-16 w-full rounded-md border border-slate-200 dark:border-slate-600 p-2 space-y-1" 
                style={{ backgroundColor: theme.previewColors.bg }}
                aria-hidden="true"
            >
                <div className="h-2 w-1/2 rounded-sm" style={{ backgroundColor: theme.previewColors.heading }}></div>
                <div className="h-1.5 w-full rounded-sm" style={{ backgroundColor: theme.previewColors.text }}></div>
                <div className="h-1.5 w-5/6 rounded-sm" style={{ backgroundColor: theme.previewColors.text }}></div>
                <div className="h-1.5 w-1/3 rounded-sm" style={{ backgroundColor: theme.previewColors.link }}></div>
            </div>
        </button>
    );
};
