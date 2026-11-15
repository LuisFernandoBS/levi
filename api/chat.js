// Função serverless do Vercel. A chave fica em GEMINI_API_KEY (Settings > Environment Variables).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'GEMINI_API_KEY não configurada' });
  const { message = '', context = {} } = req.body || {};
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const mode = ['item', 'recipe'].includes(context.mode) ? context.mode : '';
  const format = mode === 'item'
    ? 'Retorne {"reply": string, "item": {"name": string, "cat": "Alimentação"|"Decoração"|"Serviços"|"Estrutura"|"Outros", "qty": number, "unit": string, "price": number}}. Proponha um único item com os dados inferidos; use quantidade 1 e preço 0 se não forem informados. Não invente preço.'
    : mode === 'recipe'
      ? 'Retorne {"reply": string, "recipe": {"n": string, "tag": string, "yield": string, "e": string, "ing": [[nome: string, quantidade: string, preço_estimado: number]]}}. Crie uma receita prática adequada à descrição, informe premissas de rendimento e preços estimados em R$ por ingrediente. Se faltar uma informação essencial, peça esclarecimento em reply e retorne recipe: null.'
      : 'Retorne {"reply": string, "items": [{"name": string, "cat": "Alimentação"|"Decoração"|"Serviços"|"Estrutura"|"Outros", "qty": number, "unit": string, "price": number}]}. Use "items" apenas quando sugerir itens a criar; caso contrário, [].';
  const system = `Você é a Levi AI, um polvinho simpático que ajuda a planejar o chá de bebê do Levi (tema fundo do mar). Responda em português do Brasil, com valores em R$, de forma curta e prática, explicando as premissas das estimativas. ${format} Responda SOMENTE em JSON. Contexto do planejamento: ${JSON.stringify(context).slice(0, 4000)}`;
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
    const item = out.item && typeof out.item.name === 'string' && typeof out.item.unit === 'string'
      ? {
          name: out.item.name.slice(0, 160),
          cat: ['Alimentação', 'Decoração', 'Serviços', 'Estrutura', 'Outros'].includes(out.item.cat) ? out.item.cat : 'Outros',
          qty: Number.isFinite(Number(out.item.qty)) && Number(out.item.qty) > 0 ? Math.min(Number(out.item.qty), 100000) : 1,
          unit: out.item.unit.slice(0, 40),
          price: Number.isFinite(Number(out.item.price)) && Number(out.item.price) >= 0 ? Number(out.item.price) : 0
        }
      : null;
    const recipe = out.recipe && typeof out.recipe.n === 'string' && Array.isArray(out.recipe.ing)
      ? {
          n: out.recipe.n.slice(0, 160),
          tag: typeof out.recipe.tag === 'string' ? out.recipe.tag.slice(0, 80) : 'Receita',
          yield: typeof out.recipe.yield === 'string' ? out.recipe.yield.slice(0, 80) : '',
          e: typeof out.recipe.e === 'string' ? out.recipe.e.slice(0, 8) : '🍰',
          ing: out.recipe.ing.slice(0, 30).filter(i => Array.isArray(i) && typeof i[0] === 'string' && typeof i[1] === 'string')
            .map(i => [i[0].slice(0, 120), i[1].slice(0, 60), Number.isFinite(Number(i[2])) && Number(i[2]) >= 0 ? Number(i[2]) : 0])
        }
      : null;
    res.status(200).json({
      reply: typeof out.reply === 'string' ? out.reply.slice(0, 2000) : 'Não consegui responder agora.',
      items: Array.isArray(out.items) ? out.items.slice(0, 15) : [],
      item,
      recipe: recipe?.n && recipe.yield && recipe.ing.length ? recipe : null
    });
  } catch (e) { res.status(502).json({ error: 'Falha ao falar com o Gemini' }); }
}
