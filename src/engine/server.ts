import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { LocalEngineController } from './localEngine';

loadDotEnv();

const port = Number(process.env.LOCAL_ENGINE_PORT ?? 8095);
const host = process.env.LOCAL_ENGINE_HOST ?? '127.0.0.1';
const controller = new LocalEngineController();

function loadDotEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = unquoteEnvValue(trimmed.slice(separator + 1).trim());
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function unquoteEnvValue(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function writeJson(res: http.ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/local-engine/health') {
    writeJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/local-engine/replays') {
    writeJson(res, 200, controller.listReplays());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/local-engine/agents') {
    writeJson(res, 200, controller.listAgents());
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/local-engine/agents/') && url.pathname.endsWith('/deck')) {
    const id = decodeURIComponent(url.pathname.slice('/local-engine/agents/'.length, -'/deck'.length));
    const response = controller.loadAgentDeck(id);
    if (!response.ok) {
      writeJson(res, 404, response);
      return;
    }
    const deck = response.deck ?? '';
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Length': Buffer.byteLength(deck),
    });
    res.end(deck);
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/local-engine/replays/')) {
    const id = decodeURIComponent(url.pathname.slice('/local-engine/replays/'.length));
    const response = controller.loadReplay(id);
    writeJson(res, response.ok ? 200 : 404, response);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/local-engine/replays/load') {
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const response = controller.loadReplayData(body.replayData, body.name);
      writeJson(res, response.ok ? 200 : 400, response);
    } catch (error) {
      writeJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/local-engine/save-replay') {
    const response = controller.saveReplay();
    writeJson(res, response.ok ? 200 : 400, response);
    return;
  }

  if (req.method !== 'POST' || url.pathname !== '/local-engine') {
    writeJson(res, 404, { ok: false, error: 'Not found' });
    return;
  }

  try {
    const raw = await readBody(req);
    const command = raw ? JSON.parse(raw) : { type: 'state' };
    const response = await controller.handle(command);
    writeJson(res, response.ok ? 200 : 400, response);
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, host, () => {
  process.stdout.write(`[cabt-local-engine] listening on http://${host}:${port}\n`);
});
