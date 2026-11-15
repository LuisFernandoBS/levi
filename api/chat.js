// Função serverless do Vercel. A chave fica em GEMINI_API_KEY (Settings > Environment Variables).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'GEMINI_API_KEY não configurada' });
  const { message = '', context = {} } = req.body || {};
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const system = `Você é a Levi AI, um polvinho simpático que ajuda a planejar o chá de bebê do Levi (tema fundo do mar). Responda em português do Brasil, com valores em R$, de forma curta e prática, explicando as premissas das estimativas. Responda SOMENTE em JSON: {"reply": string, "items": [{"name": string, "cat": "Alimentação"|"Decoração"|"Serviços"|"Estrutura"|"Outros", "qty": number, "unit": string, "price": number}]}. Use "items" apenas quando sugerir itens a criar; caso contrário, [] . Contexto do planejamento: ${JSON.stringify(context).slice(0, 4000)}`;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: String(message).slice(0, 1000) }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.6 }
      })
    });
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let out; try { out = JSON.parse(text); } catch { out = { reply: text, items: [] }; }
    res.status(200).json({ reply: out.reply || 'Não consegui responder agora.', items: Array.isArray(out.items) ? out.items.slice(0, 15) : [] });
  } catch (e) { res.status(502).json({ error: 'Falha ao falar com o Gemini' }); }
}
