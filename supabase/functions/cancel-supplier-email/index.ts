// cancel-supplier-email
//
// Endpoint public (lien cliqué depuis l'app Mail) qui annule un envoi
// fournisseur encore "programme". La sécurité repose sur le token
// aléatoire à usage unique généré par generate-supplier-email, pas sur
// une authentification Supabase — cette fonction doit rester accessible
// sans JWT (verify_jwt = false) puisqu'un simple tap sur un lien d'email
// ne peut pas porter de jeton de session Supabase.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function page(titre: string, message: string, ok: boolean): Response {
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>watchmods.ch</title>
<style>
  body { background:#12151a; color:#ece7de; font-family:-apple-system,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; text-align:center; padding:24px; }
  .box { max-width:420px; }
  h1 { font-size:1.4rem; color:${ok ? '#c19a5b' : '#b5654f'}; margin-bottom:12px; }
  p { color:#888e97; }
</style>
</head>
<body><div class="box"><h1>${titre}</h1><p>${message}</p></div></body>
</html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return page('Lien invalide', 'Aucun code fourni dans le lien.', false);
  }

  const { data: item, error } = await supabase
    .from('commandes_fournisseur')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error || !item) {
    return page('Lien invalide', "Ce lien n'existe pas ou plus.", false);
  }

  if (item.statut !== 'programme') {
    return page('Déjà traité', `Cette commande a déjà le statut "${item.statut}" — trop tard pour annuler.`, false);
  }

  await supabase.from('commandes_fournisseur').update({ statut: 'annule' }).eq('id', item.id);

  return page('Envoi annulé', "L'email au fournisseur ne sera pas envoyé.", true);
});
