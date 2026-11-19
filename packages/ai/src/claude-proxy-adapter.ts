import { z } from 'zod';
import { SCHEMAS } from '@jc/domain';
import type { GenerateRequest, GenerateResult, ModelAdapter } from './adapter';

export class ClaudeProxyModelAdapter implements ModelAdapter {
  name = 'claude-proxy' as const;
  isMock = false;
  private endpoint: string;
  constructor(public model = 'claude-opus-5-5', baseUrl = 'http://localhost:11435') {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Ongeldige Claude-proxy-basis-URL.');
    this.endpoint = new URL('/v1/chat/completions', url).toString();
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const timeout = AbortSignal.timeout(300_000);
    const signal = req.signal ? AbortSignal.any([timeout, req.signal]) : timeout;
    const schema = z.toJSONSchema(SCHEMAS[req.schemaName], { target: 'draft-7' });
    const systemPrompt = req.system + '\nGeef de einduitvoer als JSON volgens dit schema: ' + JSON.stringify(schema);
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '<data>\n' + JSON.stringify(req.input) + '\n</data>' + (req.repairHint ? '\nHerstel de eerdere uitvoer: ' + req.repairHint : '') },
      ],
      stream: false,
    };
    let response: Response;
    try {
      response = await fetch(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal, redirect: 'error' });
    } catch { throw new Error('Claude-proxy niet bereikbaar of aanvraag afgebroken.'); }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Claude-proxy HTTP ${response.status}.`); }
    let json: unknown;
    try { json = await response.json(); } catch { throw new Error('Claude-proxy gaf geen geldige JSON terug.'); }
    const content = (json as { choices: { message: { content: string } }[] }).choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Claude-proxy gaf geen geldig chatbericht terug.');
    // Claude CLI wraps JSON in markdown code fences; strip them before parsing.
    let text = content.trim();
    const fence = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
    if (fence) text = fence[1].trim();
    // Extract first JSON object/array if there's surrounding text.
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) text = jsonMatch[1];
    let output: unknown;
    try { output = JSON.parse(text); } catch { throw new Error('Claude-proxy-uitvoer is geen geldige JSON.'); }
    return { output, provider: 'claude-proxy', model: this.model, usage: { inputTokens: 0, outputTokens: 0, costUsdMicros: 0 } };
  }
}
