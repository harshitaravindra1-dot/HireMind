import { MOCK_COACH_RESPONSE, MOCK_QUESTIONS } from './utils/mockResponses.js';

const jsonHeaders = { 'Content-Type': 'application/json' };

async function handleJson(res) {
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Invalid JSON from server');
  }
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function apiParseResume(text) {
  // HIREMIND-AUDIT: frontend previously called /api/resume/parse here.
  console.warn('Endpoint /api/resume/parse replaced with mock for demo');
  const guessName = String(text || '').split('\n').map((x) => x.trim()).find(Boolean) || 'Candidate';
  return {
    parsed: {
      name: guessName.slice(0, 40),
      title: 'Software Engineer',
      skills: ['React', 'Node.js', 'Communication'],
      experience: [],
      projects: [],
      education: [],
      certifications: [],
    },
  };
}

export async function apiGenerateQuestions(parsed) {
  try {
    const res = await fetch('/api/resume/questions', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ parsed }),
    });
    return handleJson(res);
  } catch (err) {
    console.warn('Questions API failed — using mock response', err);
    return { raw: {}, flat: MOCK_QUESTIONS.map((q) => ({ category: 'HR', question: q, hint: '' })) };
  }
}

export async function apiCoach(body) {
  try {
    const res = await fetch('/api/coach', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    });
    return handleJson(res);
  } catch (err) {
    console.warn('Coach API failed — using mock response', err);
    return MOCK_COACH_RESPONSE;
  }
}

export async function apiReport() {
  // REMOVED: heavy report endpoint
  console.warn('Endpoint /api/report replaced with mock for demo');
  return { narrative: { summary: 'In-app summary is used for this demo flow.' } };
}

export async function apiAdaptiveNext(payload) {
  console.warn('Endpoint /api/adaptive-next replaced with mock for demo');
  const pool = Array.isArray(payload?.questionPool) ? payload.questionPool : [];
  return { nextQuestion: pool.find((q) => q.question !== payload?.currentQuestion)?.question || 'Tell me about yourself.', reason: 'Local demo selection.', difficulty: 'intermediate' };
}

export async function apiHealth() {
  const res = await fetch('/api/health');
  return handleJson(res);
}
