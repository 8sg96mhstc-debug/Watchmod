const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function (event) {
  const signature = event.headers['stripe-signature'];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Signature webhook invalide:', err.message);
    return { statusCode: 400, body: `Webhook signature invalide: ${err.message}` };
  }

  if (stripeEvent.type !== 'checkout.session.completed') {
    return { statusCode: 200, body: 'ignoré (événement non traité)' };
  }

  const session = stripeEvent.data.object;

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
  const produits = lineItems.data.map(li => ({
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
      return { statusCode: 200, body: 'ok (déjà traité)' };
    }
    console.error('Erreur insertion commande Supabase:', error);
    return { statusCode: 500, body: 'Erreur enregistrement commande' };
  }

  return { statusCode: 200, body: 'ok' };
};
