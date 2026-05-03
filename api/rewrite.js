function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

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

  const { draft, source_url, identity, writing_guide } = req.body || {};
  if (!draft || draft.trim().length < 50) return res.status(400).json({ error: '草稿內容太短' });

  // Step 1: fetch source article if URL provided
  let sourceContent = '';
  let sourceFetched = false;
  if (source_url) {
    try {
      const r = await fetch(source_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(12000)
      });
      if (r.ok) {
        const html = await r.text();
        sourceContent = extractText(html).substring(0, 7000);
        sourceFetched = true;
      }
    } catch { /* proceed without source */ }
  }

  const styleGuide = writing_guide
    ? `\n【作者寫作風格規則】\n${writing_guide.substring(0, 1500)}`
    : '';

  const sourceBlock = sourceFetched
    ? `\n【來源文章原文（節錄）】\n${sourceContent}`
    : '';

  const prompt = `你是頂級文案編輯。任務：幫作者改善以下草稿，讓它更準確、更有力。

【作者草稿】
${draft}
${sourceBlock}
【作者身份定位】${identity || '不限定'}
${styleGuide}

執行步驟：
1. 如果有來源文章，對照找出草稿中的事實錯誤（年份、人名、引言、數字）並修正
2. 從來源文章提取1-2個可強化論點的關鍵細節，自然融入草稿
3. 保持作者的文字節奏和論點結構，不要大幅重寫
4. 保持第一人稱，保持▋段落標記風格
5. 禁止「不是X，是Y」或「不是X——是Y」對比句，改正面直述

輸出嚴格JSON（不要markdown code block）：
{
  "rewritten": "完整改寫後的文章",
  "corrections": [
    {"original": "草稿原文片段", "fixed": "修正後", "reason": "修正原因（20字以內）"}
  ],
  "added_insights": "從來源文章加入了什麼（一句話說明，沒有加就填空字串）"
}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: AbortSignal.timeout(85000)
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
      return res.status(502).json({ error: '解析失敗', raw: raw.substring(0, 300) });
    }

    return res.status(200).json({
      success: true,
      rewritten: result.rewritten || '',
      corrections: result.corrections || [],
      added_insights: result.added_insights || '',
      source_fetched: sourceFetched
    });
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};
