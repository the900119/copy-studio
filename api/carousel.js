// Vercel serverless proxy → n8n carousel webhook
const N8N_WEBHOOK = 'https://eglobal.app.n8n.cloud/webhook/copy-studio-carousel';

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const n8nRes = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(90000)
    });

    const text = await n8nRes.text();

    if (!n8nRes.ok) {
      return res.status(n8nRes.status).json({ success: false, error: `n8n ${n8nRes.status}: ${text.substring(0, 200)}` });
    }

    try {
      const data = JSON.parse(text);
      return res.status(200).json(data);
    } catch {
      return res.status(502).json({ success: false, error: `n8n non-JSON: ${text.substring(0, 200)}` });
    }
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};
