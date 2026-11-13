/**
 * Grants a 30-day school pilot. Run on a machine that can use Firebase Admin:
 *   pnpm exec tsx scripts/grant-school-pilot.ts --admin-uid UID --seats 10 --name "Example School"
 * The admin signs in with that Google account, then invites teachers from School.
 */
import { grantSchoolPilot } from '../lib/server/billing/store';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const adminUid = arg('--admin-uid');
const name = arg('--name');
const seats = Number(arg('--seats') ?? '10');

if (!adminUid || !name || !Number.isFinite(seats)) {
  console.error('Usage: --admin-uid UID --name "School" --seats 10');
  process.exit(1);
}

const schoolId = await grantSchoolPilot({ adminUid, name, seats });
console.log(schoolId);
