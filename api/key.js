module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'Not configured' });
  res.status(200).json({ key });
};
