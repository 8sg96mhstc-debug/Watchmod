const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Source de vérité des prix et stocks, côté serveur — ne jamais faire confiance
// aux prix envoyés par le navigateur. À remplacer par une lecture Supabase
// (table "produits") une fois les produits synchronisés en base.
const PRODUITS = [
  { reference: 'WM-101', nom: 'Meridian Émeraude', prix: 279, stock: 5 },
  { reference: 'WM-102', nom: 'Meridian Azur', prix: 279, stock: 3 },
  { reference: 'WM-103', nom: 'Meridian Rosé', prix: 319, stock: 2 },
  { reference: 'WM-201', nom: 'Aviateur Blanc', prix: 259, stock: 6 },
  { reference: 'WM-202', nom: 'Aviateur Cuir Bleu', prix: 249, stock: 4 },
  { reference: 'WM-301', nom: 'Marina Noire', prix: 289, stock: 5 },
  { reference: 'WM-302', nom: 'Marina Cuivre', prix: 329, stock: 2 },
  { reference: 'WM-401', nom: 'Globetrotter GMT', prix: 339, stock: 3 }
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
