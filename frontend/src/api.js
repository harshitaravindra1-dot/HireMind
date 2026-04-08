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
  const res = await fetch('/api/resume/parse', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ text }),
  });
  return handleJson(res);
}

export async function apiGenerateQuestions(parsed) {
  const res = await fetch('/api/resume/questions', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ parsed }),
  });
  return handleJson(res);
}

export async function apiCoach(body) {
  const res = await fetch('/api/coach', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
  return handleJson(res);
}

export async function apiReport(payload) {
  const res = await fetch('/api/report', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}

export async function apiAdaptiveNext(payload) {
  const res = await fetch('/api/adaptive-next', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}

export async function apiHealth() {
  const res = await fetch('/api/health');
  return handleJson(res);
}
