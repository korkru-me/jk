-- Durable, service-role-only tombstones for the isolated SEB Phase S5 harness.
-- A run id is intentionally never deleted or reusable, even after cleanup.

create table public.seb_staging_qa_run_reservations (
  run_id text primary key,
  qa_namespace text not null unique,
  source_sha text not null,
  deployment_id text not null,
  reservation_proof_sha256 text not null unique,
  state text not null default 'reserved',
  reserved_at timestamptz not null default now(),
  cleaned_at timestamptz,

  constraint seb_staging_qa_run_reservations_run_id_check
    check (
      run_id ~ '^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$'
      and run_id <> 'seb-s5-preview'
      and run_id !~ '(prod(?:uction)?|live|real|customer)'
    ),
  constraint seb_staging_qa_run_reservations_namespace_check
    check (qa_namespace = 'qa:' || run_id),
  constraint seb_staging_qa_run_reservations_source_sha_check
    check (source_sha ~ '^[0-9a-f]{40}$'),
  constraint seb_staging_qa_run_reservations_deployment_id_check
    check (deployment_id ~ '^dpl_[A-Za-z0-9]{16,64}$'),
  constraint seb_staging_qa_run_reservations_proof_check
    check (reservation_proof_sha256 ~ '^[0-9a-f]{64}$'),
  constraint seb_staging_qa_run_reservations_state_check
    check (state in ('reserved', 'cleaned')),
  constraint seb_staging_qa_run_reservations_cleanup_state_check
    check (
      (state = 'reserved' and cleaned_at is null)
      or (state = 'cleaned' and cleaned_at is not null and cleaned_at >= reserved_at)
    )
);

comment on table public.seb_staging_qa_run_reservations is
  'Service-role-only, non-deletable S5 QA run reservations. Cleaned rows remain as tombstones so run ids cannot be reused.';
comment on column public.seb_staging_qa_run_reservations.reservation_proof_sha256 is
  'Hash of a closure-private per-adapter nonce, used only to resolve ambiguous writes without accepting a pre-existing run.';

create function public.guard_seb_staging_qa_run_reservation_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.run_id is distinct from old.run_id
    or new.qa_namespace is distinct from old.qa_namespace
    or new.source_sha is distinct from old.source_sha
    or new.deployment_id is distinct from old.deployment_id
    or new.reservation_proof_sha256 is distinct from old.reservation_proof_sha256
    or new.reserved_at is distinct from old.reserved_at then
    raise exception 'SEB QA run reservation identity is immutable';
  end if;

  if new is not distinct from old then
    return new;
  end if;

  if old.state <> 'reserved'
    or new.state <> 'cleaned'
    or old.cleaned_at is not null
    or new.cleaned_at is not null then
    raise exception 'SEB QA run reservation transition is invalid';
  end if;

  new.cleaned_at := clock_timestamp();
  return new;
end;
$$;

create trigger guard_seb_staging_qa_run_reservation_update
before update on public.seb_staging_qa_run_reservations
for each row
execute function public.guard_seb_staging_qa_run_reservation_update();

alter table public.seb_staging_qa_run_reservations enable row level security;
alter table public.seb_staging_qa_run_reservations force row level security;

revoke all on table public.seb_staging_qa_run_reservations
  from public, anon, authenticated, service_role;
grant select on table public.seb_staging_qa_run_reservations to service_role;
grant insert (run_id, qa_namespace, source_sha, deployment_id, reservation_proof_sha256)
  on table public.seb_staging_qa_run_reservations to service_role;
grant update (state) on table public.seb_staging_qa_run_reservations to service_role;

revoke all on function public.guard_seb_staging_qa_run_reservation_update()
  from public, anon, authenticated;
