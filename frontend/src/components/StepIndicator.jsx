import React from 'react';

/**
 * Minimal step indicator text for the 5-step demo flow.
 * @param {{step: number, total?: number, labels?: string[]}} props
 */
export default function StepIndicator({ step, total = 5, labels = [] }) {
  const safeStep = Math.max(1, Math.min(total, Number(step) || 1));
  const label = labels[safeStep - 1] || 'Interview';
  return (
    <div className="text-[11px] font-black uppercase tracking-widest text-gray-500">
      Step {safeStep} of {total} — {label}
    </div>
  );
}
