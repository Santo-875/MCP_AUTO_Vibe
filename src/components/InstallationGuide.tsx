import React from 'react';
import { Download, FolderCheck, Chrome, ToggleRight, Play, Settings, Key, ArrowRight, CheckCircle2 } from 'lucide-react';
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
          <span>Chrome Manifest V3 Installation & Setup Guide</span>
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          How to Load the Extension & Connect Gemini AI
        </h2>
        <p className="text-slate-500 text-sm mt-1 max-w-2xl font-medium">
          Follow these quick steps to install the unpacked extension on Chrome / Brave / Edge, connect your Gemini API key, and solve quizzes automatically across multiple pages.
        </p>
      </div>

      {/* Quick Gemini Key Connection Card */}
      <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10 border border-indigo-200 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Key size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">How Gemini Answers Your Quizzes</h3>
            <p className="text-xs text-slate-600 mt-0.5 max-w-xl">
              1. Get a free API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-600 font-bold underline">Google AI Studio</a>.<br />
              2. Paste it directly into the extension popup or Options page.<br />
              3. The autonomous agent scans questions, consults Gemini, clicks the correct choices, clicks <strong>"Next Page"</strong> when needed, and completes the submission!
            </p>
          </div>
        </div>
        <a
          href="https://aistudio.google.com/app/apikey"
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shrink-0 flex items-center gap-1.5 shadow-sm"
        >
          <span>Get Free API Key</span>
          <ArrowRight size={14} />
        </a>
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
            Click the <strong className="text-slate-900">"Load unpacked"</strong> button in the top-left toolbar and select your extracted folder that directly contains <code className="bg-slate-200/80 px-2 py-0.5 rounded text-indigo-700 font-mono font-bold">manifest.json</code>.
          </p>
          <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 leading-snug">
            ⚠️ <strong>Fix "Manifest missing" error:</strong> Ensure you select the folder containing <code className="font-bold">manifest.json</code>, not the raw <code className="font-bold">.zip</code> file.
          </div>
          <div className="mt-3 p-3 bg-white border border-slate-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-700 font-semibold shadow-xs">
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
            <span className="text-xs text-slate-400 font-mono font-bold">Autonomous Solving</span>
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-2">Open Quiz & Click Start</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Navigate to any quiz or MCQ webpage, pin the extension to your toolbar, paste your API key (if first time), and hit <strong className="text-indigo-600">"Start Solving"</strong>.
          </p>
          <div className="mt-5 p-3.5 bg-white border border-slate-200 rounded-xl flex items-center gap-2.5 text-xs text-indigo-900 font-semibold shadow-xs">
            <Play size={16} className="text-indigo-600 shrink-0 fill-indigo-600" />
            <span>Answers questions, clicks Next for subsequent pages, and submits when finished!</span>
          </div>
        </div>
      </div>

      {/* Key Features Breakdown */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <Settings size={18} className="text-indigo-600" />
          <h3 className="text-base font-bold text-slate-900">Supported Quiz Capabilities</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs mb-1">
              <CheckCircle2 size={16} />
              <span>Multi-Page Pagination</span>
            </div>
            <p className="text-xs text-slate-500">
              Detects and clicks <strong>"Next"</strong>, <strong>"Continue"</strong>, or next question buttons on multi-section quizzes automatically.
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs mb-1">
              <CheckCircle2 size={16} />
              <span>Any MCQ Format</span>
            </div>
            <p className="text-xs text-slate-500">
              Standard radios, checkboxes, ARIA roles, React / Vue buttons, LMS portals, and custom clickable cards.
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs mb-1">
              <CheckCircle2 size={16} />
              <span>Auto-Scroll & Submit</span>
            </div>
            <p className="text-xs text-slate-500">
              Scrolls smoothly down long pages to discover questions, verifies clicks, and clicks the final submit button.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
