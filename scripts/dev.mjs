import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const lan = args.includes('--lan');

const children = [
  spawn('npx', ['tsx', 'src/engine/server.ts'], {
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(lan ? { LOCAL_ENGINE_HOST: '0.0.0.0' } : {}),
    },
  }),
  spawn('npm', ['run', lan ? 'dev:web:lan' : 'dev:web'], {
    shell: true,
    stdio: 'inherit',
  }),
];

let shuttingDown = false;

function stopAll(signal = 'SIGTERM') {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }
    stopAll(signal ?? undefined);
    process.exitCode = code ?? 1;
  });
}

process.on('SIGINT', () => stopAll('SIGINT'));
process.on('SIGTERM', () => stopAll('SIGTERM'));
