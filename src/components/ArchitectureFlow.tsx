import React from 'react';
import { Search, BrainCircuit, MousePointerClick, ShieldCheck, ArrowDown, Send, Cpu, Layers } from 'lucide-react';

export const ArchitectureFlow: React.FC = () => {
  const steps = [
    {
      num: '01',
      title: 'Lock Target Tab',
      icon: <Layers size={18} className="text-indigo-600" />,
      desc: 'Locks strictly to targetTabId on Start. Other tabs are untouched; if tab closes, session terminates safely.',
    },
    {
      num: '02',
      title: 'DOM MCQ Detection',
      icon: <Search size={18} className="text-indigo-600" />,
      desc: 'Detects question titles and interactive choices across radios, labels, buttons, clickable div cards, and ARIA roles.',
    },
    {
      num: '03',
      title: 'Query Gemini AI',
      icon: <BrainCircuit size={18} className="text-purple-600" />,
      desc: 'Sends Question + Options array to Gemini receiving structured JSON with answer_index and confidence score.',
    },
    {
      num: '04',
      title: 'Simulated User Click',
      icon: <MousePointerClick size={18} className="text-pink-600" />,
      desc: 'Scrolls element into center view and dispatches full PointerEvent & MouseEvent sequence to trigger framework states.',
    },
    {
      num: '05',
      title: 'Multi-Signal Verification',
      icon: <ShieldCheck size={18} className="text-teal-600" />,
      desc: 'Verifies input.checked, aria-checked, aria-selected, class mutations, and visual state. Automatically retries if unverified.',
    },
    {
      num: '06',
      title: 'Dynamic Step Scroll',
      icon: <ArrowDown size={18} className="text-amber-600" />,
      desc: 'Smoothly scrolls down the viewport, triggers lazy-loaded or infinite-scroll questions, and loops until document bottom is reached.',
    },
    {
      num: '07',
      title: 'Final Scan & Submit',
      icon: <Send size={18} className="text-emerald-600" />,
      desc: 'Performs full document verification. If remaining unanswered = 0, locates the quiz Submit button and verifies results.',
    },
  ];

  return (
    <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-6 lg:p-8 space-y-6 overflow-y-auto shadow-sm">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold mb-3">
          <Cpu size={14} />
          <span>Manifest V3 Autonomous Pipeline</span>
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Autonomous Agent State Machine & Lifecycle
        </h2>
        <p className="text-slate-500 text-sm mt-1 max-w-2xl font-medium">
          The extension executes an end-to-end loop: Detect → Understand → Ask Gemini → Click Answer → Verify → Scroll → Repeat → Submit.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {steps.map((step) => (
          <div
            key={step.num}
            className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between hover:border-indigo-300 hover:shadow-xs transition"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-xs">
                  {step.icon}
                </div>
                <span className="text-xs font-mono font-bold text-slate-400">{step.num}</span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1.5">{step.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Security & Isolation Callout */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            Tab Isolation & Memory Security
          </h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            The service worker stores <code className="text-indigo-700 bg-slate-200/80 px-1 py-0.5 rounded font-mono font-bold">targetTabId</code> and restricts all messaging strictly to that tab. Working in other tabs causes no automation or interference.
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            CAPTCHA & Human Verification Protection
          </h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            Whenever Cloudflare Turnstile, reCAPTCHA, or security challenges are detected, the extension immediately pauses and yields control to the user with 1-click resumption.
          </p>
        </div>
      </div>
    </div>
  );
};
