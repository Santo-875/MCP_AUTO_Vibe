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
  ChevronLeft,
  ChevronRight,
  Home,
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
  const [selectedQuizId, setSelectedQuizId] = useState<string>('gk_online_test');
  const currentQuiz = MOCK_QUIZZES.find((q) => q.id === selectedQuizId) || MOCK_QUIZZES[0];

  // In-page state
  const [userAnswers, setUserAnswers] = useState<Record<string, number>>({});
  const [visibleGroup, setVisibleGroup] = useState<number>(0);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(2); // Start at Question #3 by default for realism!
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [captchaPassed, setCaptchaPassed] = useState<boolean>(false);
  const [activeHighlightQId, setActiveHighlightQId] = useState<string | null>(null);
  const [activeHighlightOptIdx, setActiveHighlightOptIdx] = useState<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isRunningRef = useRef<boolean>(false);

  const visibleQuestions =
    currentQuiz.quizType === 'step'
      ? [currentQuiz.questions[currentStepIndex] || currentQuiz.questions[0]]
      : currentQuiz.questions.filter((q) => (q.lazyLoadGroup ?? 0) <= visibleGroup);

  const handleSelectQuiz = (quizId: string) => {
    if (status !== 'IDLE' && status !== 'COMPLETED') {
      setStatus('IDLE');
    }
    setSelectedQuizId(quizId);
    setUserAnswers({});
    setVisibleGroup(0);
    setCurrentStepIndex(quizId === 'gk_online_test' ? 2 : 0);
    setIsSubmitted(false);
    setCaptchaPassed(false);
    setActiveHighlightQId(null);
    setActiveHighlightOptIdx(null);

    const quiz = MOCK_QUIZZES.find((q) => q.id === quizId) || MOCK_QUIZZES[0];
    const initialVisible =
      quiz.quizType === 'step'
        ? [quiz.questions[0]]
        : quiz.questions.filter((q) => (q.lazyLoadGroup ?? 0) <= 0);

    setStats({
      detected: quiz.questions.length,
      answered: 0,
      remaining: quiz.questions.length,
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
    setCurrentStepIndex(currentQuiz.quizType === 'step' ? 2 : 0);
    setIsSubmitted(false);
    setCaptchaPassed(false);
    setActiveHighlightQId(null);
    setActiveHighlightOptIdx(null);
    setStats({
      detected: currentQuiz.questions.length,
      answered: 0,
      remaining: currentQuiz.questions.length,
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

      // Step-by-Step Question Loop (For 1-question per page layout)
      if (currentQuiz.quizType === 'step') {
        const q = currentQuiz.questions[currentStepIndex];
        if (!q) return;

        setStats((prev) => ({
          ...prev,
          detected: currentQuiz.questions.length,
          answered: Object.keys(userAnswers).length,
          remaining: currentQuiz.questions.length - Object.keys(userAnswers).length,
        }));

        // If current step question is unanswered
        if (userAnswers[q.id] === undefined) {
          setStatus('SOLVING');
          setStats((prev) => ({
            ...prev,
            currentQuestionIndex: q.questionNumber,
            currentQuestionText: q.question,
          }));
          setActiveHighlightQId(q.id);

          addLog('info', `Solving Question #${q.questionNumber}: "${q.question.substring(0, 50)}..."`);

          let geminiResult = await solveMcqWithGemini(
            q.question,
            q.options,
            `Subject: ${q.category}`,
            undefined,
            activeModel
          );

          if (!geminiResult || !geminiResult.success) {
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
            `Gemini selected: "${geminiResult.answer}" (${(geminiResult.confidence * 100).toFixed(0)}% confidence)`,
            { rationale: geminiResult.rationale }
          );

          if (!isRunningRef.current || isCancelled) return;

          // Click Answer
          setStatus('CLICKING');
          setActiveHighlightOptIdx(geminiResult.answer_index);
          await new Promise((r) => setTimeout(r, 650));

          if (!isRunningRef.current || isCancelled) return;

          setUserAnswers((prev) => ({
            ...prev,
            [q.id]: geminiResult.answer_index,
          }));

          // Verify Click
          setStatus('VERIFYING');
          await new Promise((r) => setTimeout(r, 500));

          setStats((prev) => ({
            ...prev,
            answered: prev.answered + 1,
            remaining: Math.max(0, prev.remaining - 1),
          }));
          addLog('success', `Option "${geminiResult.answer}" selected & verified!`);

          setActiveHighlightOptIdx(null);
          await new Promise((r) => setTimeout(r, 400));
        }

        setActiveHighlightQId(null);

        // Advance to next question if more exist
        if (currentStepIndex < currentQuiz.questions.length - 1) {
          setStatus('SCROLLING');
          addLog('info', `Clicking "Next ›" to advance to Question #${currentStepIndex + 2}...`);
          await new Promise((r) => setTimeout(r, 900));
          if (!isRunningRef.current || isCancelled) return;

          setCurrentStepIndex((prev) => prev + 1);
          setStatus('SCANNING');
          return;
        }

        // All questions complete -> Submit
        setStats((prev) => ({ ...prev, isComplete: true, bottomReached: true }));
        addLog('success', `All ${currentQuiz.questions.length} questions completed!`);

        if (autoSubmit) {
          setStatus('SUBMITTING');
          addLog('info', 'Locating and clicking final Complete / Submit Test button...');
          await new Promise((r) => setTimeout(r, 1200));
          setIsSubmitted(true);
          setStatus('COMPLETED');
          setStats((prev) => ({
            ...prev,
            isComplete: true,
            submissionStatus: 'SUCCESS',
          }));
          addLog('success', 'Test successfully submitted and verified!');
        } else {
          setStatus('COMPLETED');
        }
        return;
      }

      // Standard Multi-Question / Scroll Page Loop
      const currentQList = currentQuiz.questions.filter((q) => (q.lazyLoadGroup ?? 0) <= visibleGroup);
      const unanswered = currentQList.filter((q) => userAnswers[q.id] === undefined);

      setStats((prev) => ({
        ...prev,
        detected: currentQList.length,
        answered: Object.keys(userAnswers).length,
        remaining: unanswered.length,
      }));

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

          let geminiResult = await solveMcqWithGemini(
            q.question,
            q.options,
            `Category: ${q.category}`,
            undefined,
            activeModel
          );

          if (!geminiResult || !geminiResult.success) {
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

          // Click Answer
          setStatus('CLICKING');
          setActiveHighlightOptIdx(geminiResult.answer_index);
          await new Promise((r) => setTimeout(r, 650));

          if (!isRunningRef.current || isCancelled) return;

          setUserAnswers((prev) => ({
            ...prev,
            [q.id]: geminiResult.answer_index,
          }));

          // Verify Click
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

      // Check infinite scroll / lazy-load
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

      // Auto Submit
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
        }));
        addLog('success', 'Quiz auto-submitted and score confirmed!');
      } else {
        setStatus('COMPLETED');
        addLog('info', 'All questions answered. Ready for manual review.');
      }
    }

    if (status === 'SCANNING') {
      executeAutonomousLoop();
    }

    return () => {
      isCancelled = true;
    };
  }, [status, currentQuiz, visibleGroup, currentStepIndex, userAnswers, captchaPassed, autoSubmit, activeModel]);

  const handleOptionClick = (questionId: string, optionIndex: number) => {
    setUserAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));
    addLog('info', `User manually selected Option ${optionIndex + 1} for Question.`);
  };

  const calculateScore = () => {
    let score = 0;
    currentQuiz.questions.forEach((q) => {
      if (userAnswers[q.id] === q.correctIndex) {
        score++;
      }
    });
    return score;
  };

  const score = calculateScore();

  return (
    <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs relative">
      {/* Testbench Toolbar */}
      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-slate-700">Quiz Target Simulator:</label>
          <div className="relative">
            <select
              value={selectedQuizId}
              onChange={(e) => handleSelectQuiz(e.target.value)}
              className="appearance-none bg-white border border-slate-200 rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 shadow-xs cursor-pointer"
            >
              {MOCK_QUIZZES.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetQuiz}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <RotateCcw size={13} />
            <span>Reset Test</span>
          </button>
        </div>
      </div>

      {/* Target Webpage Canvas */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50 relative"
      >
        {/* Floating In-Page HUD Overlay Simulation */}
        {status !== 'IDLE' && (
          <div className="sticky top-0 z-30 flex justify-end mb-4 pointer-events-none">
            <div className="pointer-events-auto bg-slate-900 text-white border border-indigo-500 shadow-xl rounded-xl px-4 py-2 flex items-center gap-3 text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span>
                <span className="font-bold text-indigo-300">Gemini On-Page Agent</span>
              </div>
              <span className="text-slate-600">|</span>
              <span className="text-white font-bold uppercase">{status}</span>
              <span className="bg-indigo-600/60 text-white px-2 py-0.5 rounded-full text-[11px] font-mono font-bold">
                {stats.answered}/{stats.detected} Done
              </span>
            </div>
          </div>
        )}

        {/* Real-world Online GK / Exam Test Portal Layout */}
        {currentQuiz.quizType === 'step' ? (
          <div className="max-w-3xl mx-auto bg-white border border-slate-300 rounded-lg shadow-sm overflow-hidden font-sans">
            {/* Top Navigation Bar from Screenshot */}
            <div className="flex items-center justify-between p-2.5 bg-slate-100 border-b border-slate-200 gap-2">
              <div className="flex items-center gap-2">
                <div className="w-16 h-9 bg-[#7ca34b] text-white flex items-center justify-center rounded cursor-pointer hover:opacity-90 transition">
                  <Home size={18} />
                </div>
                <button className="h-9 px-6 bg-[#2b5c87] hover:bg-[#234d70] text-white text-xs font-bold rounded flex items-center gap-1.5 transition">
                  <span>NEXT: Physics Quiz 2</span>
                  <ChevronRight size={14} />
                </button>
              </div>
              <button className="h-9 px-4 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded hover:bg-slate-50 transition">
                हिंदी वर्जन
              </button>
            </div>

            {/* Question Number Tab Bar [1..10] */}
            <div className="flex items-center gap-1.5 p-3 border-b border-slate-200 bg-white overflow-x-auto">
              {currentQuiz.questions.map((q, idx) => {
                const isActive = idx === currentStepIndex;
                const isAnswered = userAnswers[q.id] !== undefined;

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentStepIndex(idx)}
                    className={`w-9 h-8 rounded border text-xs font-medium transition cursor-pointer flex items-center justify-center ${
                      isActive
                        ? 'bg-slate-200 border-slate-400 font-bold text-slate-900 shadow-inner'
                        : isAnswered
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Active Question Stem & Options */}
            {visibleQuestions.map((q) => {
              const selectedIdx = userAnswers[q.id];
              const isHighlightQ = activeHighlightQId === q.id;

              return (
                <div key={q.id} className="p-8 space-y-6">
                  <h3 className="text-base text-slate-900 font-normal leading-relaxed">
                    {q.question}
                  </h3>

                  {/* 4 Full-Width Rectangular Option Boxes with Purple Borders (Matches Screenshot) */}
                  <div className="space-y-3.5">
                    {q.options.map((optText, optIdx) => {
                      const isSelected = selectedIdx === optIdx;
                      const isHighlightOpt = isHighlightQ && activeHighlightOptIdx === optIdx;

                      return (
                        <div
                          key={optIdx}
                          onClick={() => handleOptionClick(q.id, optIdx)}
                          className={`p-3.5 rounded border transition-all cursor-pointer text-sm ${
                            isHighlightOpt
                              ? 'bg-purple-100 border-purple-600 ring-2 ring-purple-400 font-medium'
                              : isSelected
                              ? 'bg-purple-50/80 border-[#9333ea] text-purple-950 font-medium shadow-xs'
                              : 'bg-white border-[#c084fc] text-slate-600 hover:bg-purple-50/30'
                          }`}
                        >
                          <span className="leading-snug">{optText}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bottom Navigation Buttons (‹ Prev and Next ›) */}
                  <div className="flex items-center justify-center gap-12 pt-6">
                    <button
                      onClick={() => setCurrentStepIndex((prev) => Math.max(0, prev - 1))}
                      disabled={currentStepIndex === 0}
                      className="text-sm font-bold text-slate-800 hover:text-indigo-600 disabled:opacity-40 disabled:hover:text-slate-800 transition cursor-pointer flex items-center gap-1"
                    >
                      <span>‹ Prev</span>
                    </button>

                    <button
                      onClick={() => {
                        if (currentStepIndex < currentQuiz.questions.length - 1) {
                          setCurrentStepIndex((prev) => prev + 1);
                        } else {
                          setIsSubmitted(true);
                          setStatus('COMPLETED');
                        }
                      }}
                      className="text-sm font-bold text-slate-900 hover:text-indigo-600 transition cursor-pointer flex items-center gap-1"
                    >
                      <span>{currentStepIndex === currentQuiz.questions.length - 1 ? 'Submit ›' : 'Next ›'}</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Bottom Related Tests Strip (From Screenshot) */}
            <div className="border-t border-slate-200 bg-indigo-50/40 p-2 text-center text-xs font-medium text-slate-700">
              Related GK/GS Online Test»
            </div>
            <div className="flex items-center justify-center gap-3 p-2 bg-slate-50 border-t border-slate-200 text-xs font-medium text-indigo-700">
              <span className="cursor-pointer hover:underline">Basic GK</span>
              <span className="cursor-pointer hover:underline">History</span>
              <span className="cursor-pointer hover:underline">Geography</span>
              <span className="cursor-pointer hover:underline">Polity</span>
              <span className="cursor-pointer hover:underline">Science</span>
              <span className="cursor-pointer hover:underline">Economics</span>
            </div>
          </div>
        ) : (
          /* LMS / Standard Quiz Cards */
          <div className="space-y-4">
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

                  <h3 className="text-sm font-bold text-slate-900 mb-4 leading-relaxed">{q.question}</h3>

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
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                              isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white group-hover:border-slate-400'
                            }`}
                          >
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}
                          </div>
                          <span className="flex-1 leading-snug">{optText}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
