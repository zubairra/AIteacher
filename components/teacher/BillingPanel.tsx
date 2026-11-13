'use client';

import { useState } from 'react';

import { CHALK_PLANS, formatInr, type TeacherBillingView } from '@/lib/teacher/billing';
import { ChalkIcon } from './ChalkIcon';

interface CheckoutResponse {
  ok?: boolean;
  keyId?: string;
  subscriptionId?: string;
  orderId?: string;
  error?: string;
  billing?: TeacherBillingView;
}

declare global {
  interface Window {
    Razorpay?: new (options: {
      key: string;
      subscription_id?: string;
      order_id?: string;
      name: string;
      description: string;
      theme?: { color?: string };
      handler?: () => void;
    }) => { open: () => void };
  }
}

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Razorpay Checkout could not be loaded.'));
    document.body.appendChild(script);
  });
}

const plans = [
  {
    id: 'pro' as const,
    name: 'Pro',
    price: formatInr(CHALK_PLANS.pro.pricePaise),
    period: 'month',
    chalks: `${CHALK_PLANS.pro.chalksPerWeek} chalks a week`,
    detail: 'For one teacher.',
  },
  {
    id: 'max' as const,
    name: 'Max',
    price: formatInr(CHALK_PLANS.max.pricePaise),
    period: 'month',
    chalks: `${CHALK_PLANS.max.chalksPerWeek} chalks a week`,
    detail: 'For one teacher who generates often.',
  },
];

export function BillingPanel({ initial }: { initial: TeacherBillingView }) {
  const [view, setView] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const post = async (body: Record<string, unknown>, description: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/teacher/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as CheckoutResponse;
      if (!response.ok) throw new Error(result.error || 'Billing could not be updated.');
      if (body.action === 'cancel' && result.billing) {
        setView(result.billing);
        setConfirmCancel(false);
        setMessage('Cancellation is scheduled. Razorpay confirms the final status.');
        return;
      }
      if (!result.keyId || (!result.subscriptionId && !result.orderId)) {
        throw new Error('Razorpay did not return a checkout session.');
      }
      await loadCheckout();
      if (!window.Razorpay) throw new Error('Razorpay Checkout could not be loaded.');
      const checkout = new window.Razorpay({
        key: result.keyId,
        ...(result.subscriptionId ? { subscription_id: result.subscriptionId } : {}),
        ...(result.orderId ? { order_id: result.orderId } : {}),
        name: 'SmartBoard AI',
        description,
        theme: { color: '#6d28d9' },
        handler: () => {
          setMessage(
            'Razorpay accepted the checkout. Chalks appear when the webhook confirms it. Refresh this page in a moment.',
          );
        },
      });
      checkout.open();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Billing could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid="billing-page" className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">
        <ChalkIcon className="size-4" />
        Plans
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{view.headline}</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">{view.detail}</p>
      <p className="mt-4 text-lg font-semibold">{view.chalksLabel}</p>

      <dl className="mt-8 grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2">
        <div>
          <dt className="text-sm text-slate-500">Status</dt>
          <dd data-testid="billing-status" className="mt-1 text-xl font-semibold">
            {view.statusLabel}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">
            {view.phase === 'trial' ? 'Trial ends' : 'Next billing date'}
          </dt>
          <dd data-testid="billing-next-date" className="mt-1 text-xl font-semibold">
            {view.nextBillingDate ?? 'Not scheduled'}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">Weekly chalks left</dt>
          <dd className="mt-1 text-xl font-semibold">{view.weeklyChalks}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">Top-up chalks</dt>
          <dd className="mt-1 text-xl font-semibold">{view.topUpChalks}</dd>
        </div>
      </dl>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h2 className="text-xl font-semibold">{plan.name}</h2>
            <p className="mt-2 text-3xl font-bold">
              {plan.price}
              <span className="text-base font-medium text-slate-500"> / {plan.period}</span>
            </p>
            <p className="mt-3 font-medium">{plan.chalks}</p>
            <p className="mt-1 text-sm text-slate-600">{plan.detail}</p>
            <button
              type="button"
              data-testid={plan.id === 'pro' ? 'subscribe-button' : undefined}
              disabled={busy || !view.canSubscribe}
              onClick={() =>
                void post({ action: 'subscribe', plan: plan.id }, `${plan.name}, ${plan.chalks}`)
              }
              className="mt-5 min-h-12 w-full rounded-xl bg-violet-700 px-4 text-base font-semibold text-white disabled:opacity-50"
            >
              {view.plan === plan.id ? 'Current plan' : `Choose ${plan.name}`}
            </button>
          </article>
        ))}
        <article id="top-up" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Top up</h2>
          <p className="mt-2 text-3xl font-bold">{formatInr(CHALK_PLANS.topUp.pricePaise)}</p>
          <p className="mt-3 font-medium">
            Top up {CHALK_PLANS.topUp.chalks} chalks for {formatInr(CHALK_PLANS.topUp.pricePaise)}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            One-time. Usable on any plan. These chalks never expire.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void post({ action: 'topup' }, `Top up ${CHALK_PLANS.topUp.chalks} chalks`)
            }
            className="mt-5 min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base font-semibold"
          >
            Top up
          </button>
        </article>
      </div>

      <article className="mt-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">School</h2>
        <p className="mt-2 text-slate-700">
          {formatInr(CHALK_PLANS.school.pricePaisePerSeatPerMonth)} per teacher per month, billed
          annually at {formatInr(CHALK_PLANS.school.annualPaisePerSeat)} per teacher. Minimum{' '}
          {CHALK_PLANS.school.minSeats} seats. {CHALK_PLANS.school.chalksPerSeatPerWeek} chalks per
          seat each week, shared in one pool. The bill is still once a year. One bill for the
          school.
        </p>
        <a
          href="/school"
          className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-slate-950 px-5 font-semibold text-white"
        >
          Open school admin
        </a>
      </article>

      {view.canCancel ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmCancel(true)}
          className="mt-6 min-h-12 rounded-xl border border-slate-300 px-6 text-base font-semibold"
        >
          Cancel
        </button>
      ) : null}
      {message ? (
        <p role="status" className="mt-4 text-sm text-slate-700">
          {message}
        </p>
      ) : null}
      {confirmCancel ? (
        <div
          role="alertdialog"
          aria-label="Cancel the plan"
          className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5"
        >
          <h2 className="text-lg font-semibold">Cancel this plan?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Razorpay stops the renewal at the end of the current period. Top-up chalks stay.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void post({ action: 'cancel' }, 'Cancel')}
              className="min-h-12 rounded-xl bg-slate-950 px-5 font-semibold text-white"
            >
              Cancel subscription
            </button>
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className="min-h-12 rounded-xl border border-slate-300 px-5 font-semibold"
            >
              Keep plan
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
