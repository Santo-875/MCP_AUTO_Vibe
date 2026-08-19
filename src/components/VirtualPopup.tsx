import React from 'react';
import { Play, Pause, Square, CheckCircle2, ShieldAlert, Cpu } from 'lucide-react';
import { ExtensionStatus, ExtensionStats, LogEntry, TargetTabInfo } from '../types';

interface VirtualPopupProps {
  status: ExtensionStatus;
  stats: ExtensionStats;
  logs: LogEntry[];
  targetTab: TargetTabInfo;
  autoSubmit: boolean;
  onToggleAutoSubmit: (val: boolean) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onClearLogs: () => void;
  activeModel: string;
}

export const VirtualPopup: React.FC<VirtualPopupProps> = ({
  status,
  stats,
  logs,
  targetTab,
  autoSubmit,
  onToggleAutoSubmit,
  onStart,
  onPause,
  onResume,
  onStop,
  onClearLogs,
  activeModel,
}) => {
  const isRunning =
    status === 'SCANNING' ||
    status === 'SOLVING' ||
    status === 'CLICKING' ||
    status === 'VERIFYING' ||
    status === 'SCROLLING' ||
    status === 'SUBMITTING';
  const isPaused = status === 'PAUSED' || status === 'PAUSED_CAPTCHA';

  const getStatusBadge = () => {
    switch (status) {
      case 'SCANNING':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse">SCANNING</span>;
      case 'SOLVING':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 animate-pulse">ASKING GEMINI</span>;
      case 'CLICKING':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">CLICKING</span>;
      case 'VERIFYING':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">VERIFYING</span>;
      case 'SCROLLING':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 animate-pulse">SCROLLING</span>;
      case 'SUBMITTING':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse">SUBMITTING</span>;
      case 'PAUSED':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">PAUSED</span>;
      case 'PAUSED_CAPTCHA':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1"><ShieldAlert size={10} /> CAPTCHA PAUSE</span>;
      case 'COMPLETED':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1"><CheckCircle2 size={10} /> COMPLETED</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">IDLE</span>;
    }
  };

  const progressPercent = stats.detected > 0 ? Math.round((stats.answered / stats.detected) * 100) : 0;

  return (
    <div className="w-full max-w-[390px] bg-white border border-slate-200 rounded-2xl shadow-lg shadow-slate-200/50 p-5 flex flex-col gap-4 font-sans text-slate-900 select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
            <Cpu size={18} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Gemini MCQ Solver</h3>
              <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded border border-indigo-100">MV3</span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">Autonomous Quiz Extension</p>
          </div>
        </div>
        <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-full">
          {activeModel}
        </span>
      </div>

      {/* Hero Status & Progress Card (Professional Polish Style) */}
      <div className="bg-indigo-600 rounded-xl p-4 text-white shadow-md shadow-indigo-200">
        <div className="flex justify-between items-start mb-2">
          <p className="text-indigo-100 font-bold uppercase text-[10px] tracking-wider">Current Session Status</p>
          <span className="px-2 py-0.5 bg-white/20 rounded text-[10px] font-bold uppercase tracking-wide">
            {status}
          </span>
        </div>
        <div className="flex items-baseline gap-2 mb-1.5">
          <div className="text-3xl font-extrabold">{progressPercent}%</div>
          <span className="text-xs text-indigo-200 font-medium">completed</span>
        </div>
        <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden mb-2">
          <div className="bg-white h-full transition-all duration-300 rounded-full" style={{ width: `${progressPercent}%` }}></div>
        </div>
        <p className="text-[11px] text-indigo-100 leading-snug line-clamp-2">
          {stats.currentQuestionText ? `Active: "${stats.currentQuestionText}"` : 'Ready to begin automated detection on active tab.'}
        </p>
      </div>

      {/* Target Tab Lock */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-center justify-between">
        <div className="flex flex-col min-w-0 pr-2">
          <span className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">Target Tab Lock</span>
          <span className="text-xs font-semibold text-slate-700 truncate">{targetTab.title}</span>
        </div>
        <div>{getStatusBadge()}</div>
      </div>

      {/* KPI Metrics Grid */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs text-center">
          <div className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Detected</div>
          <div className="text-xl font-extrabold text-slate-800">{stats.detected}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs text-center">
          <div className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Answered</div>
          <div className="text-xl font-extrabold text-emerald-600">{stats.answered}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs text-center">
          <div className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Remaining</div>
          <div className="text-xl font-extrabold text-orange-500">{stats.remaining}</div>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex flex-col gap-2">
        {!isRunning && !isPaused ? (
          <button
            onClick={onStart}
            className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-200 transition-all cursor-pointer"
          >
            <Play size={14} className="fill-white" />
            <span>Start Autonomous Solver</span>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {isPaused ? (
              <button
                onClick={onResume}
                className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Play size={12} className="fill-white" />
                <span>Resume</span>
              </button>
            ) : (
              <button
                onClick={onPause}
                className="py-2.5 px-3 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Pause size={12} className="fill-amber-900" />
                <span>Pause</span>
              </button>
            )}
            <button
              onClick={onStop}
              className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Square size={12} className="fill-slate-700" />
              <span>Stop & Reset</span>
            </button>
          </div>
        )}
      </div>

      {/* Safety Auto-Submit Toggle */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-center justify-between text-xs">
        <span className="text-slate-700 font-semibold">Auto-Submit quiz on complete</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={autoSubmit}
            onChange={(e) => onToggleAutoSubmit(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
        </label>
      </div>

      {/* Agent Thoughts / Live Log Stream (Professional Dark Terminal Style) */}
      <div className="bg-slate-900 rounded-xl p-3.5 text-slate-300 font-mono text-xs border border-slate-800 shadow-inner">
        <div className="flex items-center justify-between mb-2.5 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></div>
            <span className="text-indigo-400 font-bold text-[11px]">AGENT_STREAM</span>
          </div>
          <button onClick={onClearLogs} className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer">
            Clear
          </button>
        </div>
        <div className="max-h-24 overflow-y-auto flex flex-col gap-1 text-[11px] pr-1">
          {logs.length === 0 ? (
            <div className="text-slate-600 italic">&gt; Ready for execution stream...</div>
          ) : (
            logs.slice(0, 15).map((l) => (
              <div key={l.id} className="leading-snug">
                <span className="text-slate-500 mr-1.5">{l.timestamp}</span>
                <span
                  className={`
                    ${l.level === 'gemini' ? 'text-indigo-300 font-bold' : ''}
                    ${l.level === 'success' ? 'text-emerald-400' : ''}
                    ${l.level === 'warn' ? 'text-amber-300' : ''}
                    ${l.level === 'error' ? 'text-rose-400' : ''}
                    ${l.level === 'info' ? 'text-slate-300' : ''}
                  `}
                >
                  &gt; {l.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
