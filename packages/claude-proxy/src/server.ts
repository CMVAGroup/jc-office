import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;

export class ProxyError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function invalid(message: string): never {
  throw new ProxyError(400, 'invalid_request', message);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseCompletion(value: unknown): { prompt: string; model: string } {
  if (!record(value)) invalid('Request body must be a JSON object.');
  if (value.stream !== undefined && value.stream !== false) invalid('Streaming is not supported.');
  if (value.n !== undefined && value.n !== 1) invalid('Only n=1 is supported.');
  // Never silently accept features the CLI cannot honor.
  for (const key of Object.keys(value)) {
    if (!['model', 'messages', 'stream', 'n'].includes(key)) invalid('Unsupported parameter: ' + key);
  }
  if (typeof value.model !== 'string' || !value.model.trim() || value.model.length > 200) {
    invalid('model must be a non-empty string of at most 200 characters.');
  }
  if (!Array.isArray(value.messages) || value.messages.length === 0)
    invalid('messages must be a non-empty array.');
  const parts = value.messages.map((message: unknown) => {
    if (!record(message) || !['system', 'developer', 'user', 'assistant'].includes(String(message.role))) {
      invalid('Each message must have a supported text role: system, developer, user or assistant.');
    }
    if (Object.keys(message).some((key) => !['role', 'content'].includes(key)))
      invalid('Unsupported message field.');
    let content: string;
    if (typeof message.content === 'string') content = message.content;
    else if (Array.isArray(message.content) && message.content.length > 0) {
      content = message.content
        .map((part: unknown) => {
          if (!record(part) || part.type !== 'text' || typeof part.text !== 'string')
            invalid('Only text content is supported.');
          return part.text;
        })
        .join('\n');
    } else invalid('Message content must be text or an array of text parts.');
    if (content.includes('\0')) invalid('Message content cannot contain null bytes.');
    return String(message.role).toUpperCase() + ':\n' + content;
  });
  return { model: value.model, prompt: parts.join('\n\n') + '\n\nASSISTANT:\n' };
}

export interface CliOptions {
  command?: string;
  prefixArgs?: string[];
  timeoutMs?: number;
}

export function runClaude(prompt: string, signal: AbortSignal, options: CliOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    // No shell interpolation, autonomous tools, personal MCP servers, hooks or saved conversations.
    const child = execFile(
      options.command ?? 'claude',
      [
        ...(options.prefixArgs ?? []),
        '-p',
        prompt,
        '--output-format',
        'text',
        '--tools',
        '',
        '--strict-mcp-config',
        '--setting-sources',
        '',
        '--settings',
        '{"disableAllHooks":true}',
        '--no-session-persistence',
      ],
      {
        shell: false,
        windowsHide: true,
        encoding: 'utf8',
        signal,
        timeout: options.timeoutMs ?? 120_000,
        killSignal: 'SIGKILL',
        maxBuffer: MAX_OUTPUT_BYTES,
      },
      (error, stdout) => {
        if (error) {
          // CLI stderr/errors may contain credentials or prompt text; never return or log them.
          const code = (error as NodeJS.ErrnoException).code;
          if (code === 'ENOENT') reject(new ProxyError(503, 'cli_unavailable', 'Claude CLI is unavailable.'));
          else if (error.killed && !signal.aborted)
            reject(new ProxyError(504, 'cli_timeout', 'Claude CLI timed out.'));
          else reject(new ProxyError(502, 'cli_failed', 'Claude CLI failed.'));
        } else if (!stdout.trim())
          reject(new ProxyError(502, 'empty_response', 'Claude CLI returned no text.'));
        else resolve(stdout.trim());
      },
    );
    child.stdin?.end();
  });
}

function json(res: ServerResponse, status: number, value: unknown) {
  if (!res.destroyed) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new ProxyError(415, 'unsupported_media_type', 'Content-Type must be application/json.');
  }
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new ProxyError(413, 'body_too_large', 'Request body exceeds 64 KiB.');
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    invalid('Request body is not valid JSON.');
  }
}

export function createProxyServer(
  options: {
    enabled?: boolean;
    run?: (prompt: string, signal: AbortSignal) => Promise<string>;
  } = {},
) {
  const enabled = options.enabled ?? process.env.CLAUDE_PROXY_ENABLED === 'true';
  const run = options.run ?? runClaude;
  let busy = false;
  return createServer({ requestTimeout: 30_000, headersTimeout: 10_000 }, async (req, res) => {
    const abort = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) abort.abort();
    };
    res.on('close', onClose);
    let acquired = false;
    try {
      if (req.url === '/health' && req.method === 'GET') return json(res, 200, { status: 'ok', enabled });
      if (req.url !== '/v1/chat/completions') throw new ProxyError(404, 'not_found', 'Endpoint not found.');
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        throw new ProxyError(405, 'method_not_allowed', 'Use POST.');
      }
      if (!enabled) throw new ProxyError(503, 'proxy_disabled', 'Claude proxy is disabled.');
      if (busy) throw new ProxyError(429, 'proxy_busy', 'Claude proxy is busy; retry later.');
      busy = true;
      acquired = true;
      const { prompt, model } = parseCompletion(await readBody(req));
      const content = await run(prompt, abort.signal);
      json(res, 200, {
        id: 'chatcmpl-' + randomUUID(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      });
    } catch (error) {
      const safe =
        error instanceof ProxyError ? error : new ProxyError(500, 'internal_error', 'Internal proxy error.');
      json(res, safe.status, {
        error: {
          message: safe.message,
          type: safe.status < 500 ? 'invalid_request_error' : 'server_error',
          param: null,
          code: safe.code,
        },
      });
    } finally {
      if (acquired) busy = false;
      res.off('close', onClose);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createProxyServer();
  server.listen(11435, '0.0.0.0', () => console.log('Claude proxy listening on port 11435.'));
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      server.close();
      setTimeout(() => process.exit(0), 5_000).unref();
    });
  }
}
