import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const PORT = Number(process.env.PORT) || 3001;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '12mb' }));

function requireKey(_req, res, next) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'ANTHROPIC_API_KEY is not set on the backend. Add it to backend/.env',
    });
  }
  next();
}

/** Extract first JSON object from model text */
function extractJson(text) {
  if (!text) return null;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

app.post('/api/resume/parse', requireKey, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing text' });
    }
    const prompt = `Extract the following from this resume text and return ONLY valid JSON (no markdown fences):
{
  "name": "",
  "skills": [],
  "experience": [{ "role": "", "company": "", "duration": "", "responsibilities": [] }],
  "projects": [{ "name": "", "techStack": [], "description": "" }],
  "education": [{ "degree": "", "institution": "", "year": "" }],
  "certifications": []
}`;

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `Resume text:\n\n${text.slice(0, 120000)}\n\n${prompt}`,
        },
      ],
    });
    const out =
      msg.content?.map((b) => (b.type === 'text' ? b.text : '')).join('') || '';
    const parsed = extractJson(out);
    if (!parsed) {
      return res.status(422).json({ error: 'Could not parse structured resume from model output.' });
    }
    res.json({ parsed });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Parse failed' });
  }
});

app.post('/api/resume/questions', requireKey, async (req, res) => {
  try {
    const { parsed } = req.body;
    if (!parsed || typeof parsed !== 'object') {
      return res.status(400).json({ error: 'Missing parsed resume object' });
    }
    const system = `You are an expert interviewer. Based on the candidate's resume data, generate 20 interview questions — a mix of HR, Technical, and Project-based — realistic and appropriately challenging.

Return ONLY valid JSON:
{
  "hr": [{ "question": "", "hint": "" }],
  "technical": [{ "question": "", "topic": "", "hint": "" }],
  "projectBased": [{ "question": "", "relatedProject": "", "hint": "" }]
}
The three arrays must total exactly 20 questions.`;

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: `Resume Data: ${JSON.stringify(parsed)}` }],
        },
      ],
    });
    const out =
      msg.content?.map((b) => (b.type === 'text' ? b.text : '')).join('') || '';
    const data = extractJson(out);
    if (!data || !Array.isArray(data.hr)) {
      return res.status(422).json({ error: 'Could not parse questions from model output.' });
    }
    const flat = [];
    for (const q of data.hr || []) {
      if (q?.question) flat.push({ category: 'HR', question: q.question, hint: q.hint || '' });
    }
    for (const q of data.technical || []) {
      if (q?.question) {
        flat.push({
          category: 'Technical',
          question: q.question,
          hint: q.hint || '',
          topic: q.topic || '',
        });
      }
    }
    for (const q of data.projectBased || []) {
      if (q?.question) {
        flat.push({
          category: 'Project',
          question: q.question,
          hint: q.hint || '',
          relatedProject: q.relatedProject || '',
        });
      }
    }
    res.json({ raw: data, flat });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Question generation failed' });
  }
});

app.post('/api/coach', requireKey, async (req, res) => {
  try {
    const {
      question,
      answer,
      isBehavioral,
      dominantEmotion,
      emotionTip,
    } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Missing question' });
    }
    const answerText = typeof answer === 'string' ? answer : '';

    const system = `You are an expert interview coach. Respond with ONLY valid JSON (no markdown):
{
  "intro": "2-4 sentences of feedback on the candidate's answer (or note if empty).",
  "strengths": ["", "", ""],
  "weaknesses": ["", "", ""],
  "improvedAnswerExample": "",
  "scores": {
    "clarity": 0,
    "technicalDepth": 0,
    "communication": 0,
    "confidence": 0,
    "structure": 0
  },
  "star": { "s": "", "t": "", "a": "", "r": "" },
  "followups": ["", "", ""]
}
Rules:
- Scores are integers 0..100.
- For behavioral questions, fill STAR with concise bullets tailored to the answer.
- For technical questions, STAR can be concise but still useful.
- If the answer is empty, mention it in intro and provide corrective guidance.
- improvedAnswerExample should be short and practical, as if a candidate would actually say it in an interview.`;

    const user = `Interview question: ${question}

Candidate's spoken/written answer:
${answerText || '[No answer captured — coach them to structure their next attempt.]'}

Question style: ${isBehavioral ? 'behavioral (use STAR)' : 'technical/other'}

Optional context — dominant expression: ${dominantEmotion || 'unknown'}. Tip: ${emotionTip || 'n/a'}`;

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const out =
      msg.content?.map((b) => (b.type === 'text' ? b.text : '')).join('') || '';
    const data = extractJson(out);
    if (!data) {
      return res.status(422).json({ error: 'Could not parse coach JSON from model.' });
    }
    res.json({
      intro: data.intro || '',
      strengths: Array.isArray(data.strengths) ? data.strengths.slice(0, 3) : [],
      weaknesses: Array.isArray(data.weaknesses) ? data.weaknesses.slice(0, 3) : [],
      improvedAnswerExample: data.improvedAnswerExample || '',
      scores: {
        clarity: Math.max(0, Math.min(100, Number(data.scores?.clarity) || 0)),
        technicalDepth: Math.max(0, Math.min(100, Number(data.scores?.technicalDepth) || 0)),
        communication: Math.max(0, Math.min(100, Number(data.scores?.communication) || 0)),
        confidence: Math.max(0, Math.min(100, Number(data.scores?.confidence) || 0)),
        structure: Math.max(0, Math.min(100, Number(data.scores?.structure) || 0)),
      },
      star: data.star || { s: '', t: '', a: '', r: '' },
      followups: Array.isArray(data.followups) ? data.followups.slice(0, 5) : [],
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Coach failed' });
  }
});

app.post('/api/adaptive-next', requireKey, async (req, res) => {
  try {
    const { currentQuestion, currentCategory, scores, questionPool } = req.body;
    if (!currentQuestion || typeof currentQuestion !== 'string') {
      return res.status(400).json({ error: 'Missing currentQuestion' });
    }
    const safePool = Array.isArray(questionPool) ? questionPool.slice(0, 120) : [];
    const system = `You are an expert interview panelist. Choose ONE best next question from the given pool adaptively:
- If scores are weak (<60 in multiple areas), pick a foundational question.
- If scores are strong (>=75 overall), pick a deeper/challenging question.
- Prefer topic continuity with current question/category.
Return ONLY valid JSON:
{
  "nextQuestion": "",
  "reason": "",
  "difficulty": "foundational|intermediate|advanced"
}`;
    const user = JSON.stringify({
      currentQuestion,
      currentCategory,
      scores,
      questionPool: safePool,
    });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const out = msg.content?.map((b) => (b.type === 'text' ? b.text : '')).join('') || '';
    const data = extractJson(out);
    if (!data?.nextQuestion) {
      return res.status(422).json({ error: 'Could not choose adaptive next question.' });
    }
    res.json({
      nextQuestion: String(data.nextQuestion),
      reason: String(data.reason || ''),
      difficulty: ['foundational', 'intermediate', 'advanced'].includes(data.difficulty)
        ? data.difficulty
        : 'intermediate',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Adaptive question failed' });
  }
});

app.post('/api/report', requireKey, async (req, res) => {
  try {
    const payload = req.body;
    const system = `You are an interview coach. Given session JSON, return ONLY valid JSON:
{
  "summary":"...",
  "strengths":["","",""],
  "weaknesses":["","",""],
  "improvements":["","",""],
  "sevenDayPlan":["Day 1: ...","Day 2: ...","Day 3: ...","Day 4: ...","Day 5: ...","Day 6: ...","Day 7: ..."],
  "topLikelyNextQuestions":["","","","",""],
  "attemptWiseTrend":["Attempt 1: ...","Attempt 2: ..."],
  "closingNote":"..."
}
Keep advice concrete and interview-specific.`;

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: JSON.stringify(payload).slice(0, 100000) }],
        },
      ],
    });
    const out =
      msg.content?.map((b) => (b.type === 'text' ? b.text : '')).join('') || '';
    const data = extractJson(out);
    res.json({ narrative: data || { summary: out } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Report failed' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasKey: Boolean(process.env.ANTHROPIC_API_KEY) });
});

app.listen(PORT, () => {
  console.log(`Hackverse API http://localhost:${PORT}`);
});
