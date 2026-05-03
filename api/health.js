module.exports = function handler(req, res) {
  res.status(200).json({ ok: true, version: 'v9', hasKey: !!process.env.ANTHROPIC_API_KEY });
};
