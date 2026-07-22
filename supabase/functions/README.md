# Automatisation email fournisseur — guide de déploiement (iPad, sans terminal)

Cette fonctionnalité envoie automatiquement un email en anglais à Yu (fournisseur)
dès qu'une commande client est payée, avec une fenêtre de 15 minutes pour
annuler l'envoi si besoin. Tout se fait depuis Safari, aucune ligne de
commande n'est nécessaire.

## Ordre des opérations (important)

1. Créer les comptes Resend et Anthropic, récupérer les clés (étape A)
2. Déployer les 3 fonctions dans Supabase (étape B)
3. Ajouter les secrets dans Supabase (étape C)
4. Exécuter le fichier `supabase/supplier-email-schema.sql` (étape D)
5. Faire un test (étape E)

---

## Étape A — Créer les comptes et récupérer les clés

### Resend (envoi des emails)

1. Va sur [resend.com](https://resend.com) → crée un compte gratuit.
2. Menu **Domains** → **Add Domain** → tape `watchmods.ch`.
3. Resend te donne 2-3 lignes DNS à ajouter (type TXT, MX, CNAME). Va chez
   l'hébergeur où tu as acheté ton nom de domaine watchmods.ch, section
   "DNS" ou "Zone DNS", et ajoute ces lignes exactement comme indiqué par
   Resend. Ça peut prendre jusqu'à quelques heures pour être validé (souvent
   quelques minutes).
4. Une fois le domaine marqué "Verified" chez Resend : menu **API Keys** →
   **Create API Key** → copie la clé (commence par `re_...`). Tu ne la
   reverras plus en clair, garde-la de côté.

### Anthropic (rédaction de l'email par Claude)

1. Va sur [console.anthropic.com](https://console.anthropic.com) → crée un compte.
2. Menu **API Keys** → **Create Key** → copie la clé (commence par `sk-ant-...`).

## Étape B — Déployer les 3 fonctions (Supabase Dashboard)

Pour chacune des 3 fonctions ci-dessous :

1. Dans Supabase, menu **Edge Functions** (icône `</>`) → **Deploy a new function** (ou **Create a new function**).
2. Donne exactement le nom indiqué (important, le code y fait référence).
3. Ouvre le fichier correspondant dans ce dépôt GitHub (`supabase/functions/<nom>/index.ts`),
   copie tout son contenu, colle-le dans l'éditeur Supabase.
4. **Désactive l'option "Verify JWT"** (ou "Enforce JWT verification") — ces
   fonctions sont appelées par la base de données elle-même ou par un lien
   d'email, pas par un utilisateur connecté.
5. Déploie.

Fonctions à créer, dans cet ordre :
- `generate-supplier-email`
- `send-supplier-email`
- `cancel-supplier-email`

## Étape C — Ajouter les secrets

Dans Supabase : **Project Settings → Edge Functions → Secrets** (ou **Manage secrets**),
ajoute ces 5 valeurs :

| Nom du secret | Valeur |
|---|---|
| `ANTHROPIC_API_KEY` | ta clé Anthropic (étape A) |
| `RESEND_API_KEY` | ta clé Resend (étape A) |
| `SUPPLIER_EMAIL` | `670087247@qq.com` |
| `NOTIFICATION_EMAIL` | l'adresse email où tu veux recevoir les notifications de commande |
| `INTERNAL_TRIGGER_SECRET` | le code secret que Claude t'a donné dans le chat (à ne jamais mettre sur GitHub) |

Tu n'as rien à faire pour `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` : Supabase
les fournit automatiquement à chaque fonction.

## Étape D — Exécuter le SQL

1. Ouvre `supabase/supplier-email-schema.sql` dans ce dépôt.
2. Copie tout le contenu.
3. **Remplace les 2 occurrences de `REMPLACE_PAR_TON_SECRET`** par le même
   code secret que celui mis dans `INTERNAL_TRIGGER_SECRET` à l'étape C.
4. Colle dans Supabase → **SQL Editor** → **New query** → **Run**.
5. Tu dois voir "Success".

## Étape E — Tester

Le plus simple : passe une vraie commande test sur le site (petit montant,
en mode Stripe test). Dans les 30 secondes qui suivent, tu dois recevoir un
email à l'adresse `NOTIFICATION_EMAIL` avec le brouillon et un bouton
"Annuler l'envoi". Si tu ne cliques sur rien, l'email part à Yu 15 minutes
plus tard.

Pour vérifier manuellement l'état des envois, dans Supabase : **Table
Editor → commandes_fournisseur** — tu verras chaque email généré, son
statut (`programme`, `envoye`, `annule`, `erreur`) et son contenu.

## Passer à l'envoi 100% automatique plus tard

Dans `supabase/functions/generate-supplier-email/index.ts`, changer :

```ts
const DELAI_ENVOI_MINUTES = 15;
```

en :

```ts
const DELAI_ENVOI_MINUTES = 0;
```

puis redéployer cette seule fonction (copier-coller le nouveau code dans
Supabase Dashboard comme à l'étape B). Aucun autre changement nécessaire.
