# Mise en place de la base de données (Supabase)

Ce dossier contient `schema.sql` : le fichier qui crée les tables `produits` et `commandes`, avec les règles de sécurité et le garde-fou légal (blocage des mentions "Swiss"/"Switzerland").

## Étapes à suivre depuis ton iPad (une seule fois)

1. Va sur [supabase.com](https://supabase.com) et connecte-toi (ou crée un compte gratuit si ce n'est pas déjà fait).
2. Crée un nouveau projet (bouton "New project") — choisis un nom (ex: `watchmods`) et un mot de passe pour la base de données. **Note ce mot de passe quelque part**, tu ne le reverras plus en clair.
3. Attends 1-2 minutes que le projet soit prêt (statut vert "Active").
4. Dans le menu de gauche, clique sur **SQL Editor**.
5. Clique sur **New query**.
6. Ouvre le fichier `supabase/schema.sql` de ce projet, copie tout son contenu, colle-le dans l'éditeur.
7. Clique sur **Run** (ou le bouton ▶️). Tu dois voir "Success. No rows returned".
8. Va dans le menu **Table Editor** à gauche : tu dois voir apparaître les tables `produits` et `commandes`.

## Récupérer les informations de connexion (pour la suite)

Toujours dans ton projet Supabase :

1. Menu **Project Settings** (icône engrenage) → **API**.
2. Note deux informations, on en aura besoin pour connecter le site :
   - **Project URL** (ressemble à `https://xxxxx.supabase.co`)
   - **anon public key** (une longue clé de caractères) — c'est la clé "publique", sans danger à mettre dans le code du site, car elle est justement limitée par les règles de sécurité qu'on vient de créer.

Ne me communique jamais la clé "service_role" (l'autre clé, plus puissante) directement dans le chat — elle donne un accès total à la base sans restriction, elle doit rester secrète et ne sera utilisée que côté serveur plus tard (pour Stripe).

## Une fois fait

Dis-moi "c'est fait" et donne-moi le **Project URL** (l'URL suffit, pas besoin de la clé tout de suite si tu préfères attendre) — je passe alors à l'étape 2 : le catalogue et la fiche produit.
