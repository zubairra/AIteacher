'use client';

import { useState } from 'react';

import type { TeacherBillingView } from '@/lib/teacher/billing';

interface CheckoutResponse {
  ok?: boolean;
  keyId?: string;
  subscriptionId?: string;
  error?: string;
  billing?: TeacherBillingView;
}

declare global {
  interface Window {
    Razorpay?: new (options: {
      key: string;
      subscription_id: string;
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

export function BillingPanel({ initial }: { initial: TeacherBillingView }) {
  const [view, setView] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const post = async (action: 'subscribe' | 'cancel') => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/teacher/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const result = (await response.json()) as CheckoutResponse;
      if (!response.ok) throw new Error(result.error || 'Billing could not be updated.');
      if (action === 'cancel' && result.billing) {
        setView(result.billing);
        setConfirmCancel(false);
        setMessage('Cancellation is scheduled. Razorpay confirms the final status.');
        return;
      }
      if (!result.keyId || !result.subscriptionId) {
        throw new Error('Razorpay did not return a checkout session.');
      }
      await loadCheckout();
      if (!window.Razorpay) throw new Error('Razorpay Checkout could not be loaded.');
      const checkout = new window.Razorpay({
        key: result.keyId,
        subscription_id: result.subscriptionId,
        name: 'SmartBoard AI',
        description: `Teacher plan, ${view.priceLabel} per month`,
        theme: { color: '#6d28d9' },
        handler: () => {
          setMessage(
            'Razorpay accepted the checkout. The plan becomes active when the webhook confirms it. Refresh this page in a moment.',
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
    <section data-testid="billing-page" className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">Billing</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{view.headline}</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">{view.detail}</p>

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
          <dt className="text-sm text-slate-500">Price</dt>
          <dd className="mt-1 text-xl font-semibold">{view.priceLabel} / month</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">Where it bills</dt>
          <dd className="mt-1 text-xl font-semibold">India, INR</dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {view.canSubscribe ? (
          <button
            type="button"
            data-testid="subscribe-button"
            disabled={busy}
            onClick={() => void post('subscribe')}
            className="min-h-12 rounded-xl bg-violet-700 px-6 text-base font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Opening checkout…' : 'Subscribe'}
          </button>
        ) : null}
        {view.canCancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmCancel(true)}
            className="min-h-12 rounded-xl border border-slate-300 px-6 text-base font-semibold"
          >
            Cancel
          </button>
        ) : null}
      </div>
      {message ? (
        <p role="status" className="mt-4 text-sm text-slate-700">
          {message}
        </p>
      ) : null}
      {confirmCancel ? (
        <div
          role="alertdialog"
          aria-label="Cancel the Teacher plan"
          className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5"
        >
          <h2 className="text-lg font-semibold">Cancel the Teacher plan?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Razorpay stops the renewal at the end of the current period. Until then, generation
            stays available.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void post('cancel')}
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
