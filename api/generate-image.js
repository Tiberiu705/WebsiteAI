const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt lipsește' });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${key}`;

    const gemRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
      }),
    });

    if (!gemRes.ok) {
      const err = await gemRes.text().catch(() => '');
      return res.status(200).json({ dataUrl: null, error: `Gemini image error ${gemRes.status}: ${err.slice(0, 200)}` });
    }

    const data = await gemRes.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        return res.status(200).json({
          dataUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
        });
      }
    }

    return res.status(200).json({ dataUrl: null });
  } catch (err) {
    return res.status(200).json({ dataUrl: null, error: err.message });
  }
}
