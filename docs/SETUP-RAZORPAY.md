# Razorpay teacher subscription

SmartBoard bills teachers in India only. A new teacher gets a 15-day free trial at their first Google sign-in. No card is collected for the trial. After that, the Teacher plan is Rs 99 per month through Razorpay Subscriptions (UPI autopay, cards, and the other methods Checkout offers).

The price and the trial length live in `lib/teacher/billing.ts` (`TEACHER_PLAN`). Change them there. A plan that was already created in Razorpay keeps the amount it was created with, so create a new plan after a price change and put the new id in `RAZORPAY_PLAN_ID`.

Webhooks are the source of truth for paid status. Checkout success on its own does not mark the plan active.

## Environment

Add these to `.env` (this repo also reads `.env.local`; `.env.local` wins). Restart `pnpm dev` after saving. Do not commit the file.

| Name | Who can see it |
| --- | --- |
| `RAZORPAY_KEY_ID` | Server. Same value as the public Key Id. |
| `RAZORPAY_KEY_SECRET` | Server only. Never log it or prefix it with `NEXT_PUBLIC_`. |
| `RAZORPAY_WEBHOOK_SECRET` | Server only. The secret you type when creating the webhook. |
| `RAZORPAY_PLAN_ID` | Server. The plan id, `plan_...`. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Browser. Set this to the same Key Id. Checkout uses it. |

## Test mode first

1. Open [https://dashboard.razorpay.com/](https://dashboard.razorpay.com/) and sign in. Use **Test Mode**. The toggle is in the dashboard header. Stay in Test Mode until the flow below works. Test payments do not move money.
2. Go to **Account & Settings → API Keys** (in Test Mode this is **Settings → API Keys**). Click **Generate Key** if you do not already have a test pair. Copy the **Key Id** into both `RAZORPAY_KEY_ID` and `NEXT_PUBLIC_RAZORPAY_KEY_ID`. Copy the **Key Secret** into `RAZORPAY_KEY_SECRET`. Razorpay shows the secret once. Do not paste it into chat, a screenshot, or a `NEXT_PUBLIC_` variable.
3. Create the monthly plan. Either:
   - In the dashboard: **Subscriptions → Plans → + New Plan**. Name it `SmartBoard AI Teacher`. Billing amount **₹99**. Frequency **Monthly** (every 1 month). Create the plan and copy its id (`plan_...`) into `RAZORPAY_PLAN_ID`.
   - Or from the repo, with the key pair already exported in the environment: `pnpm exec tsx scripts/razorpay-create-plan.ts`. The command prints only the plan id. Put that id in `RAZORPAY_PLAN_ID`.
4. Add a webhook. **Account & Settings → Webhooks → + Add New Webhook**.
   - URL: `https://<your public host>/api/billing/razorpay/webhook`. Razorpay cannot call `localhost`. For a local trial, point a tunnel (Cloudflare Tunnel or ngrok) at `pnpm dev` and use that https URL.
   - Secret: generate a long random string, put the same value in `RAZORPAY_WEBHOOK_SECRET`, and paste it into the webhook secret field.
   - Active events: `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `subscription.updated`, `payment.failed`.
   - Save.
5. Restart the app. Sign in with Google. The dashboard shows the free-trial banner. **Billing** shows the status, the trial end date, and **Subscribe**.
6. Click **Subscribe**. Razorpay Checkout opens. In Test Mode use a test success method, not a real card:
   - Card: `4111 1111 1111 1111`, any future expiry, any CVV, any name.
   - UPI: `success@razorpay`.
7. After Checkout, the Billing page stays on “confirmation pending” until the webhook arrives. Refresh after Razorpay delivers `subscription.activated` or `subscription.charged`. The status becomes active and generation stays available after the trial date. **Cancel** asks Razorpay to stop at the end of the current period. A failed or halted payment blocks new generation once the trial is over. Existing lessons can still be opened and taught.

The local emulator command `pnpm test:firebase-emulator` does not call Razorpay. It checks the trial banner, the billing page, the blocked screen, and that the generation API returns 402 after the trial.

## Live mode, after KYC

Test plans, test keys, and test webhooks do not exist in Live Mode. Do this only after the test flow works.

1. In the Razorpay dashboard, complete **KYC / Account activation** (often under **Account & Settings → Account activation**). Razorpay asks for the business type, PAN, a bank account that can receive settlements, and the documents for that business type. Submit them and wait until the account is activated. Live charges do not work before this.
2. Switch the dashboard header from **Test Mode** to **Live Mode**.
3. Generate the **Live** API keys. Replace `RAZORPAY_KEY_ID`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, and `RAZORPAY_KEY_SECRET`. Do not reuse the test secret.
4. Create the plan again in Live Mode (dashboard or `pnpm exec tsx scripts/razorpay-create-plan.ts` with the live keys). Put the live `plan_...` id in `RAZORPAY_PLAN_ID`.
5. Create a new live webhook aimed at the production `https://<host>/api/billing/razorpay/webhook`, with a new secret in `RAZORPAY_WEBHOOK_SECRET`, and the same events as in test mode.
6. Restart or redeploy the server so it reads the live values. Do not log the secret, the webhook secret, or the raw webhook body.
