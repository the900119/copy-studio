#!/usr/bin/env python3
"""
Carousel workflow v6:
3-node chain:
  Webhook → Code(BuildPrompt) → HTTP Request(Anthropic credential) → Code(ParseFetch) → Respond
- Use n8n Anthropic credential (Wyq86Fzp4BaaEAcO) instead of hardcoded key
- Build prompt in Code node first, then simple $json.prompt reference in HTTP Request body
"""

import json, requests

N8N_BASE = "https://eglobal.app.n8n.cloud"
N8N_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyYjliNWQ4OC1mNGRjLTRlMmEtYjY5ZS1iODQ1MDUwOTMyNDkiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiZmZlZDBmZjAtNjFkNC00MzMxLWIyNTAtNDNmOTVkOWQzNmNmIiwiaWF0IjoxNzc3MTYzNzQ1fQ.SQUJZ1df-P_WaGP29P90BfTzsPlPMnuboqzVBxJi-FA"
WORKFLOW_ID = "uvUWEH85wm3YkEzg"

UNSPLASH_KEY = "mdbqeAIQoqyEGFzt9sBCIgl50mlMWkv03zPZPG7RM5g"
FEISHU_APP_ID = "cli_a7cd7e26fc38100d"
FEISHU_APP_SECRET = "xVrjEBpJvBqSt5Cx3NEmTvvf7TyS9Bfk"
FEISHU_BASE_TOKEN = "SM5cbiK06auXS3svas7cZpkBnXg"
FEISHU_TABLE_ID = "tblFxiXQwSVK274I"

# Node 2: Build prompt
CODE_BUILD_PROMPT = r"""
const raw = $input.first().json;
const body = raw.body || raw;

const topic = (body.topic || '').toString();
const identity = (body.identity || '').toString();
const hook_type = (body.hook_type || '震驚型').toString();
const core_method = (body.core_method || '').toString();
const social_proof = (body.social_proof || '').toString();
const cta_type = (body.cta_type || '收藏型').toString();

const PROMPT = `你是頂級的社交媒體文案師。根據以下輸入，產出8張輪播貼文的完整文案。

輸入資料：
- 主題：${topic}
- 身份：${identity}
- Hook類型：${hook_type}
- 核心方法：${core_method}
- 社會證明：${social_proof}
- CTA類型：${cta_type}

VIRAL框架結構：
- 張1 V-封面：震撼Hook，讓人停止滑動
- 張2 I-共鳴：描述痛點場景，讓讀者說「我也是！」
- 張3 I-轉捩點：你或你的客戶的覺醒時刻
- 張4 R-方法1：第一個具體方法/洞察
- 張5 R-方法2：第二個具體方法/洞察
- 張6 R-成果：具體數字/結果證明
- 張7 A-社會證明：截圖反饋/客戶心聲引言
- 張8 L-CTA：明確行動呼籲

輸出格式（嚴格JSON，不要任何額外文字，不要markdown code block）：
{"slides":[{"slide_num":1,"role":"封面","headline":"主標題15字以內衝擊感","subheadline":"副標20字以內","body":"內文50-80字第一人稱","photo_query":"english photo keywords for Unsplash 3 words"}]}`;

return [{
  json: {
    prompt: PROMPT,
    topic,
    identity,
    hook_type,
    core_method,
    social_proof,
    cta_type
  }
}];
"""

# Node 4: Parse Anthropic response + Unsplash + Feishu
CODE_PARSE_FETCH = r"""
const UNSPLASH_KEY = '""" + UNSPLASH_KEY + r"""';
const FEISHU_APP_ID = '""" + FEISHU_APP_ID + r"""';
const FEISHU_APP_SECRET = '""" + FEISHU_APP_SECRET + r"""';
const FEISHU_BASE_TOKEN = '""" + FEISHU_BASE_TOKEN + r"""';
const FEISHU_TABLE_ID = '""" + FEISHU_TABLE_ID + r"""';

// Get Anthropic response
const anthropicData = $input.first().json;
const rawText = ((anthropicData.content && anthropicData.content[0] && anthropicData.content[0].text) || '').trim();

// Get original inputs from Code-BuildPrompt node
const origInputs = $('Code - Build Prompt').first().json;
const topic = origInputs.topic || '';
const identity = origInputs.identity || '';

// Parse JSON from Anthropic response
let slides = [];
try {
  const cleaned = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('No JSON in response: ' + cleaned.substring(0, 200));
  }
  const parsed = JSON.parse(cleaned.substring(startIdx, endIdx + 1));
  slides = parsed.slides || [];
  if (slides.length === 0) throw new Error('Empty slides array');
} catch (e) {
  return [{ json: { success: false, error: 'Parse error: ' + e.message, rawText: rawText.substring(0, 300) } }];
}

// Fetch Unsplash photos sequentially
const FALLBACK = [
  'urban night city', 'warm interior cozy', 'window light hope',
  'workspace productivity', 'success achievement', 'people connection',
  'mystery dark cinema', 'portrait magazine cover'
];

async function getPhoto(query, idx) {
  const q = (query || FALLBACK[idx % 8]).toString();
  try {
    const data = await this.helpers.httpRequest({
      method: 'GET',
      url: 'https://api.unsplash.com/photos/random',
      headers: { 'Authorization': `Client-ID ${UNSPLASH_KEY}` },
      qs: { query: q, orientation: 'squarish', content_filter: 'high' },
      json: true
    });
    return {
      url: (data.urls && data.urls.regular) || null,
      thumb: (data.urls && data.urls.small) || null,
      author: (data.user && data.user.name) || 'Unsplash',
      query: q
    };
  } catch {
    return { url: null, author: 'Unsplash', query: q };
  }
}

const enrichedSlides = [];
for (let i = 0; i < slides.length; i++) {
  const photo = await getPhoto.call(this, slides[i].photo_query, i);
  enrichedSlides.push({ ...slides[i], photo });
}

// Save to Feishu (non-fatal)
try {
  const tokenData = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    headers: { 'content-type': 'application/json' },
    body: { app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET },
    json: true
  });
  const token = tokenData.tenant_access_token;
  if (token) {
    const textContent = enrichedSlides.map(s =>
      `【第${s.slide_num}張 ${s.role}】\n主標：${s.headline}\n副標：${s.subheadline}\n內文：${s.body}`
    ).join('\n\n---\n\n');

    await this.helpers.httpRequest({
      method: 'POST',
      url: `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_BASE_TOKEN}/tables/${FEISHU_TABLE_ID}/records`,
      headers: { 'Authorization': `Bearer ${token}`, 'content-type': 'application/json' },
      body: {
        fields: {
          '主題': topic,
          '身份定位': identity,
          '內容類型': '輪播貼文',
          '文案內容': textContent,
          '狀態': '草稿'
        }
      },
      json: true
    });
  }
} catch {}

return [{ json: { success: true, slides: enrichedSlides, count: enrichedSlides.length } }];
"""

nodes = [
    {
        "id": "webhook-node",
        "name": "Webhook",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2,
        "position": [160, 300],
        "webhookId": "uvUWEH85wm3YkEzg",
        "parameters": {
            "httpMethod": "POST",
            "path": "copy-studio-carousel",
            "responseMode": "responseNode",
            "options": {}
        }
    },
    {
        "id": "code-build-prompt",
        "name": "Code - Build Prompt",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [380, 300],
        "parameters": {
            "jsCode": CODE_BUILD_PROMPT
        }
    },
    {
        "id": "http-anthropic",
        "name": "HTTP - Anthropic",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4,
        "position": [600, 300],
        "credentials": {
            "anthropicApi": {
                "id": "Wyq86Fzp4BaaEAcO",
                "name": "Anthropic 2026-04"
            }
        },
        "parameters": {
            "method": "POST",
            "url": "https://api.anthropic.com/v1/messages",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "anthropicApi",
            "sendHeaders": True,
            "headerParameters": {
                "parameters": [
                    {"name": "anthropic-version", "value": "2023-06-01"}
                ]
            },
            "sendBody": True,
            "contentType": "json",
            "bodyParameters": {
                "parameters": [
                    {"name": "model", "value": "claude-haiku-4-5-20251001"},
                    {"name": "max_tokens", "value": 4000},
                    {"name": "messages", "value": "={{ [{\"role\": \"user\", \"content\": $json.prompt}] }}"}
                ]
            },
            "options": {}
        }
    },
    {
        "id": "code-parse-fetch",
        "name": "Code - Parse & Fetch",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [820, 300],
        "parameters": {
            "jsCode": CODE_PARSE_FETCH
        }
    },
    {
        "id": "respond-node",
        "name": "Respond to Webhook",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1,
        "position": [1040, 300],
        "parameters": {
            "respondWith": "json",
            "responseBody": "={{ $json }}"
        }
    }
]

connections = {
    "Webhook": {
        "main": [[{"node": "Code - Build Prompt", "type": "main", "index": 0}]]
    },
    "Code - Build Prompt": {
        "main": [[{"node": "HTTP - Anthropic", "type": "main", "index": 0}]]
    },
    "HTTP - Anthropic": {
        "main": [[{"node": "Code - Parse & Fetch", "type": "main", "index": 0}]]
    },
    "Code - Parse & Fetch": {
        "main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]
    }
}

headers = {
    "X-N8N-API-KEY": N8N_KEY,
    "Content-Type": "application/json"
}

print("Fetching current workflow...")
res = requests.get(f"{N8N_BASE}/api/v1/workflows/{WORKFLOW_ID}", headers=headers)
current = res.json()
print(f"Current: {current.get('name')} (active={current.get('active')})")

payload = {
    "name": current["name"],
    "nodes": nodes,
    "connections": connections,
    "settings": current.get("settings", {}),
    "staticData": current.get("staticData")
}

print("Deploying v6...")
res = requests.put(
    f"{N8N_BASE}/api/v1/workflows/{WORKFLOW_ID}",
    headers=headers,
    json=payload
)

if res.status_code == 200:
    print("✅ Workflow updated")
    act = requests.post(f"{N8N_BASE}/api/v1/workflows/{WORKFLOW_ID}/activate", headers=headers)
    print(f"Activation: {act.status_code}")
else:
    print(f"❌ Update failed: {res.status_code}")
    print(res.text[:500])
