module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'Not configured' });
  res.status(200).json({ clientId });
};
