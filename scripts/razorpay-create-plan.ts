/**
 * Creates the Rs 99/month SmartBoard teacher plan and prints only the plan id.
 * Run with the test or live key pair already exported:
 *   pnpm exec tsx scripts/razorpay-create-plan.ts
 * Put the printed id in RAZORPAY_PLAN_ID. The key secret is never printed.
 */
import Razorpay from 'razorpay';

import { TEACHER_PLAN } from '../lib/teacher/billing';

const keyId = process.env.RAZORPAY_KEY_ID?.trim();
const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

if (!keyId || !keySecret) {
  console.error(
    'Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the environment first. Those values are not printed.',
  );
  process.exit(1);
}

const client = new Razorpay({ key_id: keyId, key_secret: keySecret });

try {
  const plan = await client.plans.create({
    period: TEACHER_PLAN.period,
    interval: TEACHER_PLAN.interval,
    item: {
      name: TEACHER_PLAN.name,
      amount: TEACHER_PLAN.pricePaise,
      currency: TEACHER_PLAN.currency,
      description: 'Monthly teacher subscription',
    },
    notes: { product: 'smartboard-teacher' },
  });
  if (!plan.id || (keySecret && plan.id.includes(keySecret))) {
    console.error('Razorpay did not return a plan id.');
    process.exit(1);
  }
  console.log(plan.id);
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
