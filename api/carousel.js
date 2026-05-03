// Carousel generator — calls Anthropic + Unsplash directly, no n8n dependency
const UNSPLASH_KEY = 'mdbqeAIQoqyEGFzt9sBCIgl50mlMWkv03zPZPG7RM5g';
const FEISHU_APP_ID = 'cli_a7cd7e26fc38100d';
const FEISHU_APP_SECRET = 'xVrjEBpJvBqSt5Cx3NEmTvvf7TyS9Bfk';
const FEISHU_BASE_TOKEN = 'SM5cbiK06auXS3svas7cZpkBnXg';
const FEISHU_TABLE_ID = 'tblFxiXQwSVK274I';

const FALLBACK_QUERIES = [
  'urban night city', 'warm interior cozy', 'window light hope',
  'workspace productivity', 'success achievement', 'people connection',
  'mystery dark cinema', 'portrait magazine cover'
];

function buildPrompt(body) {
  const mode = (body.mode || 'manual').toString();
  const identity = (body.identity || '不限定').toString();

  if (mode === 'from_article') {
    const longText = (body.long_text || '').toString();
    if (!longText) throw new Error('long_text is empty');
    return {
      topic: longText.substring(0, 60) + '...',
      identity,
      prompt: `你是頂級的社交媒體文案師。請閱讀以下文章，然後輸出8張輪播貼文的完整文案。

【文章內容】
${longText}

【你的任務】
1. 從文章中萃取：最核心的洞察/主題、關鍵方法或觀點（2-3個）、任何數字/結果/社會證明
2. 判斷最適合的封面鉤子類型
3. 用第一人稱口吻，以「${identity}」的身份，產出8張VIRAL框架輪播貼文

VIRAL框架：
- 張1 V-封面：從文章提取最震撼的洞察做Hook，讓人停止滑動
- 張2 I-共鳴：描述文章揭露的痛點場景
- 張3 I-轉捩點：文章中的關鍵認知轉變時刻
- 張4 R-方法1：文章第一個核心方法/洞察
- 張5 R-方法2：文章第二個核心方法/洞察
- 張6 R-成果：文章中的數字/案例/具體結果
- 張7 A-社會證明：引用文章中的權威來源/數據/反應
- 張8 L-CTA：鼓勵收藏/分享/留言的行動呼籲

輸出格式（嚴格JSON，不要任何額外文字，不要markdown code block）：
{"slides":[{"slide_num":1,"role":"封面","headline":"主標題15字以內衝擊感","subheadline":"副標20字以內","body":"內文50-80字第一人稱","photo_query":"english photo keywords for Unsplash 3 words"}]}`
    };
  }

  const topic = (body.topic || '').toString();
  const hook_type = (body.hook_type || '殺很大真相').toString();
  const core_method = (body.core_method || '').toString();
  const social_proof = (body.social_proof || '').toString();
  const cta_type = (body.cta_type || '收藏型').toString();
  return {
    topic,
    identity,
    prompt: `你是頂級的社交媒體文案師。根據以下輸入，產出8張輪播貼文的完整文案。

輸入資料：
- 主題：${topic}
- 身份：${identity}
- Hook類型：${hook_type}
- 核心方法：${core_method}
- 社會證明：${social_proof}
- CTA類型：${cta_type}

VIRAL框架結構：
- 張1 V-封面：震撼Hook，讓人停止滑動
- 張2 I-共鳴：描述痛點場景
- 張3 I-轉捩點：覺醒時刻
- 張4 R-方法1：第一個具體方法/洞察
- 張5 R-方法2：第二個具體方法/洞察
- 張6 R-成果：具體數字/結果證明
- 張7 A-社會證明：客戶心聲
- 張8 L-CTA：明確行動呼籲

輸出格式（嚴格JSON，不要任何額外文字，不要markdown code block）：
{"slides":[{"slide_num":1,"role":"封面","headline":"主標題15字以內衝擊感","subheadline":"副標20字以內","body":"內文50-80字第一人稱","photo_query":"english photo keywords for Unsplash 3 words"}]}`
  };
}

async function fetchPhoto(query, idx) {
  const q = (query || FALLBACK_QUERIES[idx % 8]).toString();
  try {
    const r = await fetch(
      `https://api.unsplash.com/photos/random?query=${encodeURIComponent(q)}&orientation=squarish&content_filter=high`,
      { headers: { 'Authorization': `Client-ID ${UNSPLASH_KEY}` } }
    );
    if (!r.ok) return { url: null, author: 'Unsplash', query: q };
    const d = await r.json();
    return {
      url: d.urls?.regular || null,
      thumb: d.urls?.small || null,
      author: d.user?.name || 'Unsplash',
      query: q
    };
  } catch {
    return { url: null, author: 'Unsplash', query: q };
  }
}

async function saveToFeishu(slides, topic, identity) {
  try {
    const tokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET })
    });
    const { tenant_access_token: token } = await tokenRes.json();
    if (!token) return;

    const textContent = slides.map(s =>
      `【第${s.slide_num}張 ${s.role}】\n主標：${s.headline}\n副標：${s.subheadline}\n內文：${s.body}`
    ).join('\n\n---\n\n');

    await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_BASE_TOKEN}/tables/${FEISHU_TABLE_ID}/records`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { '主題': topic || '（長文輸入）', '身份定位': identity || '', '內容類型': '輪播貼文', '文案內容': textContent, '狀態': '草稿' } })
    });
  } catch {}
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY not configured' });

  try {
    const body = req.body || {};
    const { prompt, topic, identity } = buildPrompt(body);

    // Call Anthropic
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: AbortSignal.timeout(80000)
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return res.status(502).json({ success: false, error: `Anthropic ${anthropicRes.status}: ${errText.substring(0, 200)}` });
    }

    const anthropicData = await anthropicRes.json();
    const rawText = (anthropicData.content?.[0]?.text || '').trim();

    // Parse slides JSON
    let slides = [];
    try {
      const cleaned = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const startIdx = cleaned.indexOf('{');
      const endIdx = cleaned.lastIndexOf('}');
      if (startIdx === -1 || endIdx === -1) throw new Error('No JSON found');
      const parsed = JSON.parse(cleaned.substring(startIdx, endIdx + 1));
      slides = parsed.slides || [];
      if (slides.length === 0) throw new Error('Empty slides array');
    } catch (e) {
      return res.status(502).json({ success: false, error: `Parse error: ${e.message}`, rawText: rawText.substring(0, 300) });
    }

    // Parallel Unsplash fetch
    const photos = await Promise.all(slides.map((s, i) => fetchPhoto(s.photo_query, i)));
    const enrichedSlides = slides.map((s, i) => ({ ...s, photo: photos[i] || { url: null, author: 'Unsplash' } }));

    // Respond immediately
    res.status(200).json({ success: true, slides: enrichedSlides, count: enrichedSlides.length, topic, identity });

    // Save to Feishu async (after response)
    saveToFeishu(enrichedSlides, topic, identity).catch(() => {});
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: e.message });
    }
  }
};
