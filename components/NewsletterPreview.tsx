import React, { useRef } from 'react';

interface NewsletterPreviewProps {
  htmlContent: string;
  headerImageUrl: string | null;
}

export const NewsletterPreview: React.FC<NewsletterPreviewProps> = ({ htmlContent, headerImageUrl }) => {
  const contentRef = useRef<HTMLDivElement>(null);

  const handleCopyHtml = () => {
    let finalHtml = '';
    if (headerImageUrl) {
        finalHtml += `<img src="${headerImageUrl}" alt="Newsletter Header" style="width:100%;height:auto;margin-bottom:24px;border-radius:8px;" />\n`;
    }
    finalHtml += htmlContent;

    navigator.clipboard.writeText(finalHtml).then(() => {
      alert('HTML copied to clipboard!');
    }, (err) => {
      console.error('Could not copy HTML: ', err);
      alert('Failed to copy HTML.');
    });
  };
  
  const handleCopyText = () => {
    if (contentRef.current) {
        navigator.clipboard.writeText(contentRef.current.innerText).then(() => {
          alert('Text copied to clipboard!');
        }, (err) => {
          console.error('Could not copy text: ', err);
          alert('Failed to copy text.');
        });
    }
  };

  const handlePrint = () => {
    const preview = contentRef.current;
    if (!preview) return;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print Newsletter</title>');
      const styles = `
        body { font-family: sans-serif; line-height: 1.6; color: #111; }
        img { max-width: 100%; height: auto; }
        a { color: #007bff; text-decoration: none; }
        h1, h2, h3, h4, h5, h6 { color: #333; }
        hr { border: 0; border-top: 1px solid #ccc; }
      `;
      printWindow.document.write(`<style>${styles}</style>`);
      printWindow.document.write('</head><body>');
      printWindow.document.write(preview.innerHTML);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.print();
    }
  };


  return (
    <div className={`bg-slate-900/50 backdrop-blur-sm border border-cyan-400/20 rounded-2xl shadow-lg overflow-hidden`}>
      <div className="p-4 sm:p-6 bg-slate-900/50 border-b border-cyan-400/20">
        <div className="flex flex-wrap items-center justify-end gap-3">
            <button onClick={handleCopyHtml} className="px-4 py-2 text-sm font-semibold bg-slate-700 text-slate-200 rounded-md hover:bg-slate-600 transition-colors">Copy HTML</button>
            <button onClick={handleCopyText} className="px-4 py-2 text-sm font-semibold bg-slate-700 text-slate-200 rounded-md hover:bg-slate-600 transition-colors">Copy Text</button>
            <button onClick={handlePrint} className="px-4 py-2 text-sm font-semibold bg-cyan-600 text-white rounded-md hover:bg-cyan-500 transition-colors">Print / Save as PDF</button>
        </div>
      </div>
      <div 
        ref={contentRef}
        className="p-6 sm:p-8"
      >
        <div className={`prose prose-slate prose-invert max-w-none prose-headings:text-cyan-300 prose-a:text-cyan-400 hover:prose-a:text-cyan-300 prose-strong:text-cyan-300`}>
            {headerImageUrl && (
              <img 
                src={headerImageUrl} 
                alt="Newsletter Header" 
                className="w-full h-auto mb-6 rounded-lg shadow-md border-2 border-cyan-400/20" 
              />
            )}
            <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
        </div>
      </div>
    </div>
  );
};