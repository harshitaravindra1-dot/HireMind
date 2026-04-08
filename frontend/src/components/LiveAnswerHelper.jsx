import React, { useEffect, useMemo, useRef, useState } from 'react';

const PHRASE_SUGGESTIONS = {
  example: 'For example, in my previous role...',
  result: 'The result of this was...',
  team: 'I collaborated with my team to...',
  impact: 'This created measurable impact by...',
  approach: 'My approach was to first clarify requirements...',
  tradeoff: 'The trade-off here was...',
  scale: 'At scale, I would optimize by...',
  metric: 'I measured success using...',
  ownership: 'I took ownership by...',
  challenge: 'The main challenge was...',
};

/**
 * Live helper panel while speech recognition is active.
 * @param {{ transcript: string, expectedKeywords: string[] }} props
 */
export default function LiveAnswerHelper({ transcript = '', expectedKeywords = [] }) {
  const [speechRateWarning, setSpeechRateWarning] = useState('');
  const wordCountRef = useRef(0);

  const normalized = String(transcript || '').toLowerCase();
  const missing = useMemo(
    () => (expectedKeywords || []).filter((kw) => kw && !normalized.includes(String(kw).toLowerCase())),
    [expectedKeywords, normalized]
  );

  useEffect(() => {
    const id = setInterval(() => {
      const words = normalized.split(/\s+/).filter(Boolean).length;
      const delta = words - wordCountRef.current;
      wordCountRef.current = words;
      setSpeechRateWarning(delta > 30 ? '🐢 Speak a bit slower' : '');
    }, 5000);
    return () => clearInterval(id);
  }, [normalized]);

  return (
    <div className="fixed bottom-20 right-6 w-[280px] z-40 bg-white border border-gray-200 rounded-xl shadow-lg p-3">
      <div className="text-xs font-black mb-2">💡 Live Answer Helper</div>
      <div className="text-[11px] text-gray-500 mb-1">Missing keywords:</div>
      <div className="flex flex-wrap gap-1 mb-2">
        {(expectedKeywords || []).slice(0, 8).map((kw) => {
          const has = !missing.includes(kw);
          return (
            <span
              key={kw}
              className={`px-2 py-0.5 rounded-full text-[10px] border transition-all ${
                has ? 'bg-green-50 text-green-700 border-green-200 opacity-60' : 'bg-red-50 text-red-600 border-red-200'
              }`}
            >
              {kw}
            </span>
          );
        })}
      </div>
      <div className="text-[11px] text-gray-500 mb-1">Try saying:</div>
      <div className="text-[11px] text-gray-700 bg-cream border border-linen rounded-lg p-2">
        {PHRASE_SUGGESTIONS[(missing[0] || '').toLowerCase()] || 'Start with context, then your action, then result.'}
      </div>
      {speechRateWarning && <div className="text-[11px] text-amber-700 mt-2">{speechRateWarning}</div>}
    </div>
  );
}
