import React from 'react';

/**
 * Compact interview summary card rendered after coaching.
 * @param {{strengths: string[], weaknesses: string[], suggestions: string[]}} props
 */
export default function SummaryPanel({ strengths = [], weaknesses = [], suggestions = [] }) {
  const safeStrengths = strengths.length ? strengths : ['Clear communication'];
  const safeWeaknesses = weaknesses.length ? weaknesses : ['Lacked specific examples'];
  const safeSuggestions = suggestions.length ? suggestions : ['Use the STAR method'];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 my-4">
      <h3 className="text-sm font-black mb-3">📊 Interview Summary</h3>
      <div className="mb-3">
        <div className="text-xs font-black uppercase text-gray-500 mb-1">✅ Strengths</div>
        {safeStrengths.map((item, i) => (
          <p key={`st-${i}`} className="text-sm text-gray-700">• {item}</p>
        ))}
      </div>
      <div className="mb-3">
        <div className="text-xs font-black uppercase text-gray-500 mb-1">⚠️ Weaknesses</div>
        {safeWeaknesses.map((item, i) => (
          <p key={`wk-${i}`} className="text-sm text-gray-700">• {item}</p>
        ))}
      </div>
      <div>
        <div className="text-xs font-black uppercase text-gray-500 mb-1">💡 Suggestions</div>
        {safeSuggestions.map((item, i) => (
          <p key={`sg-${i}`} className="text-sm text-gray-700">• {item}</p>
        ))}
      </div>
    </div>
  );
}
