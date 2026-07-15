import { onRequestPost as createCheckoutSession } from './functions/api/create-checkout-session.js';
import { onRequestPost as stripeWebhook } from './functions/api/stripe-webhook.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/create-checkout-session') {
      return createCheckoutSession({ request, env });
    }
    if (request.method === 'POST' && url.pathname === '/api/stripe-webhook') {
      return stripeWebhook({ request, env });
    }

    return env.ASSETS.fetch(request);
  }
};
