import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const signature = request.headers.get('stripe-signature');
  const body = await request.text();

  let stripeEvent;
  try {
    // constructEventAsync (et non constructEvent) : le runtime Workers de Cloudflare
    // n'a pas l'API crypto synchrone de Node, la vérification de signature doit être asynchrone.
    stripeEvent = await stripe.webhooks.constructEventAsync(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Signature webhook invalide:', err.message);
    return new Response(`Webhook signature invalide: ${err.message}`, { status: 400 });
  }

  if (stripeEvent.type !== 'checkout.session.completed') {
    return new Response('ignoré (événement non traité)', { status: 200 });
  }

  const session = stripeEvent.data.object;

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 100,
    expand: ['data.price.product']
  });
  const produits = lineItems.data.map(li => ({
    reference: (li.price && li.price.product && li.price.product.metadata && li.price.product.metadata.reference) || null,
    nom: li.description,
    quantite: li.quantity,
    montant: li.amount_total / 100
  }));

  const adresse = (session.shipping_details && session.shipping_details.address)
    || (session.customer_details && session.customer_details.address)
    || {};

  const clientNom = (session.shipping_details && session.shipping_details.name)
    || (session.customer_details && session.customer_details.name)
    || null;

  const { error } = await supabase.from('commandes').insert({
    client_email: session.customer_details ? session.customer_details.email : null,
    client_nom: clientNom,
    produits,
    montant_total: session.amount_total / 100,
    statut: 'payee',
    adresse_livraison: adresse,
    stripe_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent
  });

  if (error) {
    if (error.code === '23505') {
      // Webhook déjà traité pour cette session (Stripe peut renvoyer l'événement plusieurs fois).
      return new Response('ok (déjà traité)', { status: 200 });
    }
    console.error('Erreur insertion commande Supabase:', error);
    return new Response('Erreur enregistrement commande', { status: 500 });
  }

  return new Response('ok', { status: 200 });
}
