#!/usr/bin/env node
/**
 * Runs inside `firebase emulators:exec`. The emulator exports
 * FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST.
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';

const appPort = Number(process.env.FIREBASE_E2E_PORT || 3010);
const mockPort = Number(process.env.DASHSCOPE_MOCK_PORT || 8787);
const encryptionKey = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Start this script with firebase emulators:exec so the emulator hosts are set.');
}

function appEnv() {
  const env = { ...process.env };
  delete env.ACCESS_CODE;
  delete env.FIREBASE_CLIENT_EMAIL;
  delete env.FIREBASE_PRIVATE_KEY;
  env.PORT = String(appPort);
  env.NEXT_PUBLIC_FIREBASE_API_KEY = 'demo-api-key';
  env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'localhost';
  env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'demo-smartboard';
  env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'demo-smartboard.appspot.com';
  env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = '000000000000';
  env.NEXT_PUBLIC_FIREBASE_APP_ID = '1:000000000000:web:demo';
  env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS = '1';
  env.FIREBASE_PROJECT_ID = 'demo-smartboard';
  env.APP_CREDENTIAL_ENCRYPTION_KEY = encryptionKey;
  env.DASHSCOPE_BASE_URL = `http://127.0.0.1:${mockPort}/v1`;
  env.ALLOW_LOCAL_NETWORKS = 'true';
  env.FIREBASE_E2E_BASE_URL = `http://127.0.0.1:${appPort}`;
  env.FIREBASE_E2E_HEADED = process.env.FIREBASE_E2E_HEADED || '0';
  return env;
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with status ${code}`));
    });
  });
}

function startNext(env) {
  return spawn(
    'pnpm',
    ['exec', 'next', 'dev', '--hostname', '127.0.0.1', '--port', String(appPort)],
    { env, stdio: 'inherit', detached: true },
  );
}

async function stopProcessGroup(child) {
  if (!child.pid || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
      resolve();
    }, 8_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForApp(url) {
  const deadline = Date.now() + 180_000;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Next.js did not become ready at ${url}: ${lastError}`);
}

const mock = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      id: 'chatcmpl-mock',
      object: 'chat.completion',
      choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
    }),
  );
});
await new Promise((resolve) => mock.listen(mockPort, '127.0.0.1', resolve));

const env = appEnv();
let nextProcess;
try {
  await mkdir('e2e/.auth', { recursive: true });
  await run('pnpm', ['exec', 'vitest', 'run', 'tests/auth/firestore-rules.emulator.test.ts'], env);

  nextProcess = startNext(env);
  await waitForApp(`http://127.0.0.1:${appPort}/sign-in`);
  await run(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      '--config',
      'playwright.firebase.config.ts',
      'e2e/tests/firebase-teacher-cloud.spec.ts',
      'e2e/tests/firebase-teacher-cloud-whiteboard.spec.ts',
    ],
    env,
  );

  await stopProcessGroup(nextProcess);
  nextProcess = startNext(env);
  await waitForApp(`http://127.0.0.1:${appPort}/sign-in`);
  await run(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      '--config',
      'playwright.firebase.config.ts',
      'e2e/tests/firebase-teacher-cloud-restart.spec.ts',
    ],
    env,
  );
} finally {
  if (nextProcess) await stopProcessGroup(nextProcess);
  await new Promise((resolve) => mock.close(resolve));
}
