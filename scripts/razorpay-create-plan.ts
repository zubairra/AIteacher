/**
 * Creates the Pro, Max, and School Razorpay plans and prints only their ids.
 *   pnpm exec tsx scripts/razorpay-create-plan.ts
 * Put the printed ids in RAZORPAY_PRO_PLAN_ID, RAZORPAY_MAX_PLAN_ID, and
 * RAZORPAY_SCHOOL_PLAN_ID. The key secret is never printed.
 */
import Razorpay from 'razorpay';

import { CHALK_PLANS } from '../lib/teacher/billing';

const keyId = process.env.RAZORPAY_KEY_ID?.trim();
const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

if (!keyId || !keySecret) {
  console.error(
    'Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the environment first. Those values are not printed.',
  );
  process.exit(1);
}

const client = new Razorpay({ key_id: keyId, key_secret: keySecret });

const plans = [
  {
    env: 'RAZORPAY_PRO_PLAN_ID',
    period: CHALK_PLANS.pro.period,
    interval: CHALK_PLANS.pro.interval,
    name: CHALK_PLANS.pro.name,
    amount: CHALK_PLANS.pro.pricePaise,
    description: `${CHALK_PLANS.pro.chalksPerWeek} chalks a week, billed monthly`,
  },
  {
    env: 'RAZORPAY_MAX_PLAN_ID',
    period: CHALK_PLANS.max.period,
    interval: CHALK_PLANS.max.interval,
    name: CHALK_PLANS.max.name,
    amount: CHALK_PLANS.max.pricePaise,
    description: `${CHALK_PLANS.max.chalksPerWeek} chalks a week, billed monthly`,
  },
  {
    env: 'RAZORPAY_SCHOOL_PLAN_ID',
    period: CHALK_PLANS.school.period,
    interval: CHALK_PLANS.school.interval,
    name: CHALK_PLANS.school.name,
    amount: CHALK_PLANS.school.annualPaisePerSeat,
    description: `${CHALK_PLANS.school.chalksPerSeatPerWeek} chalks per seat each week, billed yearly`,
  },
] as const;

try {
  for (const plan of plans) {
    const created = await client.plans.create({
      period: plan.period,
      interval: plan.interval,
      item: {
        name: plan.name,
        amount: plan.amount,
        currency: CHALK_PLANS.currency,
        description: plan.description,
      },
      notes: { product: 'smartboard-teacher' },
    });
    if (!created.id || created.id.includes(keySecret)) {
      console.error('Razorpay did not return a plan id.');
      process.exit(1);
    }
    console.log(`${plan.env}=${created.id}`);
  }
} catch (error) {
  const description =
    error && typeof error === 'object' && 'error' in error
      ? (error as { error?: { description?: unknown } }).error?.description
      : undefined;
  const message =
    typeof description === 'string' && !description.includes(keySecret)
      ? description
      : 'Razorpay could not create the plan.';
  console.error(message);
  process.exit(1);
}
