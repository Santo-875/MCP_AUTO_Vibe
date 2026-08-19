import React, { useState } from 'react';
import {
  Zap,
  Download,
  Play,
  FileCode,
  Layers,
  HelpCircle,
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { VirtualPopup } from './components/VirtualPopup';
import { ExtensionSimulator } from './components/ExtensionSimulator';
import { CodeViewer } from './components/CodeViewer';
import { InstallationGuide } from './components/InstallationGuide';
import { ArchitectureFlow } from './components/ArchitectureFlow';
import { ExtensionStatus, ExtensionStats, LogEntry, TargetTabInfo } from './types';
import { generateExtensionZip, downloadBlob } from './services/zipExporter';
import { EXTENSION_FILES } from './extension/sourceFiles';

type ActiveTab = 'simulator' | 'code' | 'install' | 'architecture';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('simulator');
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [autoSubmit, setAutoSubmit] = useState<boolean>(true);
  const [activeModel, setActiveModel] = useState<string>('gemini-3.7-flash');

  // Shared state for extension session
  const [status, setStatus] = useState<ExtensionStatus>('IDLE');
  const [stats, setStats] = useState<ExtensionStats>({
    detected: 5,
    answered: 0,
    remaining: 5,
    failed: 0,
    currentQuestionIndex: 0,
    currentQuestionText: '',
    scrollProgress: 0,
    bottomReached: false,
    isComplete: false,
    submissionStatus: 'NOT_SUBMITTED',
  });

  const [targetTab, setTargetTab] = useState<TargetTabInfo>({
    id: 101,
    title: 'University LMS Final Exam (Canvas/Moodle Layout)',
    url: 'https://quiz-portal.edu/exam/1092',
  });

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init_1',
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      message: 'Gemini Auto MCQ Solver Manifest V3 engine initialized and ready.',
    },
  ]);

  const addLog = (level: LogEntry['level'], message: string, details?: any) => {
    const newEntry: LogEntry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      details,
    };
    setLogs((prev) => [newEntry, ...prev.slice(0, 150)]);
  };

  const handleStart = () => {
    if (status === 'IDLE' || status === 'COMPLETED') {
      setStatus('SCANNING');
      addLog('info', `Locked target to active Tab: "${targetTab.title}"`);
    }
  };

  const handlePause = () => {
    setStatus('PAUSED');
    addLog('warn', 'Autonomous solving paused by user.');
  };

  const handleResume = () => {
    setStatus('SCANNING');
    addLog('info', 'Autonomous solving resumed.');
  };

  const handleStop = () => {
    setStatus('IDLE');
    setStats({
      detected: 5,
      answered: 0,
      remaining: 5,
      failed: 0,
      currentQuestionIndex: 0,
      currentQuestionText: '',
      scrollProgress: 0,
      bottomReached: false,
      isComplete: false,
      submissionStatus: 'NOT_SUBMITTED',
    });
    addLog('info', 'Session reset to IDLE.');
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const handleDownloadZip = async () => {
    try {
      setIsZipping(true);
      const zipBlob = await generateExtensionZip(EXTENSION_FILES);
      downloadBlob(zipBlob, 'gemini-mcq-solver-extension.zip');
    } catch (e) {
      console.error('Failed to download zip:', e);
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation / Status Bar with Professional Polish */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-md shadow-indigo-200">
              G
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 tracking-tight">
                  Gemini MCQ Solver
                </h1>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200/60 rounded-full text-[10px] font-bold uppercase tracking-wide">
                  MV3 Autonomous Agent
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium hidden sm:block">
                Auto-detects, solves with Gemini, clicks, verifies, scrolls & submits
              </p>
            </div>
          </div>

          {/* Center Navigation Tabs */}
          <div className="hidden lg:flex items-center bg-slate-100 border border-slate-200 p-1 rounded-xl gap-1">
            <button
              onClick={() => setActiveTab('simulator')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'simulator'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Play size={13} className="fill-current" />
              <span>Live Testbench</span>
            </button>

            <button
              onClick={() => setActiveTab('code')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'code'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileCode size={13} />
              <span>Extension Code</span>
            </button>

            <button
              onClick={() => setActiveTab('install')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'install'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HelpCircle size={13} />
              <span>Install Guide</span>
            </button>

            <button
              onClick={() => setActiveTab('architecture')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'architecture'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers size={13} />
              <span>Agent Pipeline</span>
            </button>
          </div>

          {/* Right Status & 1-Click ZIP Download */}
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 bg-slate-100 border border-slate-200/80 px-3 py-1.5 rounded-full">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-semibold text-slate-700 tracking-wide">
                Gemini API Connected
              </span>
            </div>

            <button
              onClick={handleDownloadZip}
              disabled={isZipping}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-200 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Download size={14} />
              <span className="hidden sm:inline">
                {isZipping ? 'Generating...' : 'Download Extension (.ZIP)'}
              </span>
              <span className="sm:hidden">ZIP</span>
            </button>
          </div>
        </div>

        {/* Mobile Tab Navigation */}
        <div className="lg:hidden border-t border-slate-200 px-4 py-2 flex items-center justify-around bg-slate-50">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`text-xs font-bold py-1.5 px-3 rounded-lg ${
              activeTab === 'simulator' ? 'bg-indigo-600 text-white' : 'text-slate-600'
            }`}
          >
            Live Testbench
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`text-xs font-bold py-1.5 px-3 rounded-lg ${
              activeTab === 'code' ? 'bg-indigo-600 text-white' : 'text-slate-600'
            }`}
          >
            Code
          </button>
          <button
            onClick={() => setActiveTab('install')}
            className={`text-xs font-bold py-1.5 px-3 rounded-lg ${
              activeTab === 'install' ? 'bg-indigo-600 text-white' : 'text-slate-600'
            }`}
          >
            Install
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`text-xs font-bold py-1.5 px-3 rounded-lg ${
              activeTab === 'architecture' ? 'bg-indigo-600 text-white' : 'text-slate-600'
            }`}
          >
            Pipeline
          </button>
        </div>
      </nav>

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
        {activeTab === 'simulator' && (
          <div className="flex-1 flex flex-col lg:flex-row gap-6 items-start">
            {/* Live Interactive Testbench (Browser Window) */}
            <ExtensionSimulator
              status={status}
              setStatus={setStatus}
              stats={stats}
              setStats={setStats}
              logs={logs}
              addLog={addLog}
              autoSubmit={autoSubmit}
              activeModel={activeModel}
            />

            {/* Synced Virtual Extension Popup View */}
            <div className="w-full lg:w-auto shrink-0 flex flex-col items-center lg:items-start gap-3">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                <span>Chrome Toolbar Popup View</span>
              </div>
              <VirtualPopup
                status={status}
                stats={stats}
                logs={logs}
                targetTab={targetTab}
                autoSubmit={autoSubmit}
                onToggleAutoSubmit={setAutoSubmit}
                onStart={handleStart}
                onPause={handlePause}
                onResume={handleResume}
                onStop={handleStop}
                onClearLogs={handleClearLogs}
                activeModel={activeModel}
              />
            </div>
          </div>
        )}

        {activeTab === 'code' && <CodeViewer />}
        {activeTab === 'install' && <InstallationGuide />}
        {activeTab === 'architecture' && <ArchitectureFlow />}
      </main>

      {/* Professional Polish Bottom Control & Safety Footer */}
      <footer className="bg-white border-t border-slate-200 px-6 py-4 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
              <span className="font-semibold text-slate-700">Tab Security Isolation: Active</span>
            </div>
            <span className="text-slate-300">|</span>
            <span className="text-slate-500">Autonomous Manifest V3 Engine Powered by Gemini AI</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Safety Controls</span>
            <label className="flex items-center gap-2 cursor-pointer bg-slate-100 hover:bg-slate-200/80 px-3 py-1.5 rounded-lg border border-slate-200 transition">
              <input
                type="checkbox"
                checked={autoSubmit}
                onChange={(e) => setAutoSubmit(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs font-bold text-slate-700">Auto Submit</span>
            </label>
          </div>
        </div>
      </footer>
    </div>
  );
}
