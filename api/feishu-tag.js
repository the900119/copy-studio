// Updates 輪播貼文製作 field on 06_餅妹內容中控台 records
const BASE_TOKEN = 'ILwsbLjYlaQQMKs3w00c43nnnQd';
const TABLE_ID   = 'tblptReo1ggZlDVY';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { record_id, tag = '已製作' } = req.body || {};
  if (!record_id) return res.status(400).json({ error: 'record_id required' });

  const APP_ID     = process.env.FEISHU_APP_ID     || 'cli_a934fe85e9a11cef';
  const APP_SECRET = process.env.FEISHU_APP_SECRET  || 'YpQAnoVP5WW3vCvBX1eEGhHO0w8XFStY';

  try {
    const tokRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET })
    });
    const { tenant_access_token: token } = await tokRes.json();
    if (!token) return res.status(500).json({ error: 'token failed' });

    const upRes = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${TABLE_ID}/records/${record_id}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { 輪播貼文製作: tag } })
      }
    );
    const upData = await upRes.json();
    if (upData.code !== 0) return res.status(500).json({ error: upData.msg, code: upData.code });
    return res.status(200).json({ ok: true, record_id, tag });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
