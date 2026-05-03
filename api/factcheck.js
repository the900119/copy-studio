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

  const { text, mode, claim, context } = req.body || {};
  if (!text && !claim) return res.status(400).json({ error: 'text or claim is required' });

  let prompt;

  if (mode === 'verify_and_fix') {
    // Single claim verification + correction
    prompt = `你是嚴格的事實查核員。請查核以下具體聲明是否正確。

【聲明】${claim}
${context ? `【上下文】${context}` : ''}

查核規則：
- 只根據你訓練資料中高可信度的知識回答
- 如果你不確定或這是近期事件，誠實說「無法確定」，不要猜
- 如果是個人引言或對話內容（無法查核），回傳 cannot_verify

輸出JSON（不要markdown code block）：
{
  "verdict": "correct 或 incorrect 或 cannot_verify",
  "confidence": "high 或 medium 或 low",
  "correction": "如果incorrect，給出正確版本的完整替換文字；否則為null",
  "explanation": "一句話說明（30字以內）"
}`;
  } else if (mode === 'content') {
    // Scan full generated content for issues
    prompt = `你是嚴格的事實查核員。請仔細閱讀以下內容，找出所有「可能有誤或需要核實」的具體聲明。

重點關注：
- 具體年份、日期（如「2020年」「去年」「三年前」）
- 具體數字、統計、百分比
- 公司名稱、產品名稱、人名
- 具體事件（「XX宣布」「XX發生了」）
- 引用來源（「根據XX研究」）

【內容】
${text}

輸出JSON（不要markdown code block）：
{"sources":[{"claim":"從文中抓取的原文片段（10-30字）","status":"uncertain或unknown","search_query":"建議搜尋關鍵詞","note":"為什麼需要核實（20字以內）"}]}

status：uncertain=可能不準確，unknown=無法判斷
如果內容全是個人觀點無具體事實，回傳 {"sources":[]}`;
  } else {
    // Topic pre-check (default)
    prompt = `你是事實查核員。以下是一個內容創作選題，找出其中「具體可查核的事實聲明」，評估真偽。

選題：${text}

輸出JSON（不要markdown code block）：
{"sources":[{"claim":"具體主張","status":"confirmed或uncertain或unknown","url":"確定有來源則填，否則空字串","title":"來源標題（選填）","search_query":"建議搜尋關鍵詞","note":"補充說明"}]}`;
  }

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
        max_tokens: 1000,
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
      return res.status(200).json(mode === 'verify_and_fix'
        ? { verdict: 'cannot_verify', confidence: 'low', correction: null, explanation: '解析失敗' }
        : { sources: [] });
    }

    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
