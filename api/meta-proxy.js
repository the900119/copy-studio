module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const { path, token } = req.query;
  if (!path || !token) {
    return res.status(400).json({ error: 'missing path or token' });
  }

  const SYS  = process.env.META_SYS_TOKEN;
  const LIFE = process.env.META_LIFE_TOKEN;

  if (!SYS || !LIFE) {
    return res.status(500).json({ error: 'Meta tokens not configured in env vars' });
  }

  async function getPageToken(pageId, baseToken) {
    const r = await fetch(
      `https://graph.facebook.com/v25.0/${pageId}?fields=access_token&access_token=${baseToken}`
    );
    const d = await r.json();
    return d.access_token || baseToken;
  }

  let accessToken;
  if      (token === 'sys')    accessToken = SYS;
  else if (token === 'life')   accessToken = LIFE;
  else if (token === 'fbpro')  accessToken = await getPageToken('572262375977582',  SYS);
  else if (token === 'fblife') accessToken = await getPageToken('733529933726748', LIFE);
  else return res.status(400).json({ error: 'unknown token type' });

  const sep = path.includes('?') ? '&' : '?';
  const url = `https://graph.facebook.com${path}${sep}access_token=${accessToken}`;

  try {
    const resp = await fetch(url);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
