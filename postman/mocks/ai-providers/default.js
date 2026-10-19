// Local contract stand-in derived from the official Azure Chat Completions v1
// and Gemini generateContent schemas linked in backend/TUTOR.md. No real AI.
const http = require('http');
const transientFailures = new Set();
http.createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify(body)); };
  const azure = req.url === '/openai/v1/chat/completions';
  const gemini = /^\/v1beta\/models\/[^/]+:generateContent$/.test(req.url);
  if (req.method !== 'POST' || (!azure && !gemini)) return send(501, {error:'Endpoint not modeled'});
  let body = req.body;
  if (typeof body === 'string') body = JSON.parse(body);
  if (!body) { let raw = ''; for await (const chunk of req) raw += chunk; body = JSON.parse(raw); }
  const system = azure ? body.messages?.[0]?.content : body.systemInstruction?.parts?.[0]?.text;
  const payload = azure ? body.messages?.[1]?.content : body.contents?.[0]?.parts?.[0]?.text;
  const schema = azure ? body.response_format?.json_schema?.schema : body.generationConfig?.responseJsonSchema;
  if (!system || !payload || !schema || schema.required.join(',') !== 'text,sourceIds' ||
      (azure && (!req.headers['api-key'] || !body.model || body.max_completion_tokens !== 2048 || !body.response_format.json_schema.strict)) ||
      (gemini && (!req.headers['x-goog-api-key'] || body.generationConfig.responseMimeType !== 'application/json' || body.generationConfig.maxOutputTokens !== 2048)))
    return send(400, {error:'Contract mismatch'});
  if (payload.includes('PRIVATE-ANSWER') || payload.includes('correctOptionIds')) return send(400, {error:'Private content leaked'});
  if (payload.includes('__RECOVER__') && !transientFailures.has(payload)) { transientFailures.add(payload); return send(429, {error:'Transient rate limit'}); }
  if (payload.includes('__TIMEOUT__')) await new Promise(resolve => setTimeout(resolve, 31000));
  if (payload.includes('__EMPTY_CHOICES__')) return send(200, {choices:[]});
  if (payload.includes('__UNAVAILABLE__')) return send(429, {error:'Rate limit'});
  if (payload.includes('__HTML__')) { res.writeHead(500, {'Content-Type':'text/html'}); return res.end('<html>gateway failure</html>'); }
  if (payload.includes('__SLOW__')) await new Promise(resolve => setTimeout(resolve, 750));
  const context = JSON.parse(payload);
  const sourceIds = payload.includes('__BAD_SOURCE__') ? ['00000000-0000-0000-0000-000000000001'] : (context.sources || []).slice(0, 1).map(s => s.id);
  const output = JSON.stringify({text:'Respuesta de simulación: considera la idea principal.', sourceIds});
  if (azure) send(200, {choices:[{finish_reason:'stop', message:{role:'assistant',content:output}}], usage:{prompt_tokens:120,completion_tokens:30}});
  else send(200, {candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:output}]}}],usageMetadata:{promptTokenCount:130,candidatesTokenCount:31}});
}).listen(process.env.PORT);
