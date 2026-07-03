const { parseClassifyResponse } = require('../lib/parse.js');

const MODEL = 'claude-haiku-4-5';
const SYSTEM_PROMPT =
  'You classify a student chatbot prompt for an education tool. Decide if the prompt is asking the AI to DO the student\'s homework/assignment for them (cheating) rather than to help them learn. ' +
  'Respond with ONLY a JSON object: {"isHomework": boolean, "subject": string|null, "suggestions": string[]}. ' +
  'When isHomework is true, suggestions must be 3 short rephrasings that ask for help learning the same material (hints, explanations, checking reasoning, practice) instead of the answer. When false, suggestions must be an empty array. ' +
  'Lines like "[uploaded file: name.pdf]" mean the student attached that file (contents not available); judge intent from the filename and surrounding text — an assignment-like upload with a bare directive or no message usually means "do this for me". Likewise, code or exam questions pasted with no request for explanation usually means the student wants the work done for them.';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-studyguard-token');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const expectedToken = process.env.EXTENSION_TOKEN || '';
  if (expectedToken && req.headers['x-studyguard-token'] !== expectedToken) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const prompt = req.body && typeof req.body.prompt === 'string' ? req.body.prompt : '';
  if (!prompt.trim()) { res.status(400).json({ error: 'missing_prompt' }); return; }

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Student prompt:\n"""\n${prompt.slice(0, 4000)}\n"""` }]
      })
    });
    if (!apiRes.ok) { res.status(502).json({ error: 'upstream_error' }); return; }
    const data = await apiRes.json();
    const text = Array.isArray(data.content) && data.content[0] && data.content[0].text ? data.content[0].text : '';
    res.status(200).json(parseClassifyResponse(text));
  } catch (e) {
    res.status(502).json({ error: 'proxy_failure' });
  }
};
