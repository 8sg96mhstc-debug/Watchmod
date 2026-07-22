-- ============================================================
-- watchmods.ch — automatisation email fournisseur (Yu)
-- À exécuter dans : Supabase Dashboard > SQL Editor > New query
-- (à coller APRÈS avoir déployé les 3 Edge Functions, voir supabase/functions/README.md)
--
-- IMPORTANT : remplace TOUTES les occurrences de REMPLACE_PAR_TON_SECRET
-- ci-dessous par le secret interne que Claude t'a donné dans le chat
-- (le même secret doit aussi être ajouté comme "Edge Function secret"
-- nommé INTERNAL_TRIGGER_SECRET — voir supabase/functions/README.md).
-- Ne mets jamais ce secret dans un fichier commité sur GitHub : ce
-- dépôt est public.
-- ============================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ------------------------------------------------------------
-- Table commandes_fournisseur
-- ------------------------------------------------------------
create table if not exists commandes_fournisseur (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references commandes(id),
  destinataire text not null,
  sujet text not null,
  corps text not null,
  statut text not null default 'programme' check (statut in ('programme', 'envoye', 'annule', 'erreur')),
  token text not null unique,
  envoyer_apres timestamptz not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_commandes_fournisseur_statut on commandes_fournisseur (statut, envoyer_apres);

alter table commandes_fournisseur enable row level security;
-- Aucune règle publique créée : cette table n'est accessible que via la clé
-- "service_role", utilisée uniquement par les Edge Functions ci-dessous.
-- Elle contient l'adresse du client et les coordonnées du fournisseur —
-- elle ne doit jamais être lisible depuis le site public.

-- ------------------------------------------------------------
-- Déclencheur : appelle generate-supplier-email quand une commande passe "payee"
-- ------------------------------------------------------------
create or replace function trigger_generate_supplier_email()
returns trigger as $$
begin
  if NEW.statut = 'payee' and (TG_OP = 'INSERT' or OLD.statut is distinct from 'payee') then
    perform net.http_post(
      url := 'https://dthpbmiyebbhrtaqcoan.supabase.co/functions/v1/generate-supplier-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', 'REMPLACE_PAR_TON_SECRET'
      ),
      body := jsonb_build_object('record', row_to_json(NEW))
    );
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_commandes_notify_supplier on commandes;
create trigger trg_commandes_notify_supplier
after insert or update on commandes
for each row execute function trigger_generate_supplier_email();

-- ------------------------------------------------------------
-- Tâche planifiée : appelle send-supplier-email chaque minute pour
-- envoyer les emails dont la fenêtre d'annulation de 15 minutes est passée.
-- ------------------------------------------------------------
select cron.schedule(
  'envoi-emails-fournisseur',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://dthpbmiyebbhrtaqcoan.supabase.co/functions/v1/send-supplier-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', 'REMPLACE_PAR_TON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $cron$
);
