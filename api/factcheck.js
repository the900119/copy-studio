module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { text, mode } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text is required' });

  const isContent = mode === 'content';

  const prompt = isContent
    ? `你是一位嚴格的事實查核員。請仔細閱讀以下生成的內容，找出所有「可能有誤或需要核實」的具體聲明。

重點關注：
- 具體年份、日期（如「2020年」「去年」「三年前」）
- 具體數字、統計、百分比
- 公司名稱、產品名稱、人名
- 具體事件或新聞（「XX宣布」「XX發生了」）
- 任何帶有「XX研究顯示」「根據XX」的引用

【內容】
${text}

輸出JSON（不要markdown code block）：
{"sources":[{"claim":"具體聲明原文","status":"uncertain或unknown","search_query":"建議搜尋關鍵詞（英文或中文）","note":"為什麼需要核實"}]}

status說明：
- uncertain = 可能不準確，需要核實
- unknown = 無法判斷真偽，建議查證

如果內容完全是個人觀點、情緒描述，沒有具體事實聲明，回傳 {"sources":[]}`
    : `你是一位事實查核員。以下是一個內容創作的選題，請找出這個選題中隱含的「具體可查核事實聲明」，並評估真偽。

選題：${text}

找出其中涉及的具體數字、年份、事件、人物、公司——這些是生成文案時容易出錯的地方。

輸出JSON（不要markdown code block）：
{"sources":[{"claim":"具體可查核的主張","status":"confirmed或uncertain或unknown","url":"如果你確定有來源的話填（否則留空字串）","title":"來源標題（選填）","search_query":"建議搜尋關鍵詞","note":"補充說明"}]}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(502).json({ error: `Anthropic ${r.status}: ${err.substring(0, 200)}` });
    }

    const data = await r.json();
    const raw = (data.content?.[0]?.text || '').trim();

    let result;
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      result = JSON.parse(raw.substring(start, end + 1));
    } catch {
      return res.status(200).json({ sources: [] });
    }

    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
