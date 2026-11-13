#!/usr/bin/env node
/**
 * One command for the SmartBoard teacher-cloud emulator check:
 *   pnpm test:firebase-emulator
 *
 * Starts the Auth and Firestore emulators, then runs the rules tests and the
 * browser flow. Requires Java (the Firestore emulator) and Google Chrome.
 */
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';

const inner = 'node scripts/firebase-emulator-e2e-run.mjs';
const emulatorArgs = [
  'emulators:exec',
  '--only',
  'auth,firestore',
  '--project',
  'demo-smartboard',
  inner,
];

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with status ${code}`));
    });
  });
}

async function commandExists(command) {
  try {
    await access(command);
    return true;
  } catch {
    return false;
  }
}

const firebaseBin = process.env.FIREBASE_CLI;
if (firebaseBin) {
  await run(firebaseBin, emulatorArgs);
} else if (await commandExists('/usr/local/bin/firebase')) {
  await run('/usr/local/bin/firebase', emulatorArgs);
} else {
  await run('npx', ['--yes', 'firebase-tools@15.34.0', ...emulatorArgs]);
}
