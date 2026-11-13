# Razorpay teacher subscription

SmartBoard bills teachers in India only. A new teacher gets a 15-day free trial and 10 chalks at their first Google sign-in. No card is collected for the trial. One chalk makes one new AI lesson. A lesson that fails does not spend a chalk. Monthly chalks reset on the billing cycle and do not roll over. Top-up chalks stay until they are used.

Plans, in `lib/teacher/billing.ts` (`CHALK_PLANS`):

- Pro: ₹99/month, 20 chalks a month, one teacher.
- Max: ₹499/month, 130 chalks a month, one teacher.
- School: ₹89 per teacher per month, billed annually at ₹1,068 per teacher. Minimum 10 seats. 17 chalks per seat each month in one shared pool. One bill for the school.
- Top-up: 100 chalks for ₹399, one-time, usable on any plan.

A teacher who has saved their own provider key does not spend chalks (`ownKeyConsumesChalk` is false). Change the numbers only in that file. A Razorpay plan keeps the amount it was created with, so create a new plan after a price change.

Webhooks are the source of truth for paid status. Checkout success on its own does not mark the plan active.

## Environment

Add these to `.env` (this repo also reads `.env.local`; `.env.local` wins). Restart `pnpm dev` after saving. Do not commit the file.

| Name | Who can see it |
| --- | --- |
| `RAZORPAY_KEY_ID` | Server. Same value as the public Key Id. |
| `RAZORPAY_KEY_SECRET` | Server only. Never log it or prefix it with `NEXT_PUBLIC_`. |
| `RAZORPAY_WEBHOOK_SECRET` | Server only. The secret you type when creating the webhook. |
| `RAZORPAY_PRO_PLAN_ID` | Server. Monthly Pro plan id. `RAZORPAY_PLAN_ID` is accepted as an alias. |
| `RAZORPAY_MAX_PLAN_ID` | Server. Monthly Max plan id. |
| `RAZORPAY_SCHOOL_PLAN_ID` | Server. Yearly per-seat School plan id. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Browser. Set this to the same Key Id. Checkout uses it. |

## Test mode first

1. Open [https://dashboard.razorpay.com/](https://dashboard.razorpay.com/) and sign in. Use **Test Mode**. The toggle is in the dashboard header. Stay in Test Mode until the flow below works. Test payments do not move money.
2. Go to **Account & Settings → API Keys** (in Test Mode this is **Settings → API Keys**). Click **Generate Key** if you do not already have a test pair. Copy the **Key Id** into both `RAZORPAY_KEY_ID` and `NEXT_PUBLIC_RAZORPAY_KEY_ID`. Copy the **Key Secret** into `RAZORPAY_KEY_SECRET`. Razorpay shows the secret once. Do not paste it into chat, a screenshot, or a `NEXT_PUBLIC_` variable.
3. Create three subscription plans. Either in **Subscriptions → Plans → + New Plan**, or with `pnpm exec tsx scripts/razorpay-create-plan.ts`, which prints only the plan ids.
   - Pro: name `SmartBoard AI Pro`, **₹99**, every **1 month**. Save the id as `RAZORPAY_PRO_PLAN_ID`.
   - Max: name `SmartBoard AI Max`, **₹499**, every **1 month**. Save the id as `RAZORPAY_MAX_PLAN_ID`.
   - School: name `SmartBoard AI School`, **₹1,068**, every **1 year**. This is the per-seat price. The app sets Razorpay quantity to the number of seats. Save the id as `RAZORPAY_SCHOOL_PLAN_ID`.
   Top-ups are one-time orders, not plans. No extra plan id is required for the ₹399 pack.
4. Add a webhook. **Account & Settings → Webhooks → + Add New Webhook**.
   - URL: `https://<your public host>/api/billing/razorpay/webhook`. Razorpay cannot call `localhost`. For a local trial, point a tunnel (Cloudflare Tunnel or ngrok) at `pnpm dev` and use that https URL.
   - Secret: generate a long random string, put the same value in `RAZORPAY_WEBHOOK_SECRET`, and paste it into the webhook secret field.
   - Active events: `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `subscription.updated`, `payment.failed`, `order.paid`, `payment.captured`.
   - Save.
5. Restart the app. Sign in with Google. The dashboard shows the free-trial banner and how many chalks are left. **Plans** shows Pro, Max, School, and the top-up.
6. Choose a plan or top up. Razorpay Checkout opens. In Test Mode use a test success method, not a real card:
   - Card: `4111 1111 1111 1111`, any future expiry, any CVV, any name.
   - UPI: `success@razorpay`.
7. After Checkout, Plans stays on “confirmation pending” until the webhook arrives. Refresh after Razorpay delivers `subscription.activated`, `subscription.charged`, or `order.paid`. Monthly chalks refill on `subscription.charged` and unused monthly chalks do not roll over. Top-up chalks are added by `order.paid` and stay until they are used. **Cancel** asks Razorpay to stop the renewal at the end of the current period. A failed or halted payment clears monthly chalks. Saved lessons can still be opened and taught.
8. To grant a 30-day school pilot, run `pnpm exec tsx scripts/grant-school-pilot.ts --admin-uid FIREBASE_UID --seats 10 --name "School name"` on a machine with Firebase Admin credentials. That admin opens **School**, invites teachers by email, and can remove a seat. The invited teacher joins the shared pool when they sign in with that Google email. A paid school uses the yearly plan with quantity equal to the number of seats.

The local emulator command `pnpm test:firebase-emulator` does not call Razorpay. It checks the trial banner, the billing page, the blocked screen, and that the generation API returns 402 after the trial.

## Live mode, after KYC

Test plans, test keys, and test webhooks do not exist in Live Mode. Do this only after the test flow works.

1. In the Razorpay dashboard, complete **KYC / Account activation** (often under **Account & Settings → Account activation**). Razorpay asks for the business type, PAN, a bank account that can receive settlements, and the documents for that business type. Submit them and wait until the account is activated. Live charges do not work before this.
2. Switch the dashboard header from **Test Mode** to **Live Mode**.
3. Generate the **Live** API keys. Replace `RAZORPAY_KEY_ID`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, and `RAZORPAY_KEY_SECRET`. Do not reuse the test secret.
4. Create the three plans again in Live Mode. Test plans do not carry over. Put the live ids in `RAZORPAY_PRO_PLAN_ID`, `RAZORPAY_MAX_PLAN_ID`, and `RAZORPAY_SCHOOL_PLAN_ID`.
5. Create a new live webhook aimed at the production `https://<host>/api/billing/razorpay/webhook`, with a new secret in `RAZORPAY_WEBHOOK_SECRET`, and the same events as in test mode.
6. Restart or redeploy the server so it reads the live values. Do not log the secret, the webhook secret, or the raw webhook body.
