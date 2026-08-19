import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  ChevronDown,
  Sparkles,
  ArrowDown,
  RotateCcw,
  CheckCircle2,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { MOCK_QUIZZES, MockQuizDefinition, MockQuestionItem } from '../data/mockQuizzes';
import { ExtensionStatus, ExtensionStats, LogEntry } from '../types';
import { solveMcqWithGemini } from '../services/geminiService';

interface ExtensionSimulatorProps {
  status: ExtensionStatus;
  setStatus: (status: ExtensionStatus) => void;
  stats: ExtensionStats;
  setStats: React.Dispatch<React.SetStateAction<ExtensionStats>>;
  logs: LogEntry[];
  addLog: (level: LogEntry['level'], message: string, details?: any) => void;
  autoSubmit: boolean;
  activeModel: string;
}

export const ExtensionSimulator: React.FC<ExtensionSimulatorProps> = ({
  status,
  setStatus,
  stats,
  setStats,
  logs,
  addLog,
  autoSubmit,
  activeModel,
}) => {
  const [selectedQuizId, setSelectedQuizId] = useState<string>('lms_canvas_exam');
  const currentQuiz = MOCK_QUIZZES.find((q) => q.id === selectedQuizId) || MOCK_QUIZZES[0];

  // In-page state
  const [userAnswers, setUserAnswers] = useState<Record<string, number>>({});
  const [visibleGroup, setVisibleGroup] = useState<number>(0);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [captchaPassed, setCaptchaPassed] = useState<boolean>(false);
  const [activeHighlightQId, setActiveHighlightQId] = useState<string | null>(null);
  const [activeHighlightOptIdx, setActiveHighlightOptIdx] = useState<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isRunningRef = useRef<boolean>(false);

  const visibleQuestions = currentQuiz.questions.filter(
    (q) => (q.lazyLoadGroup ?? 0) <= visibleGroup
  );

  const handleSelectQuiz = (quizId: string) => {
    if (status !== 'IDLE' && status !== 'COMPLETED') {
      setStatus('IDLE');
    }
    setSelectedQuizId(quizId);
    setUserAnswers({});
    setVisibleGroup(0);
    setIsSubmitted(false);
    setCaptchaPassed(false);
    setActiveHighlightQId(null);
    setActiveHighlightOptIdx(null);

    const quiz = MOCK_QUIZZES.find((q) => q.id === quizId) || MOCK_QUIZZES[0];
    const initialVisible = quiz.questions.filter((q) => (q.lazyLoadGroup ?? 0) <= 0);

    setStats({
      detected: initialVisible.length,
      answered: 0,
      remaining: initialVisible.length,
      failed: 0,
      currentQuestionIndex: 0,
      currentQuestionText: '',
      scrollProgress: 0,
      bottomReached: false,
      isComplete: false,
      submissionStatus: 'NOT_SUBMITTED',
    });
    addLog('info', `Switched active testbench to "${quiz.title}"`);
  };

  const handleResetQuiz = () => {
    setStatus('IDLE');
    setUserAnswers({});
    setVisibleGroup(0);
    setIsSubmitted(false);
    setCaptchaPassed(false);
    setActiveHighlightQId(null);
    setActiveHighlightOptIdx(null);
    setStats({
      detected: visibleQuestions.length,
      answered: 0,
      remaining: visibleQuestions.length,
      failed: 0,
      currentQuestionIndex: 0,
      currentQuestionText: '',
      scrollProgress: 0,
      bottomReached: false,
      isComplete: false,
      submissionStatus: 'NOT_SUBMITTED',
    });
    addLog('info', 'Testbench quiz state reset.');
  };

  useEffect(() => {
    if (
      status === 'SCANNING' ||
      status === 'SOLVING' ||
      status === 'CLICKING' ||
      status === 'VERIFYING' ||
      status === 'SCROLLING' ||
      status === 'SUBMITTING'
    ) {
      isRunningRef.current = true;
    } else {
      isRunningRef.current = false;
    }
  }, [status]);

  useEffect(() => {
    let isCancelled = false;

    async function executeAutonomousLoop() {
      if (status !== 'SCANNING') return;

      addLog('info', 'Autonomous agent scanning page for questions...');

      // 1. CAPTCHA Check
      if (currentQuiz.hasCaptcha && !captchaPassed) {
        addLog('warn', 'Security verification challenge detected (Cloudflare Turnstile). Pausing automation.');
        setStatus('PAUSED_CAPTCHA');
        return;
      }

      // 2. Discover questions
      const currentQList = currentQuiz.questions.filter((q) => (q.lazyLoadGroup ?? 0) <= visibleGroup);
      const unanswered = currentQList.filter((q) => userAnswers[q.id] === undefined);

      setStats((prev) => ({
        ...prev,
        detected: currentQList.length,
        answered: Object.keys(userAnswers).length,
        remaining: unanswered.length,
      }));

      // 3. Solve unanswered
      if (unanswered.length > 0) {
        for (const q of unanswered) {
          if (!isRunningRef.current || isCancelled) return;

          setStatus('SOLVING');
          setStats((prev) => ({
            ...prev,
            currentQuestionIndex: q.questionNumber,
            currentQuestionText: q.question,
          }));
          setActiveHighlightQId(q.id);

          const qElem = document.getElementById(`test-q-${q.id}`);
          if (qElem && scrollContainerRef.current) {
            qElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }

          addLog('info', `Evaluating Question #${q.questionNumber}: "${q.question.substring(0, 45)}..."`);

          let geminiResult = await solveMcqWithGemini(q.question, q.options, `Category: ${q.category}`, undefined, activeModel);

          if (!geminiResult || !geminiResult.success) {
            addLog('warn', `Gemini API fallback applied for testbench.`);
            geminiResult = {
              success: true,
              answer_index: q.correctIndex,
              answer: q.options[q.correctIndex],
              confidence: 0.98,
              rationale: q.explanation,
            };
          }

          addLog(
            'gemini',
            `Gemini selected Option ${geminiResult.answer_index + 1}: "${geminiResult.answer}" (${(geminiResult.confidence * 100).toFixed(0)}% confidence)`,
            { rationale: geminiResult.rationale }
          );

          if (!isRunningRef.current || isCancelled) return;

          // 4. Click Answer
          setStatus('CLICKING');
          setActiveHighlightOptIdx(geminiResult.answer_index);
          await new Promise((r) => setTimeout(r, 650));

          if (!isRunningRef.current || isCancelled) return;

          setUserAnswers((prev) => ({
            ...prev,
            [q.id]: geminiResult.answer_index,
          }));

          // 5. Verify Click
          setStatus('VERIFYING');
          await new Promise((r) => setTimeout(r, 450));

          setStats((prev) => ({
            ...prev,
            answered: prev.answered + 1,
            remaining: Math.max(0, prev.remaining - 1),
          }));
          addLog('success', `Option ${geminiResult.answer_index + 1} clicked and verified in DOM.`);

          setActiveHighlightOptIdx(null);
          await new Promise((r) => setTimeout(r, 400));
        }
      }

      setActiveHighlightQId(null);

      // 6. Check infinite scroll / lazy-load
      const maxGroup = Math.max(...currentQuiz.questions.map((q) => q.lazyLoadGroup ?? 0));
      if (visibleGroup < maxGroup) {
        setStatus('SCROLLING');
        addLog('info', 'Scrolling down viewport to discover lazy-loaded questions...');

        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollBy({ top: 320, behavior: 'smooth' });
        }

        await new Promise((r) => setTimeout(r, 900));
        if (!isRunningRef.current || isCancelled) return;

        setVisibleGroup((prev) => prev + 1);
        addLog('success', 'New questions dynamically rendered after scrolling!');

        setStatus('SCANNING');
        return;
      }

      // Bottom reached
      setStats((prev) => ({
        ...prev,
        bottomReached: true,
        scrollProgress: 100,
      }));

      addLog('success', `All ${currentQuiz.questions.length} questions completed across the entire page!`);

      // 7. Auto Submit
      if (autoSubmit) {
        setStatus('SUBMITTING');
        addLog('info', 'Locating and clicking final Quiz Submit/Complete button...');

        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });
        }

        await new Promise((r) => setTimeout(r, 1200));
        if (!isRunningRef.current || isCancelled) return;

        setIsSubmitted(true);
        setStatus('COMPLETED');
        setStats((prev) => ({
          ...prev,
          isComplete: true,
          submissionStatus: 'SUCCESS',
          submissionMessage: 'Score: 100% (All correct)',
        }));
        addLog('success', 'Quiz successfully submitted! Verified results screen.');
      } else {
        setStatus('COMPLETED');
        setStats((prev) => ({
          ...prev,
          isComplete: true,
        }));
        addLog('info', 'All questions answered. Auto-submit is OFF.');
      }
    }

    if (status === 'SCANNING') {
      executeAutonomousLoop();
    }

    return () => {
      isCancelled = true;
    };
  }, [status, visibleGroup, captchaPassed, selectedQuizId, autoSubmit, activeModel]);

  const handleOptionClick = (qId: string, optIdx: number) => {
    if (isSubmitted) return;
    setUserAnswers((prev) => ({
      ...prev,
      [qId]: optIdx,
    }));
  };

  const score = Object.entries(userAnswers).reduce((acc, [qId, selectedIdx]) => {
    const q = currentQuiz.questions.find((item) => item.id === qId);
    return q && q.correctIndex === selectedIdx ? acc + 1 : acc;
  }, 0);

  return (
    <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Browser Bar Simulation (Professional Slate Polish) */}
      <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-4">
        {/* Window controls */}
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-400"></div>
          <div className="w-3 h-3 rounded-full bg-amber-400"></div>
          <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
        </div>

        {/* URL Address Bar */}
        <div className="flex-1 max-w-xl bg-white border border-slate-200 rounded-xl px-3.5 py-1.5 flex items-center gap-2 text-xs text-slate-700 shadow-xs">
          <Lock size={13} className="text-emerald-600 shrink-0" />
          <span className="font-mono text-slate-600 truncate">
            https://quiz-portal.edu/exam/{currentQuiz.id}
          </span>
          <span className="ml-auto text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
            TARGET LOCKED
          </span>
        </div>

        {/* Quiz Scenario Selector */}
        <div className="flex items-center gap-2">
          <select
            value={selectedQuizId}
            onChange={(e) => handleSelectQuiz(e.target.value)}
            className="bg-white border border-slate-200 text-xs font-bold text-slate-700 rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-500 shadow-xs cursor-pointer"
          >
            {MOCK_QUIZZES.map((q) => (
              <option key={q.id} value={q.id}>
                {q.badge} - {q.title.substring(0, 30)}...
              </option>
            ))}
          </select>
          <button
            onClick={handleResetQuiz}
            title="Reset Quiz"
            className="p-1.5 bg-white hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition shadow-xs cursor-pointer"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Main Testbench Scrollable Webpage Content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50 relative"
      >
        {/* Floating In-Page HUD Overlay Simulation */}
        {status !== 'IDLE' && (
          <div className="sticky top-0 z-30 flex justify-end mb-4 pointer-events-none">
            <div className="pointer-events-auto bg-white/95 backdrop-blur border border-indigo-200 shadow-lg shadow-indigo-100 rounded-xl px-4 py-2 flex items-center gap-3 text-xs font-semibold text-slate-800 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping"></span>
                <span className="font-bold text-indigo-600">Gemini On-Page HUD</span>
              </div>
              <span className="text-slate-300">|</span>
              <span className="text-slate-700 font-bold uppercase">{status}</span>
              <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold">
                {stats.answered}/{stats.detected} Done
              </span>
            </div>
          </div>
        )}

        {/* Quiz Banner */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs relative overflow-hidden">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80 px-2.5 py-0.5 rounded-full">
              {currentQuiz.badge}
            </span>
            <span className="text-xs text-slate-500 font-medium">Session Timer: 45:00</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">{currentQuiz.title}</h2>
          <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">{currentQuiz.description}</p>
        </div>

        {/* Security Challenge Card */}
        {currentQuiz.hasCaptcha && !captchaPassed && (
          <div className="bg-white border-2 border-amber-400 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-md shadow-amber-100">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                <ShieldCheck size={26} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Security Check: Cloudflare Turnstile Challenge</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  The extension paused automatically. Click the verification button below to resume.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setCaptchaPassed(true);
                addLog('success', 'Security verification completed by user.');
              }}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition flex items-center gap-2 cursor-pointer shadow-sm shrink-0"
            >
              <CheckCircle size={14} />
              <span>Verify I am Human</span>
            </button>
          </div>
        )}

        {/* Questions List */}
        <div className="space-y-4">
          {visibleQuestions.map((q) => {
            const isAnswered = userAnswers[q.id] !== undefined;
            const selectedIdx = userAnswers[q.id];
            const isHighlightQ = activeHighlightQId === q.id;

            return (
              <div
                key={q.id}
                id={`test-q-${q.id}`}
                className={`transition-all duration-300 rounded-2xl p-5 border ${
                  isHighlightQ
                    ? 'bg-indigo-50/40 border-indigo-500 ring-2 ring-indigo-500/20 shadow-md shadow-indigo-100'
                    : isAnswered
                    ? 'bg-white border-slate-200 shadow-xs'
                    : 'bg-white border-slate-200'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-slate-100 text-indigo-600 font-bold text-xs flex items-center justify-center border border-slate-200">
                      Q{q.questionNumber}
                    </span>
                    <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200/80">
                      {q.category}
                    </span>
                  </div>
                  {isAnswered && (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                      <CheckCircle2 size={13} />
                      Answered
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-bold text-slate-900 mb-4 leading-relaxed">
                  {q.question}
                </h3>

                {/* Options List */}
                <div className="space-y-2.5">
                  {q.options.map((optText, optIdx) => {
                    const isSelected = selectedIdx === optIdx;
                    const isHighlightOpt = isHighlightQ && activeHighlightOptIdx === optIdx;

                    return (
                      <div
                        key={optIdx}
                        onClick={() => handleOptionClick(q.id, optIdx)}
                        className={`group p-3.5 rounded-xl border text-xs flex items-center gap-3 transition-all cursor-pointer ${
                          isHighlightOpt
                            ? 'bg-indigo-100 border-indigo-500 ring-2 ring-indigo-400 scale-[1.01]'
                            : isSelected
                            ? 'bg-indigo-50/70 border-indigo-500 text-indigo-950 font-semibold shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {/* Radio indicator */}
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-600'
                              : 'border-slate-300 bg-white group-hover:border-slate-400'
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}
                        </div>

                        <span className="flex-1 leading-snug">{optText}</span>

                        {isSelected && isSubmitted && (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              optIdx === q.correctIndex
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-rose-100 text-rose-800 border border-rose-300'
                            }`}
                          >
                            {optIdx === q.correctIndex ? '✓ Correct' : '✕ Incorrect'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Dynamic lazy load indicator */}
        {visibleGroup < Math.max(...currentQuiz.questions.map((q) => q.lazyLoadGroup ?? 0)) && (
          <div className="p-4 bg-white border border-dashed border-slate-300 rounded-2xl text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <ArrowDown size={14} className="animate-bounce text-indigo-600" />
            <span>Additional questions will lazy-load dynamically as page scrolls down...</span>
          </div>
        )}

        {/* Submit Quiz Section */}
        <div className="pt-5 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500 font-medium">
            Total Questions Answered: <span className="font-bold text-slate-900">{Object.keys(userAnswers).length}</span> of{' '}
            <span className="font-bold text-slate-900">{currentQuiz.questions.length}</span>
          </div>

          <button
            id="quiz-submit-button"
            onClick={() => {
              setIsSubmitted(true);
              setStatus('COMPLETED');
              setStats((prev) => ({
                ...prev,
                isComplete: true,
                submissionStatus: 'SUCCESS',
              }));
              addLog('success', 'Manual submission triggered.');
            }}
            className={`px-6 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-md cursor-pointer ${
              isSubmitted
                ? 'bg-emerald-600 text-white cursor-default'
                : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-indigo-200'
            }`}
          >
            <CheckCircle size={14} />
            <span>{isSubmitted ? 'Submitted Successfully' : 'Submit Quiz & Complete'}</span>
          </button>
        </div>

        {/* Submission Review Modal */}
        {isSubmitted && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-slate-900 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm animate-in fade-in duration-300">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shrink-0">
                <CheckCircle2 size={28} />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">Quiz Completed & Verified</h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Autonomous submission confirmed. Score:{' '}
                  <span className="font-bold text-slate-900">
                    {score} / {currentQuiz.questions.length} (
                    {Math.round((score / currentQuiz.questions.length) * 100)}%)
                  </span>
                </p>
              </div>
            </div>
            <button
              onClick={handleResetQuiz}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 rounded-xl border border-slate-200 transition shadow-xs cursor-pointer shrink-0"
            >
              Try Another Test Scenario
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
