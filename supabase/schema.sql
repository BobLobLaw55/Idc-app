-- idc. Phase 2 schema (Supabase / PostgreSQL + PostGIS)
-- STATUS: DRAFT — NOT DEPLOYED, NOT TESTED AGAINST A LIVE PROJECT.
-- Phase 1 runs entirely in the browser (localStorage). This file is the planned backend so that
-- two separate phones can share a session with privacy enforced by the database, not the UI.
--
-- Rules enforced here (not just hidden in the UI):
--   * A participant can read only their OWN swipes until the reveal stage.
--   * Restaurant candidates are readable only once every participant is ready.
--   * Elimination votes are readable only after both participants have voted.
--   * Partner-aware card influence goes through a SECURITY DEFINER function that returns
--     aggregated food weights, never the partner's raw answers.
-- Never ship the service-role key to GitHub Pages; the browser uses the anon key + RLS only.

create extension if not exists postgis;

-- ───────────── People
create table users (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (length(display_name) between 1 and 40),
  home_area text,
  home_point geography(point),
  default_radius_mi int not null default 25 check (default_radius_mi between 1 and 100),
  default_budget int check (default_budget is null or default_budget between 5 and 500),
  diet text not null default 'none' check (diet in ('none', 'vegetarian', 'vegan')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_allergies (               -- kept separate from dislikes on purpose
  user_id uuid references users on delete cascade,
  allergen text not null,
  primary key (user_id, allergen)
);

create table partner_groups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table partner_group_members (
  group_id uuid references partner_groups on delete cascade,
  user_id uuid references users on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create unique index one_group_per_user on partner_group_members (user_id);

-- ───────────── Food taxonomy + preferences
create table food_categories (
  id text primary key,                       -- e.g. 'steak', 'burger'
  name text not null,
  cuisine_group text not null,
  vibe_tags text[] not null default '{}',
  allergens text[] not null default '{}',
  vegetarian_possible boolean not null default false,
  photo_url text,
  photo_license text
);

create type pref_level as enum ('love', 'like', 'neutral', 'dislike', 'never');

create table user_food_preferences (
  user_id uuid references users on delete cascade,
  food_id text references food_categories,
  level pref_level not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, food_id)
);

create table food_impression_history (
  id bigserial primary key,
  user_id uuid references users on delete cascade,
  session_id uuid,
  food_id text references food_categories,
  answer text check (answer in ('no', 'maybe', 'yes', 'really')),
  shown_at timestamptz not null default now()
);
create index on food_impression_history (user_id, shown_at desc);

-- ───────────── Restaurants (licensed/verified data only)
create table restaurant_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,                        -- e.g. 'Foursquare OS Places', 'Owner submission'
  license text not null,
  attribution text,
  url text
);

create table restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text, city text, state text, zip text,
  location geography(point) not null,
  phone text, website text, menu_url text, reservation_url text,
  primary_cuisine text, secondary_cuisine text,
  price_per_person int,
  atmosphere text[] not null default '{}',   -- romantic, upscale, casual
  dine_in boolean, pickup boolean, delivery boolean,  -- null = unknown (never treated as yes)
  status text not null default 'active' check (status in ('active', 'closed', 'temporarily_closed')),
  menu_verified_on date,
  source_id uuid references restaurant_sources,
  created_at timestamptz not null default now()
);
create index on restaurants using gist (location);

create table restaurant_hours (
  restaurant_id uuid references restaurants on delete cascade,
  weekday smallint check (weekday between 0 and 6),
  opens time not null,
  closes time not null,                      -- closes < opens means after midnight
  primary key (restaurant_id, weekday, opens)
);

create type verification_level as enum ('dish', 'category', 'unverified');

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants on delete cascade,
  name text,                                 -- null for category-level evidence
  description text,
  price numeric(8, 2),
  serving text,
  available boolean not null default true,
  vegetarian boolean,
  verification verification_level not null,
  source_ref text,
  verified_on date
);

create table menu_item_categories (
  menu_item_id uuid references menu_items on delete cascade,
  food_id text references food_categories,
  primary key (menu_item_id, food_id)
);
create index on menu_item_categories (food_id);

-- ───────────── Exclusions
create table user_restaurant_exclusions (
  user_id uuid references users on delete cascade,
  restaurant_id uuid references restaurants,
  created_at timestamptz not null default now(),
  primary key (user_id, restaurant_id)
);

create table user_favorite_restaurants (
  user_id uuid references users on delete cascade,
  restaurant_id uuid references restaurants,
  primary key (user_id, restaurant_id)
);

create table group_restaurant_exclusions (     -- active only when every member approved
  group_id uuid references partner_groups on delete cascade,
  restaurant_id uuid references restaurants,
  proposed_by uuid references users,
  created_at timestamptz not null default now(),
  primary key (group_id, restaurant_id)
);
create table group_exclusion_approvals (
  group_id uuid, restaurant_id uuid, user_id uuid references users on delete cascade,
  approved_at timestamptz not null default now(),
  primary key (group_id, restaurant_id, user_id),
  foreign key (group_id, restaurant_id) references group_restaurant_exclusions on delete cascade
);

-- ───────────── Sessions
create table dining_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references partner_groups on delete cascade,
  started_by uuid references users,
  method text not null check (method in ('dinein', 'pickup', 'delivery', 'either')),
  budget int,
  meal_time timestamptz,
  radius_mi int not null,
  search_point geography(point) not null,
  delivery_point geography(point),
  seed bigint not null,
  stage text not null default 'choosing' check (stage in ('choosing', 'final_three', 'decided', 'closed')),
  created_at timestamptz not null default now()
);

create table session_vibes (
  session_id uuid references dining_sessions on delete cascade,
  vibe text not null check (vibe in ('date', 'fancy', 'casual', 'couch', 'grab', 'deliver')),
  primary key (session_id, vibe)
);

create table session_participants (
  session_id uuid references dining_sessions on delete cascade,
  user_id uuid references users,
  status text not null default 'idle' check (status in ('idle', 'swiping', 'ready')),
  mode text check (mode in ('swipe', 'skip')),
  ready_at timestamptz,
  primary key (session_id, user_id)
);

create table session_swipes (                   -- PRIVATE per participant
  session_id uuid references dining_sessions on delete cascade,
  user_id uuid references users,
  food_id text references food_categories,
  position int not null,
  answer text check (answer in ('no', 'maybe', 'yes', 'really')),
  answered_at timestamptz,
  primary key (session_id, user_id, food_id)
);

create table session_restaurant_candidates (
  session_id uuid references dining_sessions on delete cascade,
  restaurant_id uuid references restaurants,
  rank int not null,
  is_final_three boolean not null,
  score numeric not null,
  explanation jsonb not null,
  primary key (session_id, restaurant_id)
);

create table session_eliminations (             -- exactly one vote per participant
  session_id uuid references dining_sessions on delete cascade,
  user_id uuid references users,
  restaurant_id uuid references restaurants,
  voted_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table session_decisions (
  session_id uuid primary key references dining_sessions on delete cascade,
  winner_id uuid references restaurants,
  backup_id uuid references restaurants,
  same_vote boolean not null,
  reasons jsonb not null,
  decided_at timestamptz not null default now()
);

create table replacement_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references dining_sessions on delete cascade,
  requested_by uuid references users,
  reason text not null check (reason in ('busy', 'closed', 'changed', 'other')),
  from_restaurant uuid references restaurants,
  to_restaurant uuid references restaurants,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now()
);
create table replacement_approvals (
  request_id uuid references replacement_requests on delete cascade,
  user_id uuid references users,
  approved boolean not null,
  primary key (request_id, user_id)
);

create table restaurant_visit_feedback (
  session_id uuid references dining_sessions on delete cascade,
  user_id uuid references users,
  restaurant_id uuid references restaurants,
  went boolean,
  rating smallint check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- ───────────── Helpers
create function is_member(g uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from partner_group_members where group_id = g and user_id = auth.uid());
$$;

create function in_session(s uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from session_participants where session_id = s and user_id = auth.uid());
$$;

create function all_ready(s uuid) returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from session_participants where session_id = s and status <> 'ready');
$$;

create function all_voted(s uuid) returns boolean language sql stable security definer set search_path = public as $$
  select (select count(*) from session_eliminations where session_id = s)
       = (select count(*) from session_participants where session_id = s);
$$;

-- ───────────── Row-level security
alter table users enable row level security;
alter table user_allergies enable row level security;
alter table user_food_preferences enable row level security;
alter table food_impression_history enable row level security;
alter table user_restaurant_exclusions enable row level security;
alter table user_favorite_restaurants enable row level security;
alter table partner_group_members enable row level security;
alter table group_restaurant_exclusions enable row level security;
alter table group_exclusion_approvals enable row level security;
alter table dining_sessions enable row level security;
alter table session_vibes enable row level security;
alter table session_participants enable row level security;
alter table session_swipes enable row level security;
alter table session_restaurant_candidates enable row level security;
alter table session_eliminations enable row level security;
alter table session_decisions enable row level security;
alter table replacement_requests enable row level security;
alter table replacement_approvals enable row level security;
alter table restaurant_visit_feedback enable row level security;

-- Own profile data only (partners see display names via a view, never preferences).
create policy own_user on users for all using (id = auth.uid()) with check (id = auth.uid());
create policy own_allergies on user_allergies for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_prefs on user_food_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_impressions on food_impression_history for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_excl on user_restaurant_exclusions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_favs on user_favorite_restaurants for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy group_members_read on partner_group_members for select using (is_member(group_id));
create policy group_excl_rw on group_restaurant_exclusions for all using (is_member(group_id)) with check (is_member(group_id));
create policy group_excl_approve on group_exclusion_approvals for all using (is_member(group_id)) with check (user_id = auth.uid() and is_member(group_id));

create policy sessions_rw on dining_sessions for all using (is_member(group_id)) with check (is_member(group_id));
create policy vibes_rw on session_vibes for all using (in_session(session_id)) with check (in_session(session_id));
create policy participants_read on session_participants for select using (in_session(session_id));  -- progress only
create policy participants_self on session_participants for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The core privacy rule: you can only ever read and write your own swipes.
create policy swipes_own on session_swipes for all using (user_id = auth.uid()) with check (user_id = auth.uid() and in_session(session_id));

-- Shortlist hidden until everyone is ready ("Where Are We Going?!").
create policy candidates_after_ready on session_restaurant_candidates for select using (in_session(session_id) and all_ready(session_id));

-- Votes: insert your own once; read everyone's only after all voted.
create policy elim_insert on session_eliminations for insert with check (user_id = auth.uid() and in_session(session_id));
create policy elim_read on session_eliminations for select using (user_id = auth.uid() or (in_session(session_id) and all_voted(session_id)));
-- (no update/delete policy → a submitted vote cannot be changed)

create policy decisions_read on session_decisions for select using (in_session(session_id));
create policy repl_rw on replacement_requests for all using (in_session(session_id)) with check (in_session(session_id));
create policy repl_approve on replacement_approvals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy feedback_own on restaurant_visit_feedback for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Public, read-only reference data
alter table restaurants enable row level security;
alter table menu_items enable row level security;
alter table menu_item_categories enable row level security;
alter table restaurant_hours enable row level security;
alter table food_categories enable row level security;
create policy read_restaurants on restaurants for select using (true);
create policy read_menu on menu_items for select using (true);
create policy read_menu_cat on menu_item_categories for select using (true);
create policy read_hours on restaurant_hours for select using (true);
create policy read_foods on food_categories for select using (true);

-- Partner-aware influence without exposing answers: returns only food ids + weights for the CALLER,
-- derived from restaurants that satisfy the partner's cravings. Raw partner answers never leave the DB.
create function partner_compatible_foods(s uuid)
returns table (food_id text, weight numeric)
language sql stable security definer set search_path = public as $$
  with partner as (
    select user_id from session_participants
    where session_id = s and user_id <> auth.uid() and status = 'ready'
  ),
  cravings as (
    select sw.food_id from session_swipes sw join partner p using (user_id)
    where sw.session_id = s and sw.answer in ('yes', 'really')
  ),
  places as (
    select distinct mi.restaurant_id
    from menu_items mi join menu_item_categories mc on mc.menu_item_id = mi.id
    where mc.food_id in (select food_id from cravings) and mi.verification <> 'unverified'
  )
  select mc.food_id, count(*)::numeric
  from menu_items mi join menu_item_categories mc on mc.menu_item_id = mi.id
  where mi.restaurant_id in (select restaurant_id from places)
    and mi.verification <> 'unverified'
    and in_session(s)
    and not exists (select 1 from user_food_preferences up
                    where up.user_id = auth.uid() and up.food_id = mc.food_id and up.level in ('never', 'dislike'))
  group by mc.food_id;
$$;
