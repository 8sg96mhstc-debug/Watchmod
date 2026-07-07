const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Source de vérité des prix et stocks, côté serveur — ne jamais faire confiance
// aux prix envoyés par le navigateur. À remplacer par une lecture Supabase
// (table "produits") une fois les produits synchronisés en base.
const PRODUITS = [
  { reference: 'WM-001', nom: 'Midnight Fifty-Five', prix: 249, stock: 4 },
  { reference: 'WM-002', nom: 'Verdant Diver', prix: 279, stock: 0 },
  { reference: 'WM-003', nom: 'Brass Explorer', prix: 289, stock: 6 },
  { reference: 'WM-004', nom: 'Slate Fieldwatch', prix: 229, stock: 8 },
  { reference: 'WM-005', nom: 'Copper Alpinist', prix: 299, stock: 2 },
  { reference: 'WM-006', nom: 'Noir Dress', prix: 259, stock: 5 }
];

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: 'JSON invalide' };
  }

  const items = payload.items;
  if (!Array.isArray(items) || items.length === 0) {
    return { statusCode: 400, body: 'Panier vide' };
  }

  const line_items = [];
  for (const item of items) {
    const produit = PRODUITS.find(p => p.reference === item.reference);
    if (!produit) {
      return { statusCode: 400, body: `Produit inconnu : ${item.reference}` };
    }
    const quantite = Math.max(1, Math.min(10, parseInt(item.quantite, 10) || 1));
    if (produit.stock < quantite) {
      return { statusCode: 400, body: `Stock insuffisant pour ${produit.nom}` };
    }
    line_items.push({
      quantity: quantite,
      price_data: {
        currency: 'chf',
        unit_amount: Math.round(produit.prix * 100),
        product_data: {
          name: produit.nom,
          metadata: { reference: produit.reference }
        }
      }
    });
  }

  const siteUrl = process.env.URL || `https://${event.headers.host}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      shipping_address_collection: {
        allowed_countries: ['CH', 'FR', 'DE', 'IT', 'AT', 'BE', 'LU']
      },
      success_url: `${siteUrl}/merci.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/panier.html`
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url })
    };
  } catch (err) {
    console.error('Erreur création session Stripe:', err);
    return { statusCode: 500, body: 'Impossible de créer le paiement pour le moment.' };
  }
};
