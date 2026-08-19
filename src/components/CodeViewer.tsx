import React, { useState } from 'react';
import { Copy, Check, FileCode, Download } from 'lucide-react';
import { EXTENSION_FILES } from '../extension/sourceFiles';
import { generateExtensionZip, downloadBlob } from '../services/zipExporter';

export const CodeViewer: React.FC = () => {
  const [activeFile, setActiveFile] = useState<string>('manifest.json');
  const [copied, setCopied] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);

  const fileList = Object.keys(EXTENSION_FILES);
  const activeContent = EXTENSION_FILES[activeFile] || '';

  const handleCopy = () => {
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadZip = async () => {
    try {
      setIsZipping(true);
      const zipBlob = await generateExtensionZip(EXTENSION_FILES);
      downloadBlob(zipBlob, 'gemini-mcq-solver-extension.zip');
    } catch (e) {
      console.error('Download zip failed:', e);
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Top Toolbar */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <FileCode size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Manifest V3 Source Code Browser</h3>
            <p className="text-xs text-slate-500 font-medium">
              Complete production codebase ready for Chrome unpacked loading
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleCopy}
            className="px-4 py-2 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            <span>{copied ? 'Copied to Clipboard!' : 'Copy Current File'}</span>
          </button>

          <button
            onClick={handleDownloadZip}
            disabled={isZipping}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-md shadow-indigo-200 cursor-pointer disabled:opacity-50"
          >
            <Download size={14} />
            <span>{isZipping ? 'Generating ZIP...' : 'Download Full Extension (.ZIP)'}</span>
          </button>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex flex-col md:flex-row min-h-[520px]">
        {/* File Navigator Sidebar */}
        <div className="w-full md:w-64 bg-slate-50 border-r border-slate-200 p-4 flex flex-col gap-1.5 overflow-y-auto shrink-0">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 mb-1">
            Extension Bundle Files
          </div>
          {fileList.map((fileName) => {
            const isSelected = activeFile === fileName;
            return (
              <button
                key={fileName}
                onClick={() => setActiveFile(fileName)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-mono transition flex items-center justify-between cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <span className="truncate">{fileName}</span>
                {fileName === 'manifest.json' && (
                  <span className="text-[9px] font-sans font-bold bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">
                    MV3
                  </span>
                )}
                {fileName === 'background.js' && (
                  <span className="text-[9px] font-sans font-bold bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">
                    Worker
                  </span>
                )}
                {fileName === 'content.js' && (
                  <span className="text-[9px] font-sans font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                    Agent
                  </span>
                )}
              </button>
            );
          })}

          <div className="mt-auto pt-4 border-t border-slate-200 px-2 text-[11px] text-slate-500 space-y-1">
            <div>Includes 16px, 48px, 128px PNG icons.</div>
            <div>Fully compliant with Chrome Web Store MV3 specifications.</div>
          </div>
        </div>

        {/* Code Content Window */}
        <div className="flex-1 flex flex-col bg-slate-900 p-5 overflow-hidden text-slate-300">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono pb-2.5 mb-3 border-b border-slate-800">
            <span className="text-indigo-400 font-bold">{activeFile}</span>
            <span>{activeContent.split('\n').length} lines</span>
          </div>
          <pre className="flex-1 overflow-auto p-4 bg-slate-950/80 border border-slate-800/80 rounded-xl text-xs font-mono text-slate-200 leading-relaxed select-text">
            <code>{activeContent}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
