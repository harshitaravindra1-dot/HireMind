import React, { useState, useEffect, useRef } from 'react';
import { apiParseResume, apiGenerateQuestions, apiCoach, apiReport } from './api.js';

const FILLER_RE = /\b(um|uh|umm|uhh|like|you know|actually|basically|sort of|kind of)\b/gi;

function countFillers(text) {
  if (!text) return 0;
  const m = text.match(FILLER_RE);
  return m ? m.length : 0;
}

// --- DUMMY DATA ---
const ROLES = {
  'Software Engineer': ["Tell me about a time you resolved a critical production bug.", "How would you design a rate limiter for an API?", "Describe a time you disagreed with your tech lead."],
  'Product Manager': ["Tell me about a product decision you regret.", "How do you prioritize when everything is P0?", "Describe a time you used data to change direction."],
  'Data Scientist': ["Tell me about a model that failed in production.", "How do you explain a complex model to non-technical stakeholders?"],
  'UX Designer': ["Tell me about a time research invalidated your design.", "Walk me through your end-to-end design process."]
};

/** Role pills (excludes IndiaBix* even if ever re-added to ROLES for question text). */
const ROLE_TABS = Object.keys(ROLES).filter((name) => !/IndiaBix/i.test(name));

const COACHING = {
  behavioral: {
    intro: "Excellent use of the STAR method. Your narrative shows strong ownership and results-oriented thinking.",
    s: "The critical production bug occurred during peak traffic on Black Friday, threatening availability.",
    t: "Tasked with identifying the root cause while maintaining system uptime and minimizing user impact.",
    a: "I isolated the problematic microservice, deployed a hotfix within 15 minutes, and established a post-mortem.",
    r: "System uptime restored to 99.9%, zero data loss, and implemented new alerting protocols to prevent recurrence."
  },
  technical: {
    intro: "Strong technical breakdown. You addressed scalability and edge cases effectively in your design.",
    s: "Designing a robust rate limiter for high-throughput public APIs requires careful architecture.",
    t: "The goal is to prevent service overload while ensuring fair usage across different client tiers.",
    a: "Proposed a Token Bucket algorithm stored in Redis for distributed consistency and sub-millisecond latency.",
    r: "The solution handles 100k requests/second with minimal overhead and clear strategy for rate-limit headers."
  }
};

const FOLLOWUPS = {
  behavioral: [
    "What specific monitoring tools did you use to detect this?",
    "How did you communicate the resolution to non-technical folks?",
    "What would you do differently if you had more time?"
  ],
  technical: [
    "How does your solution handle bursty traffic patterns?",
    "What's the failover strategy if Redis becomes unavailable?",
    "Could you implement this using Fixed Window counters instead?"
  ]
};

const EMOTION_MAP = {
  happy: { label: 'Confident', color: '#2D6A4F', bg: '#EDF7F2', tip: 'Great energy! You look approachable and engaged.' },
  neutral: { label: 'Composed', color: '#2C4F7C', bg: '#EEF3FA', tip: 'Good composure. Try showing slightly more enthusiasm.' },
  fearful: { label: 'Nervous', color: '#C13030', bg: '#FEF0F0', tip: 'Take a slow breath. Pause before answering.' },
  surprised: { label: 'Uncertain', color: '#B8860B', bg: '#FEF9ED', tip: 'Structure your thoughts before speaking.' },
  sad: { label: 'Low Energy', color: '#5E3A8A', bg: '#F3EEFA', tip: 'Sit up straight — project more energy.' },
  angry: { label: 'Tense', color: '#C13030', bg: '#FEF0F0', tip: 'Relax your jaw and shoulders. Breathe slowly.' },
  disgusted: { label: 'Disengaged', color: '#9B8E7E', bg: '#F7F3EE', tip: 'Show interest — nod and maintain eye contact.' }
};

const INITIAL_METRICS = {
  confidence: 0,
  pacing: 0, // words per minute (last answer)
  composure: 0,
  filler: 0
};

export default function InterviewCoPilot() {
  // --- CORE STATE ---
  const [activeRole, setActiveRole] = useState('Software Engineer');
  const [question, setQuestion] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [coachState, setCoachState] = useState('idle'); // 'idle' | 'loading' | 'streaming' | 'done'
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [streamText, setStreamText] = useState('');
  const [starContent, setStarContent] = useState({ s: '', t: '', a: '', r: '' });
  const [metrics, setMetrics] = useState(INITIAL_METRICS);
  const [followups, setFollowups] = useState(FOLLOWUPS.behavioral);
  const [isBehavioral, setIsBehavioral] = useState(false);

  // --- EMOTION STATE ---
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [cameraPermission, setCameraPermission] = useState('prompt'); // prompt|granted|denied
  const [emotions, setEmotions] = useState({ happy: 0, neutral: 0, fearful: 0, surprised: 0, sad: 0, angry: 0, disgusted: 0 });
  const [dominantEmotion, setDominantEmotion] = useState(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [emotionHistory, setEmotionHistory] = useState([]); // last 10 readings
  const [eyeContactScore, setEyeContactScore] = useState(0);

  // --- RESUME STATE ---
  const [resumeData, setResumeData] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeState, setResumeState] = useState('idle'); // idle|uploading|parsing|extracting|done|error
  const [resumeError, setResumeError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [pdfLibLoaded, setPdfLibLoaded] = useState(false);
  const [mammothLoaded, setMammothLoaded] = useState(false);
  const [answerTranscript, setAnswerTranscript] = useState('');
  const [speechError, setSpeechError] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  // --- REFS ---
  const timerRef = useRef(null);
  const streamIntervalRef = useRef(null);
  const scrollRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const questionRef = useRef('');
  const recognitionRef = useRef(null);
  const transcriptRef = useRef('');
  const finalSpeechRef = useRef('');
  const recordingStartRef = useRef(null);
  const sessionLogRef = useRef([]);
  const runCoachRef = useRef(async () => {});

  // --- SCRIPT INJECTION ---
  useEffect(() => {
    // Face API
    const loadFaceApi = async () => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
      script.onload = async () => {
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
        await Promise.all([
          window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          window.faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
          window.faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL)
        ]);
        setModelsLoaded(true);
      };
      document.head.appendChild(script);
    };
    loadFaceApi();

    // PDF.js
    const pdfjsScript = document.createElement('script');
    pdfjsScript.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    pdfjsScript.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      setPdfLibLoaded(true);
    };
    document.head.appendChild(pdfjsScript);

    // Mammoth
    const mammothScript = document.createElement('script');
    mammothScript.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js';
    mammothScript.onload = () => setMammothLoaded(true);
    document.head.appendChild(mammothScript);

    return () => {
      disableCamera();
    };
  }, []);

  // --- CAMERA LOGIC ---
  const enableCamera = async () => {
    try {
      const permResult = await navigator.permissions.query({ name: 'camera' });
      setCameraPermission(permResult.state);
      permResult.onchange = () => setCameraPermission(permResult.state);
    } catch (e) { }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user', frameRate: { ideal: 15, max: 30 } }
      });
      streamRef.current = stream;
      setCameraEnabled(true);
      setCameraError(null);
    } catch (err) {
      console.error("Camera Error:", err);
      if (err.name === 'NotAllowedError') setCameraError('permission_denied');
      else if (err.name === 'NotFoundError') setCameraError('no_camera');
      else setCameraError('unknown');
    }
  };

  useEffect(() => {
    if (cameraEnabled && videoRef.current && streamRef.current) {
      if (!videoRef.current.srcObject) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          startDetectionLoop();
        };
      }
    }
  }, [cameraEnabled, modelsLoaded]);

  const disableCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
    setCameraEnabled(false);
    setFaceDetected(false);
    setDominantEmotion(null);
    setEmotions({ happy: 0, neutral: 0, fearful: 0, surprised: 0, sad: 0, angry: 0, disgusted: 0 });
  };

  const startDetectionLoop = () => {
    if (!modelsLoaded || !videoRef.current) return;
    detectionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused) return;
      try {
        const detection = await window.faceapi
          .detectSingleFace(videoRef.current, new window.faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 }))
          .withFaceLandmarks(true)
          .withFaceExpressions();

        if (detection) {
          setFaceDetected(true);
          const expr = detection.expressions;
          const total = Object.values(expr).reduce((a, b) => a + b, 0);
          const normalized = Object.fromEntries(Object.entries(expr).map(([k, v]) => [k, Math.round((v / total) * 100)]));
          setEmotions(normalized);
          const dominant = Object.entries(normalized).sort((a, b) => b[1] - a[1])[0][0];
          setDominantEmotion(dominant);

          const landmarks = detection.landmarks;
          const leftEye = landmarks.getLeftEye();
          const rightEye = landmarks.getRightEye();
          const eyeCenterX = (leftEye[0].x + rightEye[3].x) / 2;
          const noseTipX = landmarks.getNose()[3].x;
          const eyeScore = Math.max(0, Math.round(100 - Math.abs(noseTipX - eyeCenterX) * 1.5));
          setEyeContactScore(eyeScore);

          setEmotionHistory(prev => [...prev.slice(-9), { time: Date.now(), dominant, confidence: normalized[dominant] }]);
        } else {
          setFaceDetected(false);
        }
      } catch (e) { }
    }, 600);
  };

  // --- RESUME LOGIC ---
  const extractTextFromFile = async (file) => {
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|doc|docx)$/i)) throw new Error('invalid_type');
    if (file.size > 5 * 1024 * 1024) throw new Error('too_large');

    const arrayBuffer = await file.arrayBuffer();
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim() + '\n';
      }
      return fullText;
    }
    if (file.name.endsWith('.docx')) {
      const result = await window.mammoth.extractRawText({ arrayBuffer });
      return result.value;
    }
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsText(file);
    });
  };

  const parseResumeLocally = (rawText) => {
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const name = lines[0] || 'Candidate';

    const commonSkills = [
      'React', 'JavaScript', 'Node.js', 'Python', 'Java', 'C++', 'CSS', 'HTML', 'SQL',
      'Git', 'Tailwind', 'Next.js', 'AWS', 'Docker', 'Machine Learning', 'Data Science',
      'Communication', 'Leadership', 'Project Management', 'UI/UX', 'Design'
    ];

    const skills = commonSkills.filter(skill =>
      rawText.toLowerCase().includes(skill.toLowerCase())
    );

    // Find a likely title
    const potentialTitles = ['Developer', 'Engineer', 'Manager', 'Analyst', 'Designer', 'Student', 'Lead'];
    let title = 'Professional';
    for (const t of potentialTitles) {
      if (rawText.toLowerCase().includes(t.toLowerCase())) {
        title = t;
        break;
      }
    }

    return {
      name: name.substring(0, 30),
      title: title,
      skills: skills.length > 0 ? skills.slice(0, 8) : ['Generalist'],
      experience: [],
      education: [],
      projects: []
    };
  };

  const generatePersonalizedQuestions = (parsed, activeRole) => {
    const questions = [];
    const topSkill = parsed.skills?.[0];
    const lastJob = parsed.experience?.[0];
    const topProject = parsed.projects?.[0];
    if (topSkill) questions.push(`Tell me about a time you used ${topSkill} to solve a difficult problem.`);
    if (lastJob) questions.push(`Walk me through your most impactful contribution as ${lastJob.role} at ${lastJob.company}.`);
    if (topProject) questions.push(`How did you approach building ${topProject.name} and what trade-offs did you make?`);
    if (parsed.skills?.length > 3) questions.push(`How do you stay current with ${parsed.skills[1]} and ${parsed.skills[2]}?`);
    questions.push(`How does your background in ${parsed.title || activeRole} prepare you for this role?`);
    return questions.slice(0, 5);
  };

  const handleResumeUpload = async (file) => {
    if (!file) return;
    setResumeFile(file);
    setResumeError(null);
    try {
      setResumeState('parsing');
      const rawText = await extractTextFromFile(file);
      setResumeState('extracting');
      let parsed;
      try {
        const out = await apiParseResume(rawText);
        parsed = out.parsed;
      } catch (apiErr) {
        console.warn('Resume parse API fallback:', apiErr);
        parsed = parseResumeLocally(rawText);
      }
      setResumeState('generating');
      let personalizedQuestions;
      let questionMeta = [];
      try {
        const out = await apiGenerateQuestions(parsed);
        questionMeta = out.flat || [];
        personalizedQuestions = questionMeta.map((q) => q.question).filter(Boolean);
      } catch (apiErr) {
        console.warn('Question generation API fallback:', apiErr);
        personalizedQuestions = generatePersonalizedQuestions(parsed, activeRole);
      }
      if (!personalizedQuestions.length) {
        personalizedQuestions = generatePersonalizedQuestions(parsed, activeRole);
      }
      setResumeData({
        ...parsed,
        raw: rawText,
        personalizedQuestions,
        questionMeta,
      });
      setResumeState('done');
    } catch (err) {
      console.error('Resume Error:', err);
      setResumeError(err.message === 'invalid_type' ? 'Upload a PDF or Word doc.' : 'Could not parse resume.');
      setResumeState('error');
    }
  };

  // --- CONNECTED LOGIC ---
  const getQuestionBank = () => {
    return resumeData?.personalizedQuestions?.length ? [...resumeData.personalizedQuestions, ...ROLES[activeRole]] : ROLES[activeRole];
  };

  useEffect(() => {
    if (!cameraEnabled || !dominantEmotion) return;
    const emotionConfidence = { happy: 92, neutral: 75, surprised: 60, fearful: 40, sad: 45, angry: 35, disgusted: 30 };
    setMetrics(prev => ({
      ...prev,
      confidence: Math.round(prev.confidence * 0.8 + (emotionConfidence[dominantEmotion] || 70) * 0.2),
      composure: Math.round(prev.composure * 0.8 + (eyeContactScore || 70) * 0.2)
    }));
  }, [dominantEmotion, cameraEnabled, eyeContactScore]);

  // --- HELPERS ---
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    return `${mins}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  const detectBehavioral = (val) => /tell me about a time|describe a time|give me an example/i.test(val);

  useEffect(() => { setIsBehavioral(detectBehavioral(question)); }, [question]);

  useEffect(() => {
    questionRef.current = question;
  }, [question]);

  useEffect(() => {
    if (!ROLE_TABS.includes(activeRole)) setActiveRole('Software Engineer');
  }, [activeRole]);

  useEffect(() => {
    runCoachRef.current = async (answerText) => {
      const q = questionRef.current;
      if (!q) return;
      clearInterval(streamIntervalRef.current);
      setCoachState('loading');
      setStreamText('');
      setStarContent({ s: '', t: '', a: '', r: '' });

      const emotionTip =
        dominantEmotion && EMOTION_MAP[dominantEmotion]
          ? EMOTION_MAP[dominantEmotion].tip
          : '';

      const streamWords = (fullText, afterStream) => {
        const words = fullText.split(/\s+/).filter(Boolean);
        let idx = 0;
        setCoachState('streaming');
        streamIntervalRef.current = setInterval(() => {
          if (idx < words.length) {
            setStreamText((prev) => prev + (idx === 0 ? '' : ' ') + words[idx]);
            idx += 1;
          } else {
            clearInterval(streamIntervalRef.current);
            afterStream();
          }
        }, 35);
      };

      try {
        const data = await apiCoach({
          question: q,
          answer: answerText || '',
          isBehavioral,
          dominantEmotion,
          emotionTip,
        });
        const fullText = `${data.intro || ''}${emotionTip ? `\n\n${emotionTip}` : ''}`;
        streamWords(fullText, () => {
          setCoachState('done');
          setStreamText(
            (prev) =>
              `${prev}\n\nTry answering one of the follow-up questions on the right, or click 'Random Question' for a new topic.`
          );
        });
        setStarContent({
          s: data.star?.s || '',
          t: data.star?.t || '',
          a: data.star?.a || '',
          r: data.star?.r || '',
        });
        const fu = data.followups?.filter(Boolean) || [];
        setFollowups(fu.length ? fu : FOLLOWUPS[isBehavioral ? 'behavioral' : 'technical']);
        sessionLogRef.current.push({ question: q, answer: answerText, ts: Date.now() });
      } catch (e) {
        console.warn('Coach API fallback:', e);
        const type = isBehavioral ? 'behavioral' : 'technical';
        const content = COACHING[type];
        const fullText = `${content.intro}${emotionTip ? `\n\n${emotionTip}` : ''}`;
        streamWords(fullText, () => {
          setCoachState('done');
          setStreamText(
            (prev) =>
              `${prev}\n\nTry answering one of the follow-up questions on the right, or click 'Random Question' for a new topic.`
          );
        });
        setStarContent({ s: content.s, t: content.t, a: content.a, r: content.r });
        setFollowups(FOLLOWUPS[type]);
        sessionLogRef.current.push({ question: q, answer: answerText, ts: Date.now(), fallback: true });
      }
    };
  }, [dominantEmotion, isBehavioral]);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setSessionSeconds((prev) => prev + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => {
      clearInterval(timerRef.current);
    };
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording) return undefined;
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) {
      setSpeechError('Speech recognition is not supported in this browser.');
      return undefined;
    }
    setSpeechError(null);
    finalSpeechRef.current = '';
    transcriptRef.current = '';
    setAnswerTranscript('');
    recordingStartRef.current = Date.now();

    const rec = new Rec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) {
          finalSpeechRef.current += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      const display = (finalSpeechRef.current + (interim ? ` ${interim}` : '')).trim();
      transcriptRef.current = display;
      setAnswerTranscript(display);
      setMetrics((prev) => ({ ...prev, filler: countFillers(display) }));
    };

    rec.onerror = (e) => {
      if (e.error === 'not-allowed') setSpeechError('Microphone permission denied for speech.');
      else if (e.error !== 'aborted') setSpeechError(e.error || 'Speech error');
    };

    rec.onend = () => {
      if (recognitionRef.current !== rec) return;
      const text = transcriptRef.current || '';
      const secs = (Date.now() - recordingStartRef.current) / 1000;
      const words = text.split(/\s+/).filter(Boolean).length;
      const wpm = secs >= 2 ? Math.round((words / secs) * 60) : 0;
      setMetrics((prev) => ({ ...prev, pacing: wpm }));
      recognitionRef.current = null;
      const q = questionRef.current;
      if (q) {
        const run = runCoachRef.current;
        if (typeof run === 'function') run(text);
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (e) {
      setSpeechError('Could not start speech recognition.');
    }

    return () => {
      try {
        rec.stop();
      } catch (_) { /* noop */ }
    };
  }, [isRecording]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollIntoView({ behavior: 'smooth' }); }, [streamText]);

  // --- UI HANDLERS ---
  const handleRandomQuestion = () => {
    const qs = getQuestionBank();
    setQuestion(qs[Math.floor(Math.random() * qs.length)]);
    setCoachState('idle');
    finalSpeechRef.current = '';
    transcriptRef.current = '';
    setAnswerTranscript('');
  };

  const handleCoachMe = () => {
    if (coachState === 'loading' || !question) return;
    const text = transcriptRef.current || answerTranscript;
    const run = runCoachRef.current;
    if (typeof run === 'function') run(text);
  };

  const handleDownloadReport = async () => {
    setReportLoading(true);
    try {
      const payload = {
        sessionSeconds,
        metrics,
        emotionHistory,
        dominantEmotion,
        eyeContactScore,
        resumeName: resumeData?.name,
        sessionLog: sessionLogRef.current,
        lastQuestion: question,
        lastAnswer: answerTranscript,
      };
      let narrative = null;
      try {
        const out = await apiReport(payload);
        narrative = out.narrative;
      } catch (e) {
        narrative = { summary: `Report narrative unavailable: ${e.message}` };
      }
      const lines = [
        'Interview Co-Pilot — Session Report',
        '====================================',
        '',
        `Session length: ${formatTime(sessionSeconds)}`,
        `Resume / candidate: ${resumeData?.name || 'n/a'}`,
        '',
        'Metrics',
        `  Confidence (blend): ${metrics.confidence}%`,
        `  Pacing (last answer): ${metrics.pacing} wpm`,
        `  Composure (blend): ${metrics.composure}%`,
        `  Filler words (detected): ${metrics.filler}`,
        '',
        'Emotion timeline (recent samples):',
        ...emotionHistory.slice(-12).map(
          (h) =>
            `  • ${new Date(h.time).toISOString()} — ${h.dominant} (${h.confidence}%)`
        ),
        '',
        'AI session summary:',
        narrative?.summary ? `  ${narrative.summary}` : '  (none)',
        '',
        'Strengths:',
        ...(narrative?.strengths?.length
          ? narrative.strengths.map((s) => `  • ${s}`)
          : ['  (see summary)']),
        '',
        'Improvements:',
        ...(narrative?.improvements?.length
          ? narrative.improvements.map((s) => `  • ${s}`)
          : ['  (see summary)']),
        '',
        narrative?.closingNote ? `Closing: ${narrative.closingNote}` : '',
        '',
        'Answer log (this session):',
        ...sessionLogRef.current.map(
          (row, i) =>
            `  ${i + 1}. Q: ${row.question}\n     A: ${row.answer || '[empty]'}\n`
        ),
        '',
        '--- End of report ---',
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `interview-report-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setReportLoading(false);
    }
  };

  const status = isRecording ? { label: 'Listening', dot: 'bg-red-500 animate-pulse-dot' } : coachState === 'loading' ? { label: 'Thinking', dot: 'bg-gold-500' } : { label: 'Ready', dot: 'bg-green-500 animate-pulse-dot' };

  return (
    <div className="min-h-screen bg-cream selection:bg-wine/10 selection:text-wine font-dm text-gray-800 pb-16">
      <style dangerouslySetInnerHTML={{
        __html: `
        :root { --wine: #8B1A2A; --gold-500: #B8860B; }
        .bg-wine { background-color: var(--wine); } .text-wine { color: var(--wine); }
        .animate-pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
        @keyframes pulse-dot { 0%,100% {opacity:1; transform:scale(1);} 50% {opacity:0.4; transform:scale(0.8);} }
        .animate-mic-ring { animation: mic-ring 1.2s ease-out infinite; }
        @keyframes mic-ring { 0% {box-shadow:0 0 0 0 rgba(193,48,48,0.4);} 70% {box-shadow:0 0 0 14px rgba(193,48,48,0);} 100% {box-shadow:0 0 0 0 rgba(193,48,48,0);} }
        .animate-blink { animation: blink 1s step-end infinite; }
        @keyframes blink { 0%,100% {opacity:1;} 50% {opacity:0.0;} }
        @keyframes bounce-dot { 0%,80%,100% {transform:translateY(0);} 40% {transform:translateY(-6px);} }
        .animate-fade-up { animation: fade-up 0.35s ease forwards; }
        @keyframes fade-up { 0%{opacity:0;transform:translateY(10px);} 100%{opacity:1;transform:translateY(0);} }
        .shimmer-bg { background: linear-gradient(90deg, #F2EDE5 25%, #E8E3DB 50%, #F2EDE5 75%); background-size: 200% 100%; animation: shimmer 2s infinite linear; }
        @keyframes shimmer { 0%{background-position:-200% 0;} 100%{background-position:200% 0;} }
      `}} />

      <header className="sticky top-0 z-50 bg-cream/92 backdrop-blur border-b border-gray-100 px-8 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h1 className="font-playfair text-[26px] font-black italic text-wine leading-none">Interview Co-Pilot</h1>
          <div className="h-6 w-px bg-gray-200" />
          <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">Real-time AI Guidance</span>
        </div>
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100">
          <div className="w-2 h-2 rounded-full bg-confidence animate-pulse-dot" />
          <span className="text-[11px] font-bold text-confidence">Live · Ready</span>
        </div>
      </header>

      <main className="flex flex-col lg:flex-row gap-6 p-8 max-w-[1440px] mx-auto items-start">
        {/* LEFT SIDEBAR */}
        <aside className="w-full lg:w-[272px] space-y-6 flex-shrink-0 animate-fade-up [animation-delay:0.1s]">
          {/* METRICS */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 relative overflow-hidden">
            <div className="absolute top-[-10px] right-[-10px] font-playfair text-[64px] italic opacity-5 text-linen font-black leading-none pointer-events-none">METRICS</div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-6">Live Metrics</div>
            <div className="space-y-6">
              {[
                { label: 'Confidence', value: `${metrics.confidence}%`, color: 'bg-confidence', width: metrics.confidence },
                { label: 'Pacing', value: `${metrics.pacing} wpm`, color: 'bg-pacing', width: Math.min((metrics.pacing / 200) * 100, 100) },
                { label: 'Composure', value: metrics.composure > 80 ? 'High' : 'Med', color: 'bg-composure', width: metrics.composure },
              ].map((m) => (
                <div key={m.label}>
                  <div className="flex justify-between items-end mb-1.5">
                    <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">{m.label}</span>
                    <span className="text-[22px] font-black text-gray-900 leading-none">{m.value}</span>
                  </div>
                  <div className="h-1 bg-linen rounded-full overflow-hidden">
                    <div className={`h-full ${m.color} transition-all duration-700`} style={{ width: `${Math.min(m.width, 100)}%` }} />
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-end border-t border-linen pt-6">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">Filler Words</span>
                <span className={`text-[22px] font-black leading-none ${metrics.filler < 4 ? 'text-confidence' : 'text-filler'}`}>{metrics.filler}</span>
              </div>
              <div className="pt-4">
                <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wide mb-2">Session Time</div>
                <div className="font-playfair text-[52px] font-black italic text-wine leading-none tracking-tight">{formatTime(sessionSeconds)}</div>
                <div className="text-[11px] text-gray-400 mt-1 italic">minutes active</div>
              </div>
            </div>
          </div>

          {/* EMOTION PANEL */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Emotion Analysis</span>
              <span className="font-playfair italic text-linen text-xl">Camera</span>
            </div>

            <div className="aspect-[4/3] bg-linen rounded-xl overflow-hidden mb-4 relative">
              {cameraEnabled ? (
                <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300">
                  <div className="text-4xl mb-2">🎥</div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-center px-4">Enable camera for emotion analysis</p>
                </div>
              )}
              {!modelsLoaded && cameraEnabled && <div className="absolute inset-0 shimmer-bg opacity-30" />}
            </div>

            {cameraEnabled && (
              <div className="space-y-4 animate-fade-up">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full ${faceDetected ? 'bg-confidence animate-pulse-dot' : 'bg-gray-300'}`} />
                  <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{faceDetected ? 'Face Detected' : 'No Face Found'}</span>
                </div>

                {dominantEmotion && EMOTION_MAP[dominantEmotion] && (
                  <div className="mb-4">
                    <div className="flex justify-between items-end mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">
                          {dominantEmotion === 'happy' && '😊'}
                          {dominantEmotion === 'neutral' && '😐'}
                          {dominantEmotion === 'fearful' && '😨'}
                          {dominantEmotion === 'surprised' && '😲'}
                          {dominantEmotion === 'sad' && '😔'}
                          {dominantEmotion === 'angry' && '😡'}
                          {dominantEmotion === 'disgusted' && '😒'}
                        </span>
                        <span className="text-lg font-black uppercase tracking-tight text-gray-900">{EMOTION_MAP[dominantEmotion].label}</span>
                      </div>
                      <span className="text-xl font-black text-gray-900">{emotions[dominantEmotion]}%</span>
                    </div>
                    <div className="h-1.5 bg-linen rounded-full overflow-hidden">
                      <div className="h-full transition-all duration-500" style={{ backgroundColor: EMOTION_MAP[dominantEmotion].color, width: `${emotions[dominantEmotion]}%` }} />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { l: 'Calm', v: emotions.neutral + emotions.happy, c: '#2D6A4F' },
                    { l: 'Focus', v: eyeContactScore, c: '#2C4F7C' },
                    { l: 'Stress', v: emotions.fearful + emotions.angry, c: '#C13030' },
                  ].map(chip => (
                    <div key={chip.l} className="bg-linen/50 p-2 rounded-lg text-center border border-linen">
                      <div className="text-[9px] uppercase font-black tracking-tighter text-gray-400 mb-0.5">{chip.l}</div>
                      <div className="text-[14px] font-black" style={{ color: chip.c }}>{chip.v}%</div>
                    </div>
                  ))}
                </div>

                <div className="pt-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">👁 Eye Contact</span>
                    <span className="text-[10px] font-black" style={{ color: eyeContactScore > 70 ? '#2D6A4F' : '#B8860B' }}>{eyeContactScore}%</span>
                  </div>
                  <div className="h-1 bg-linen rounded-full overflow-hidden">
                    <div className="h-full bg-wine/30 transition-all duration-500" style={{ width: `${eyeContactScore}%` }} />
                  </div>
                </div>

                {dominantEmotion && (
                  <p className="text-[11px] italic text-gray-500 leading-relaxed bg-linen/30 p-2 rounded-lg border border-linen/50">"{EMOTION_MAP[dominantEmotion].tip}"</p>
                )}
              </div>
            )}

            <button
              onClick={cameraEnabled ? disableCamera : enableCamera}
              className={`w-full mt-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${cameraEnabled ? 'bg-white border border-gray-200 text-gray-500 hover:bg-linen' : 'bg-wine text-white shadow-md hover:bg-wine-dark'}`}
            >
              {cameraEnabled ? 'Disable Camera' : '📷 Enable Camera'}
            </button>
            <div className="mt-2 text-center">
              <span className="text-[9px] text-gray-300 italic">🔒 Video processed locally. Nothing is uploaded or stored.</span>
            </div>
          </div>
        </aside>

        {/* CENTER PANEL */}
        <section className="flex-1 space-y-5 animate-fade-up [animation-delay:0.2s]">
          {/* RESUME UPLOAD */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Resume Parsing</span>
              <span className="font-playfair italic text-linen text-xl">Upload</span>
            </div>

            {!resumeData ? (
              <div
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${dragOver ? 'border-wine bg-wine/5 scale-[1.01]' : 'border-[#DDD5C8] bg-cream/30'}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleResumeUpload(e.dataTransfer.files[0]); }}
                onClick={() => fileInputRef.current.click()}
              >
                <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => handleResumeUpload(e.target.files[0])} accept=".pdf,.doc,.docx" />

                {resumeState === 'idle' || resumeState === 'error' ? (
                  <>
                    <div className="text-3xl mb-3">📄</div>
                    <p className="text-[13px] font-bold text-gray-600 mb-1">Drop your resume here</p>
                    <p className="text-[11px] text-gray-400 mb-4">PDF, DOC, or DOCX · Max 5MB</p>
                    <button className="px-4 py-1.5 rounded-full border border-gray-200 text-[10px] font-black uppercase tracking-widest bg-white shadow-sm hover:border-wine/30">Browse Files</button>
                  </>
                ) : (
                  <div className="space-y-4 max-w-[200px] mx-auto text-left">
                    {[
                      { l: 'File received', s: ['parsing', 'extracting', 'generating', 'done'].includes(resumeState) ? 'done' : 'active' },
                      { l: 'Reading content…', s: resumeState === 'parsing' ? 'active' : ['extracting', 'generating', 'done'].includes(resumeState) ? 'done' : 'next' },
                      { l: 'AI extraction', s: resumeState === 'extracting' ? 'active' : ['generating', 'done'].includes(resumeState) ? 'done' : 'next' },
                      { l: 'Personalizing questions', s: resumeState === 'generating' ? 'active' : resumeState === 'done' ? 'done' : 'next' },
                    ].map((step, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${step.s === 'done' ? 'bg-confidence text-white' : step.s === 'active' ? 'bg-wine text-white animate-pulse' : 'bg-gray-100 text-gray-400'}`}>
                          {step.s === 'done' ? '✓' : ''}
                        </div>
                        <span className={`text-[11px] font-bold uppercase tracking-widest ${step.s === 'active' ? 'text-gray-800' : 'text-gray-400'}`}>{step.l}</span>
                      </div>
                    ))}
                  </div>
                )}
                {resumeError && (
                  <div className="mt-4 p-2 bg-red-50 text-red-600 text-[11px] font-bold rounded-lg border border-red-100">⚠️ {resumeError}</div>
                )}
              </div>
            ) : (
              <div className="bg-cream/30 border border-linen rounded-2xl p-5 animate-fade-up">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">📄</div>
                    <div>
                      <h3 className="font-playfair text-xl italic font-black text-gray-900 leading-none mb-1">{resumeData.name || 'Anonymous Candidiate'}</h3>
                      <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">{resumeData.title || 'Professional'}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setResumeData(null);
                      sessionLogRef.current = [];
                    }}
                    className="text-[10px] font-black uppercase tracking-widest text-gray-300 hover:text-wine"
                  >
                    [✕ Remove]
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {resumeData.skills?.map(s => <span key={s} className="px-2 py-0.5 rounded-full bg-wine text-white text-[9px] font-black uppercase tracking-wider">{s}</span>)}
                  </div>
                  <div className="inline-flex items-center gap-2 bg-confidence/10 text-confidence text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-confidence/20">
                    ✨ {resumeData.personalizedQuestions?.length} questions tailored to your resume
                  </div>
                </div>
              </div>
            )}

            <div className="mt-3 text-center">
              <span className="text-[9px] text-gray-300 italic">🔒 Text is sent to your backend for AI parsing; nothing is stored by this demo.</span>
            </div>
          </div>

          {/* ROLE SELECTOR */}
          <div className="flex flex-wrap gap-2 mb-2 p-1">
            {ROLE_TABS.map((role) => (
              <button
                type="button"
                key={role}
                onClick={() => setActiveRole(role)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all border ${activeRole === role ? 'bg-wine text-white border-wine shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:border-wine/30 hover:bg-wine-50'}`}
              >
                {role} {resumeData && activeRole === role && '✨'}
              </button>
            ))}
          </div>

          {/* QUESTION INPUT CARD */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Interview Question</span>
              <div className="flex gap-2">
                {resumeData && question && resumeData.personalizedQuestions?.includes(question) && (
                  <div className="bg-confidence/10 border border-confidence/20 text-confidence rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider animate-slide-down">✨ Tailored</div>
                )}
                {isBehavioral && (
                  <div className="bg-[#FEF9ED] border border-[#E8D5A0] text-[#B8860B] rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider animate-slide-down">⭐ Behavioral · STAR</div>
                )}
              </div>
            </div>
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Drag a file or pick a random question to begin..." className="w-full min-h-[112px] bg-cream border border-gray-200 rounded-xl p-4 text-sm font-medium focus:border-wine focus:ring-2 focus:ring-wine/5 outline-none placeholder:text-gray-300 transition-all resize-none" />
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => setIsRecording(!isRecording)} className={`w-[46px] h-[46px] rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-[#FEF0F0] border-2 border-red-500 animate-mic-ring' : 'bg-linen border border-gray-200 text-gray-500'}`}>{isRecording ? "⏹" : "🎙️"}</button>
              <button type="button" onClick={handleRandomQuestion} className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:border-wine/30 hover:bg-wine-50">🎲 Random Question</button>
              <button type="button" onClick={handleCoachMe} disabled={coachState === 'loading' || !question} className={`flex-[1.2] rounded-xl text-sm font-bold shadow-md transition-all relative overflow-hidden ${coachState === 'loading' || !question ? 'bg-gray-100 text-gray-400' : 'bg-wine text-white hover:bg-wine-dark'}`}>
                {coachState === 'loading' ? <span className="flex items-center justify-center gap-2">Thinking<span className="animate-blink">...</span></span> : "⚡ Coach Me"}
                {coachState === 'loading' && <div className="absolute inset-0 shimmer-bg opacity-10" />}
              </button>
            </div>
            {(speechError || (answerTranscript && !isRecording)) && (
              <p className="mt-3 text-[11px] text-gray-500 leading-relaxed line-clamp-3">
                {speechError ? `Speech: ${speechError}` : `Heard: ${answerTranscript}`}
              </p>
            )}
            {isRecording && answerTranscript && (
              <p className="mt-2 text-[11px] text-gray-400 italic line-clamp-2">Live: {answerTranscript}</p>
            )}
          </div>

          {/* STAR FRAMEWORK CARD */}
          {isBehavioral && (
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 animate-fade-up">
              <div className="px-6 py-4 bg-cream/10 border-b border-linen flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">STAR Framework</span>
                <span className="font-playfair italic text-gray-300 text-lg">Method</span>
              </div>
              <div className="p-0">
                {[
                  { l: 'S', name: 'Situation', color: '#2C4F7C', content: starContent.s, p: 'Setting the scene for your success...' },
                  { l: 'T', name: 'Task', color: '#5E3A8A', content: starContent.t, p: 'The challenge you were faced with...' },
                  { l: 'A', name: 'Action', color: '#B8860B', content: starContent.a, p: 'The strategic steps you took...' },
                  { l: 'R', name: 'Result', color: '#2D6A4F', content: starContent.r, p: 'The quantitative/qualitative impact...' },
                ].map((it) => (
                  <div key={it.l} className="relative group border-b border-linen last:border-0 hover:bg-gray-50 transition-colors">
                    <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: it.color }} />
                    <div className="p-4 pl-6 flex items-start gap-4">
                      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black text-white" style={{ backgroundColor: it.color }}>{it.l}</div>
                      <div>
                        <div className="text-[10px] uppercase font-black tracking-wider mb-0.5" style={{ color: it.color }}>{it.name}</div>
                        <div className={`text-sm leading-relaxed ${it.content ? 'text-gray-800' : 'text-gray-300 italic'}`}>{it.content || it.p}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LIVE COACHING */}
          <div className="bg-white rounded-2xl p-7 shadow-sm border border-gray-100 min-h-[220px] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${coachState === 'streaming' ? 'bg-green-500 animate-pulse-dot' : 'bg-gray-200'}`} />
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Live Coaching</span>
              </div>
              <span className="font-playfair italic text-gray-300 text-lg">Co-Pilot</span>
            </div>
            <div className="flex-1 flex flex-col">
              {coachState === 'idle' && <div className="m-auto font-playfair italic text-2xl text-gray-300">Ask a question to begin.</div>}
              {coachState === 'loading' && (
                <div className="m-auto flex gap-2">
                  <div className="w-2.5 h-2.5 bg-wine/20 rounded-full animate-[bounce-dot_1.2s_infinite]" />
                  <div className="w-2.5 h-2.5 bg-wine/20 rounded-full animate-[bounce-dot_1.2s_infinite_0.15s]" />
                  <div className="w-2.5 h-2.5 bg-wine/20 rounded-full animate-[bounce-dot_1.2s_infinite_0.3s]" />
                </div>
              )}
              {(coachState === 'streaming' || coachState === 'done') && (
                <div className="text-gray-800 leading-relaxed text-base font-medium">
                  {streamText} {coachState === 'streaming' && <span className="inline-block w-2.5 h-5 bg-wine ml-1 align-middle animate-blink" />}
                  <div ref={scrollRef} />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* RIGHT SIDEBAR */}
        <aside className="w-full lg:w-[252px] flex-shrink-0 animate-fade-up [animation-delay:0.3s]">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 relative overflow-hidden flex flex-col">
            <div className="absolute top-[-10px] right-[-10px] font-playfair text-[64px] italic opacity-5 text-linen font-black leading-none pointer-events-none">NEXT</div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-6">Likely Follow-ups</div>
            <div className="space-y-3 my-2">
              {followups.map((f, i) => (
                <div key={i} className="bg-cream border border-gray-100/50 rounded-xl p-3 cursor-pointer group hover:border-wine/20 hover:bg-wine-50 active:scale-[0.98] transition-all">
                  <div className="flex justify-between items-center mb-2">
                    <div className="w-[22px] h-[22px] rounded-full border border-gray-200 bg-white text-[10px] flex items-center justify-center font-bold text-gray-400 group-hover:border-wine/20 group-hover:text-wine">{i + 1}</div>
                    <div className="bg-wine/5 border border-wine/10 text-wine text-[9px] font-black uppercase px-2 py-0.5 rounded-full">Prepare</div>
                  </div>
                  <p className="text-[12.5px] leading-relaxed text-gray-500 font-medium group-hover:text-gray-900">{f}</p>
                </div>
              ))}
            </div>
            <button className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 text-[11px] font-black uppercase text-gray-400 hover:border-wine/30 hover:text-wine transition-all">Predict Follow-ups →</button>
          </div>
        </aside>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 h-14 bg-cream/95 backdrop-blur border-t border-gray-100 px-8 flex justify-between items-center z-50">
        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Session: {formatTime(sessionSeconds)}</div>
        <div className="flex items-center gap-3 px-4 py-1.5 rounded-full bg-white border border-gray-100 shadow-sm">
          <div className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">{status.label}</span>
        </div>
        <button type="button" onClick={handleDownloadReport} disabled={reportLoading} className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-wine transition-colors disabled:opacity-50"><span>⬇</span> {reportLoading ? 'Preparing…' : 'Download Report'}</button>
      </footer>
    </div>
  );
}
