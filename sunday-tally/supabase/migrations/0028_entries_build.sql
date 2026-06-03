-- 0028: Entries (#36) build — service↔ministry composition, location dimension,
-- per-user default location, metric cadence. Fully additive. (D-073/078/085/087/088)

-- 1. service_template_tags — many-to-many service template ↔ ministry tag (D-073)
create table if not exists public.service_template_tags (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  service_template_id uuid not null references public.service_templates(id) on delete cascade,
  ministry_tag_id uuid not null references public.service_tags(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (service_template_id, ministry_tag_id)
);
create index if not exists idx_stt_template on public.service_template_tags(service_template_id);
create index if not exists idx_stt_tag on public.service_template_tags(ministry_tag_id);
create index if not exists idx_stt_church on public.service_template_tags(church_id);

alter table public.service_template_tags enable row level security;
drop policy if exists service_template_tags_church_isolation on public.service_template_tags;
create policy service_template_tags_church_isolation on public.service_template_tags
  for all
  using (church_id in (select get_user_church_ids()))
  with check (church_id in (select get_user_church_ids()));

-- backfill: derive true composition from actual entries (which ministries have data per template),
-- ordered by tag_role. Falls back to primary_tag for templates with no entries yet.
insert into public.service_template_tags (church_id, service_template_id, ministry_tag_id, sort_order)
select distinct si.church_id, si.service_template_id, m.ministry_tag_id,
  case st.tag_role when 'ADULT_SERVICE' then 0 when 'KIDS_MINISTRY' then 1
                   when 'YOUTH_MINISTRY' then 2 else 3 end
from public.metric_entries me
join public.service_instances si on si.id = me.service_instance_id
join public.metrics m on m.id = me.metric_id
join public.service_tags st on st.id = m.ministry_tag_id
on conflict (service_template_id, ministry_tag_id) do nothing;

insert into public.service_template_tags (church_id, service_template_id, ministry_tag_id, sort_order)
select t.church_id, t.id, t.primary_tag_id, 0
from public.service_templates t
where t.primary_tag_id is not null
on conflict (service_template_id, ministry_tag_id) do nothing;

-- 2. metric_entries.location_id — per-campus differentiation (D-087)
alter table public.metric_entries add column if not exists location_id uuid references public.church_locations(id);
create index if not exists idx_me_location on public.metric_entries(location_id);

-- extend denorm trigger fn to also set location_id from the occurrence for instance entries
create or replace function public.set_metric_entry_reporting_tag_code()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  select rt.code into new.reporting_tag_code
  from metrics m join reporting_tags rt on rt.id = m.reporting_tag_id
  where m.id = new.metric_id;
  if new.service_instance_id is not null and new.location_id is null then
    select si.location_id into new.location_id
    from service_instances si where si.id = new.service_instance_id;
  end if;
  return new;
end;
$function$;

-- backfill location_id for existing instance-scoped entries
update public.metric_entries me
set location_id = si.location_id
from public.service_instances si
where me.service_instance_id = si.id and me.location_id is null;

-- 3. church_memberships.default_location_id — per-user default campus (D-088)
alter table public.church_memberships add column if not exists default_location_id uuid references public.church_locations(id);

-- 4. metrics.cadence — period granularity (D-085 MVP: day/week/month; null for instance)
alter table public.metrics add column if not exists cadence text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'metrics_cadence_check') then
    alter table public.metrics add constraint metrics_cadence_check
      check (cadence is null or cadence in ('day','week','month'));
  end if;
end $$;
update public.metrics set cadence = 'week' where scope = 'period' and cadence is null;
