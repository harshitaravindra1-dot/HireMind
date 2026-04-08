export const MOCK_COACH_RESPONSE = {
  feedback: 'Good answer with clear structure. Consider adding a specific example to strengthen your response.',
  scores: {
    clarity: 7,
    confidence: 6,
    relevance: 8,
  },
  improvedAnswer:
    'In my previous role, I led a team of 4 engineers to deliver a key product feature 2 weeks ahead of schedule by implementing daily standups and a clear sprint plan. This experience taught me that proactive communication is the key to project success.',
  practiceScript: {
    openingLine: 'I have led high-impact delivery work under tight timelines.',
    corePoints: [
      'I aligned the team with clear sprint goals and daily standups.',
      'I removed blockers quickly and kept stakeholders updated.',
      'We shipped ahead of schedule with measurable performance gains.',
    ],
    closingLine: 'That experience proved my ability to lead execution with impact.',
    fullScript:
      'I have led high-impact delivery work under tight timelines. I aligned the team with clear sprint goals and daily standups, removed blockers quickly, and kept stakeholders updated. We shipped ahead of schedule with measurable performance gains. That experience proved my ability to lead execution with impact.',
  },
  strengths: ['Clear communication', 'Relevant experience mentioned'],
  weaknesses: ['Missing specific metrics', 'Could be more concise'],
  whatWasGood: ['"I led a team of 4 engineers"', '"delivered ... 2 weeks ahead of schedule"'],
  whatToReplace: [
    { original: 'I worked on it', better: 'I led delivery end-to-end', reason: 'Shows ownership and leadership.' },
    { original: 'it was successful', better: 'it reduced load time by 40%', reason: 'Adds measurable impact.' },
  ],
  missingKeywords: ['example', 'result', 'impact'],
  fillerInsights: {
    count: 3,
    densityPer100Words: 5,
    topFillers: ['like', 'you know'],
    alternatives: ['Use a short pause', 'Use "specifically"', 'Use "for example"'],
  },
  suggestions: ['Use the STAR method', 'Quantify your achievements', 'Practice your intro'],
  transcriptEvidence: ['Consider adding one measurable result to increase impact.'],
  followups: ['What metric improved?', 'How did your team align?', 'What would you improve next time?'],
};

export const MOCK_QUESTIONS = [
  'Tell me about yourself.',
  'What is your greatest professional achievement?',
  'How do you handle tight deadlines?',
];
