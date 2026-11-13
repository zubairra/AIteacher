import { handleRazorpayWebhook, firestoreBillingWebhookStore } from '@/lib/server/billing/webhook';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handleRazorpayWebhook(request, firestoreBillingWebhookStore);
}
