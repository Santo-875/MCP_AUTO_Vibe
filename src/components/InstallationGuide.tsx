import React from 'react';
import { Download, FolderCheck, Chrome, ToggleRight, Play, Settings } from 'lucide-react';
import { generateExtensionZip, downloadBlob } from '../services/zipExporter';
import { EXTENSION_FILES } from '../extension/sourceFiles';

export const InstallationGuide: React.FC = () => {
  const handleDownload = async () => {
    const zip = await generateExtensionZip(EXTENSION_FILES);
    downloadBlob(zip, 'gemini-mcq-solver-extension.zip');
  };

  return (
    <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-6 lg:p-8 space-y-8 overflow-y-auto shadow-sm">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold mb-3">
          <Chrome size={14} />
          <span>Chrome Manifest V3 Installation Guide</span>
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          How to Load the Extension in Your Chromium Browser
        </h2>
        <p className="text-slate-500 text-sm mt-1 max-w-2xl font-medium">
          Follow these 4 simple steps to install and run the unpacked extension on Google Chrome, Brave, Microsoft Edge, or any Chromium-based browser.
        </p>
      </div>

      {/* Step by Step Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Step 1 */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                1
              </span>
              <span className="text-xs text-slate-400 font-mono font-bold">ZIP Export</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">Download & Extract Files</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-5">
              Click the button below to download the complete extension ZIP file, then extract it into a folder on your computer (e.g. <code className="bg-slate-200/80 px-1.5 py-0.5 rounded text-indigo-700 font-mono font-bold">~/Downloads/gemini-mcq-solver</code>).
            </p>
          </div>
          <button
            onClick={handleDownload}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-200"
          >
            <Download size={14} />
            <span>Download Extension ZIP</span>
          </button>
        </div>

        {/* Step 2 */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
              2
            </span>
            <span className="text-xs text-slate-400 font-mono font-bold">chrome://extensions</span>
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-2">Open Extensions Manager</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            In Chrome or Brave, type <code className="bg-slate-200/80 px-2 py-0.5 rounded text-indigo-700 font-mono font-bold">chrome://extensions</code> in your address bar and press Enter.
          </p>
          <div className="mt-5 p-3.5 bg-white border border-slate-200 rounded-xl flex items-center gap-3 shadow-xs">
            <ToggleRight size={24} className="text-indigo-600 shrink-0" />
            <div className="text-xs text-slate-700">
              Toggle <strong className="text-slate-900">"Developer mode"</strong> switch in the top-right corner to <strong className="text-emerald-600">ON</strong>.
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
              3
            </span>
            <span className="text-xs text-slate-400 font-mono font-bold">Load Unpacked</span>
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-2">Click "Load Unpacked"</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Click the <strong className="text-slate-900">"Load unpacked"</strong> button in the top-left toolbar and select your extracted folder containing <code className="bg-slate-200/80 px-2 py-0.5 rounded text-indigo-700 font-mono font-bold">manifest.json</code>.
          </p>
          <div className="mt-5 p-3.5 bg-white border border-slate-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-700 font-semibold shadow-xs">
            <FolderCheck size={18} className="shrink-0 text-emerald-600" />
            <span>The Gemini MCQ Solver card and icon will instantly appear!</span>
          </div>
        </div>

        {/* Step 4 */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
              4
            </span>
            <span className="text-xs text-slate-400 font-mono font-bold">Solve & Submit</span>
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-2">Open Quiz & Click Start</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Navigate to any quiz or MCQ webpage, pin the extension to your toolbar, click the extension icon, and hit <strong className="text-indigo-600">"Start Solving"</strong>.
          </p>
          <div className="mt-5 p-3.5 bg-white border border-slate-200 rounded-xl flex items-center gap-2.5 text-xs text-indigo-900 font-semibold shadow-xs">
            <Play size={16} className="text-indigo-600 shrink-0 fill-indigo-600" />
            <span>Autonomous agent will detect, answer, click, scroll, and submit automatically!</span>
          </div>
        </div>
      </div>

      {/* Configuration & Options Details */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-2.5">
          <Settings size={18} className="text-indigo-600" />
          <h3 className="text-base font-bold text-slate-900">Extension Options & Gemini Key Setup</h3>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Right-click the extension icon and choose <strong>"Options"</strong>:
        </p>
        <ul className="text-xs text-slate-500 space-y-2 list-disc list-inside">
          <li>
            <strong className="text-slate-800">Gemini API Key:</strong> Enter your Google AI Studio API key for direct in-browser worker solving.
          </li>
          <li>
            <strong className="text-slate-800">Server Proxy Endpoint:</strong> Alternatively, route all solving requests through your deployed fullstack server backend (<code className="text-indigo-600 font-mono">/api/gemini/solve</code>).
          </li>
          <li>
            <strong className="text-slate-800">Autonomous Timings:</strong> Adjust click delays, scroll step speeds, and maximum retry counts to match target website rendering speeds.
          </li>
        </ul>
      </div>
    </div>
  );
};
