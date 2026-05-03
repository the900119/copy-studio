const fs = require('fs');
const path = require('path');

module.exports = function handler(req, res) {
  const html = fs.readFileSync(path.join(process.cwd(), '_template.html'), 'utf8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
};
