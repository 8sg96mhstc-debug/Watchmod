-- ============================================================
-- watchmods.ch — structure de base de données Supabase
-- À exécuter une seule fois dans : Supabase Dashboard > SQL Editor > New query
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Table produits
-- ------------------------------------------------------------
create table if not exists produits (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  nom text not null,
  slug text not null unique,
  collection text,
  description text,
  prix numeric(10,2) not null check (prix >= 0),
  photos text[] not null default '{}',
  stock integer not null default 0 check (stock >= 0),
  statut text not null default 'actif' check (statut in ('actif', 'inactif')),
  en_vedette boolean not null default false,
  ordre_affichage integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Garde-fou légal : interdiction totale des mentions "Swiss" / "Switzerland"
  -- (montres non fabriquées en Suisse — mention interdite par la loi suisse)
  constraint produits_pas_de_mention_suisse check (
    coalesce(nom, '') !~* '\y(swiss|switzerland)\y'
    and coalesce(description, '') !~* '\y(swiss|switzerland)\y'
    and coalesce(reference, '') !~* '\y(swiss|switzerland)\y'
  )
);

create index if not exists idx_produits_statut on produits (statut);
create index if not exists idx_produits_collection on produits (collection);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_produits_updated_at on produits;
create trigger trg_produits_updated_at
before update on produits
for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- Table commandes
-- ------------------------------------------------------------
create table if not exists commandes (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  client_nom text,
  produits jsonb not null,          -- copie figée des articles achetés (nom, prix, quantité) au moment du paiement
  montant_total numeric(10,2) not null check (montant_total >= 0),
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'payee', 'preparation', 'expediee', 'annulee')),
  adresse_livraison jsonb not null,
  stripe_session_id text unique,    -- pour relier la commande à la session de paiement Stripe
  stripe_payment_intent_id text,
  numero_suivi text,
  created_at timestamptz not null default now()
);

create index if not exists idx_commandes_stripe_session on commandes (stripe_session_id);
create index if not exists idx_commandes_statut on commandes (statut);

-- ------------------------------------------------------------
-- Sécurité (RLS = qui a le droit de lire/écrire quoi)
-- ------------------------------------------------------------
alter table produits enable row level security;
alter table commandes enable row level security;

-- Le site public peut LIRE uniquement les produits actifs.
-- Aucune règle d'insert/update/delete n'est créée pour le public :
-- avec RLS activé, tout ce qui n'a pas de règle explicite est bloqué par défaut.
drop policy if exists "produits_lecture_publique" on produits;
create policy "produits_lecture_publique"
on produits for select
to anon, authenticated
using (statut = 'actif');

-- Table commandes : AUCUNE règle publique (ni lecture, ni écriture).
-- Elle reste totalement fermée au navigateur. Les commandes seront créées
-- uniquement par une fonction serveur (Supabase Edge Function) qui utilise
-- la clé "service_role" (qui contourne RLS) après vérification du paiement
-- Stripe via webhook. Ça empêche quiconque de fabriquer une fausse commande
-- "payée" depuis les outils développeur du navigateur.

-- ------------------------------------------------------------
-- Stockage des photos produits
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('produits-photos', 'produits-photos', true)
on conflict (id) do nothing;

drop policy if exists "photos_lecture_publique" on storage.objects;
create policy "photos_lecture_publique"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'produits-photos');

-- L'ajout de photos (upload) se fait depuis le Dashboard Supabase (Storage),
-- pas besoin d'ouvrir cette porte au public.
