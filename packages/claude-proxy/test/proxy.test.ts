import { afterEach, describe, expect, it, vi } from 'vitest';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { createProxyServer, runClaude } from '../src/server';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});
async function start(options: Parameters<typeof createProxyServer>[0] = {}) {
  const server = createProxyServer(options);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  return 'http://127.0.0.1:' + address.port;
}
const body = { model: 'claude-code', messages: [{ role: 'user', content: 'Hallo' }] };
const post = (url: string, value: unknown = body) =>
  fetch(url + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
const cli = (script: string, timeoutMs?: number) => ({
  command: process.execPath,
  prefixArgs: ['-e', script, '--'],
  timeoutMs,
});

describe('Claude proxy HTTP contract', () => {
  it('converts ordered messages and returns a valid completion', async () => {
    const run = vi.fn(async () => 'Hallo terug');
    const url = await start({ enabled: true, run });
    const response = await post(url, {
      model: 'claude-code',
      messages: [
        { role: 'system', content: 'Kort' },
        { role: 'user', content: [{ type: 'text', text: 'Hallo' }] },
        { role: 'assistant', content: 'Hoi' },
        { role: 'user', content: 'Verder' },
      ],
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      object: 'chat.completion',
      model: 'claude-code',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hallo terug' }, finish_reason: 'stop' }],
    });
    expect(result.id).toMatch(/^chatcmpl-/);
    expect(result.created).toBeGreaterThan(0);
    expect(result.usage).toBeUndefined();
    expect(run.mock.calls[0]?.[0]).toBe(
      'SYSTEM:\nKort\n\nUSER:\nHallo\n\nASSISTANT:\nHoi\n\nUSER:\nVerder\n\nASSISTANT:\n',
    );
  });
  it('defaults to disabled without invoking Claude', async () => {
    const run = vi.fn();
    const url = await start({ enabled: false, run });
    expect((await post(url)).status).toBe(503);
    expect(await (await fetch(url + '/health')).json()).toEqual({ status: 'ok', enabled: false });
    expect(run).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {},
    { ...body, messages: [] },
    { ...body, stream: true },
    { ...body, n: 2 },
    { ...body, tools: [] },
    { ...body, messages: [{ role: 'tool', content: 'x' }] },
    { ...body, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: {} }] }] },
    { ...body, messages: [{ role: 'user', content: 'x\0y' }] },
  ])('rejects invalid or unsupported requests: %j', async (value) => {
    const run = vi.fn();
    const response = await post(await start({ enabled: true, run }), value);
    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe('invalid_request_error');
    expect(run).not.toHaveBeenCalled();
  });
  it('handles malformed JSON, content type, body limits and routing', async () => {
    const run = vi.fn();
    const url = await start({ enabled: true, run });
    expect(
      (
        await fetch(url + '/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{',
        })
      ).status,
    ).toBe(400);
    expect((await fetch(url + '/v1/chat/completions', { method: 'POST', body: '{}' })).status).toBe(415);
    expect(
      (await post(url, { ...body, messages: [{ role: 'user', content: 'x'.repeat(70_000) }] })).status,
    ).toBe(413);
    const method = await fetch(url + '/v1/chat/completions');
    expect(method.status).toBe(405);
    expect(method.headers.get('allow')).toBe('POST');
    expect((await fetch(url + '/unknown')).status).toBe(404);
    expect(run).not.toHaveBeenCalled();
  });
  it('redacts unexpected errors and releases the concurrency slot', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('SECRET')).mockResolvedValue('ok');
    const url = await start({ enabled: true, run });
    const response = await post(url);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('SECRET');
    expect((await post(url)).status).toBe(200);
  });
  it('limits concurrent calls and aborts a disconnected request', async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let cancelled!: () => void;
    const aborted = new Promise<void>((resolve) => {
      cancelled = resolve;
    });
    const url = await start({
      enabled: true,
      run: (_prompt, signal) =>
        new Promise((_resolve, reject) => {
          started();
          signal.addEventListener(
            'abort',
            () => {
              cancelled();
              reject(new Error('cancelled'));
            },
            { once: true },
          );
        }),
    });
    const controller = new AbortController();
    const first = fetch(url + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).catch(() => null);
    await ready;
    expect((await post(url)).status).toBe(429);
    controller.abort();
    await first;
    await aborted;
  });
});

describe('CLI subprocess without a real model or credentials', () => {
  it('passes the prompt literally as one argument and disables tools', async () => {
    const prompt = 'quotes " \n & echo SECRET; $(command)';
    const output = await runClaude(
      prompt,
      new AbortController().signal,
      cli('console.log(JSON.stringify(process.argv.slice(1)))'),
    );
    const args = JSON.parse(output);
    expect(args.slice(0, 2)).toEqual(['-p', prompt]);
    expect(args).toContain('--strict-mcp-config');
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(args).toContain('--no-session-persistence');
  });
  it('classifies a missing executable safely', async () => {
    await expect(
      runClaude('x', new AbortController().signal, { command: 'jc-missing-claude-test' }),
    ).rejects.toMatchObject({ status: 503, code: 'cli_unavailable' });
  });
  it('redacts stderr from CLI failures', async () => {
    await expect(
      runClaude('x', new AbortController().signal, cli('console.error("SECRET"); process.exit(1)')),
    ).rejects.toMatchObject({ status: 502, message: 'Claude CLI failed.' });
  });
  it('rejects empty CLI output', async () => {
    await expect(runClaude('x', new AbortController().signal, cli('process.exit(0)'))).rejects.toMatchObject({
      code: 'empty_response',
    });
  });
  it('terminates CLI timeouts', async () => {
    await expect(
      runClaude('x', new AbortController().signal, cli('setInterval(() => {}, 1000)', 200)),
    ).rejects.toMatchObject({ status: 504, code: 'cli_timeout' });
  });
  it('terminates CLI on cancellation', async () => {
    const controller = new AbortController();
    const promise = runClaude('x', controller.signal, cli('setInterval(() => {}, 1000)'));
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'cli_failed' });
  });
  it('bounds CLI output', async () => {
    await expect(
      runClaude('x', new AbortController().signal, cli('console.log("x".repeat(1100000))')),
    ).rejects.toMatchObject({ status: 502 });
  });
});
