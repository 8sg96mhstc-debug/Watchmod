// generate-supplier-email
//
// Appelée par un trigger PostgreSQL dès qu'une commande passe au statut "payee".
// Rédige l'email fournisseur avec Claude, l'enregistre comme "programmé" (envoi
// différé de DELAI_ENVOI_MINUTES minutes) et envoie une notification annulable
// au propriétaire de la boutique.
//
// Auth : pas de JWT Supabase (appelée par pg_net depuis la base de données),
// vérifiée via l'en-tête x-internal-secret. Déployer avec verify_jwt = false.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const INTERNAL_SECRET = Deno.env.get('INTERNAL_TRIGGER_SECRET') ?? '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPPLIER_EMAIL = Deno.env.get('SUPPLIER_EMAIL') ?? '';
const NOTIFICATION_EMAIL = Deno.env.get('NOTIFICATION_EMAIL') ?? '';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Fenêtre d'annulation avant envoi automatique. Passer à 0 pour un envoi
// instantané une fois que le système aura fait ses preuves.
const DELAI_ENVOI_MINUTES = 15;

// Doit correspondre à une adresse sur un domaine vérifié dans Resend.
const FROM_EMAIL = 'commandes@watchmods.ch';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface Commande {
  id: string;
  produits: Array<{ reference?: string | null; nom: string; quantite: number }>;
  adresse_livraison: Record<string, unknown> | null;
  statut: string;
}

function formatAdresse(adresse: Record<string, unknown> | null): string {
  if (!adresse) return 'Address not provided';
  const parts = [adresse.line1, adresse.line2, adresse.postal_code, adresse.city, adresse.state, adresse.country]
    .filter(Boolean);
  return parts.join(', ');
}

async function draftEmail(commande: Commande): Promise<string> {
  const produitsTexte = (commande.produits || [])
    .map((p) => `- ${p.quantite} x ${p.nom}${p.reference ? ` (ref: ${p.reference})` : ''}`)
    .join('\n');

  const prompt = `Write a concise, professional purchase order email in English to our manufacturing supplier named Yu.
We run a watch modification brand called watchmods.ch. This is a request to prepare and ship parts for a customer order.
Do not describe where the brand or its watches are manufactured or based — that information is not relevant to this order and must not be mentioned or guessed.

Order reference: ${commande.id}
Items ordered:
${produitsTexte}

Ship to (final customer address, not ours):
${formatAdresse(commande.adresse_livraison)}

Write only the email body (no subject line, no placeholders). Keep it short, clear, and friendly but professional. Do not invent any details that are not given above.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`Erreur API Claude: ${await response.text()}`);
  }

  const data = await response.json();
  return (data.content?.[0]?.text ?? '').trim();
}

async function sendNotification(commande: Commande, corps: string, token: string) {
  const cancelUrl = `${SUPABASE_URL}/functions/v1/cancel-supplier-email?token=${token}`;

  const html = `
    <p>Commande <strong>${commande.id}</strong> — cet email sera envoyé automatiquement à ${SUPPLIER_EMAIL} dans ${DELAI_ENVOI_MINUTES} minutes.</p>
    <p><a href="${cancelUrl}" style="background:#b5654f;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px;display:inline-block;">Annuler l'envoi</a></p>
    <hr>
    <p><strong>Aperçu de l'email qui sera envoyé :</strong></p>
    <pre style="white-space:pre-wrap;font-family:inherit;">${corps.replace(/</g, '&lt;')}</pre>
  `;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: NOTIFICATION_EMAIL,
      subject: `Commande ${commande.id.slice(0, 8)} — envoi fournisseur programmé dans ${DELAI_ENVOI_MINUTES} min`,
      html
    })
  });
}

Deno.serve(async (req: Request) => {
  if (!INTERNAL_SECRET || req.headers.get('x-internal-secret') !== INTERNAL_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  let commande: Commande;
  try {
    const body = await req.json();
    commande = body.record;
  } catch {
    return new Response('JSON invalide', { status: 400 });
  }

  if (!commande || commande.statut !== 'payee') {
    return new Response('ignoré', { status: 200 });
  }

  try {
    const corps = await draftEmail(commande);
    const token = crypto.randomUUID();
    const envoyerApres = new Date(Date.now() + DELAI_ENVOI_MINUTES * 60 * 1000).toISOString();

    const { error } = await supabase.from('commandes_fournisseur').insert({
      commande_id: commande.id,
      destinataire: SUPPLIER_EMAIL,
      sujet: `New order ${commande.id.slice(0, 8)} — watchmods.ch`,
      corps,
      statut: 'programme',
      token,
      envoyer_apres: envoyerApres
    });

    if (error) {
      console.error('Erreur insertion commandes_fournisseur:', error);
      return new Response('Erreur enregistrement', { status: 500 });
    }

    await sendNotification(commande, corps, token);

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response('Erreur interne', { status: 500 });
  }
});
