import React from 'react';

export const Footer: React.FC = () => {
    return (
        <footer className="bg-slate-900/50 mt-12 py-6 border-t border-cyan-400/20">
            <div className="container mx-auto text-center text-sm text-slate-400">
                <p>&copy; {new Date().getFullYear()} Grow With AI. All rights reserved.</p>
                <p className="mt-1">Powered by Google Gemini</p>
            </div>
        </footer>
    );
};