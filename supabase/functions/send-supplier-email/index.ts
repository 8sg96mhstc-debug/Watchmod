// send-supplier-email
//
// Appelée chaque minute par un job pg_cron. Envoie réellement (via Resend)
// tous les emails fournisseur dont la fenêtre d'annulation est passée et
// qui sont toujours au statut "programme" (pas annulés entre-temps).
//
// Auth : pas de JWT Supabase (appelée par pg_net depuis pg_cron), vérifiée
// via l'en-tête x-internal-secret. Déployer avec verify_jwt = false.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const INTERNAL_SECRET = Deno.env.get('INTERNAL_TRIGGER_SECRET') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Doit correspondre à une adresse sur un domaine vérifié dans Resend.
const FROM_EMAIL = 'commandes@watchmods.ch';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
  if (!INTERNAL_SECRET || req.headers.get('x-internal-secret') !== INTERNAL_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: aEnvoyer, error } = await supabase
    .from('commandes_fournisseur')
    .select('*')
    .eq('statut', 'programme')
    .lte('envoyer_apres', new Date().toISOString());

  if (error) {
    console.error('Erreur lecture commandes_fournisseur:', error);
    return new Response('Erreur lecture', { status: 500 });
  }

  let envoyes = 0;
  let erreurs = 0;

  for (const item of aEnvoyer ?? []) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: item.destinataire,
          subject: item.sujet,
          text: item.corps
        })
      });

      if (!res.ok) {
        console.error(`Erreur envoi Resend pour ${item.id}:`, await res.text());
        await supabase.from('commandes_fournisseur').update({ statut: 'erreur' }).eq('id', item.id);
        erreurs++;
        continue;
      }

      await supabase
        .from('commandes_fournisseur')
        .update({ statut: 'envoye', sent_at: new Date().toISOString() })
        .eq('id', item.id);
      envoyes++;
    } catch (err) {
      console.error(`Erreur traitement ${item.id}:`, err);
      await supabase.from('commandes_fournisseur').update({ statut: 'erreur' }).eq('id', item.id);
      erreurs++;
    }
  }

  return new Response(JSON.stringify({ envoyes, erreurs, total: (aEnvoyer ?? []).length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
});
