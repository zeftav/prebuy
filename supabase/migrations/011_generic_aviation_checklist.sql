-- 011_generic_aviation_checklist.sql — a model-agnostic pre-purchase checklist for
-- any piston/GA aircraft, used as a FALLBACK when no model-specific template
-- matches (see lib/checklist.js findTemplateFor: model-specific first, else the
-- generic template for the vertical).
--
-- PreBuy-authored, original wording. Items are deliberately make/model-neutral
-- (records → engine → prop → structure → gear → systems → flight). A shop can
-- clone + customize per job, and a model-specific template (e.g. the A36) still
-- takes precedence when one exists.
--
-- The generic template is identified by vertical + model IS NULL (one per vertical).
-- risk_weight (0..100) drives the "inspect highest-dollar-risk first" order.
--
-- Idempotent: fixed template id; re-running replaces the items.

-- A generic template has no make/model, but the original schema (001) made both
-- NOT NULL. Relax them so model-agnostic templates can exist (and so the
-- `model IS NULL` generic-match in lib/checklist.js works). Safe/idempotent.
alter table public.checklist_templates alter column make drop not null;
alter table public.checklist_templates alter column model drop not null;

insert into public.checklist_templates (id, is_global, vertical, asset_type, make, model, name, version)
values ('00000000-0000-4000-a000-00000000a000', true, 'aviation', null,
        null, null, 'General Aircraft — Pre-Purchase Survey (generic)', 1)
on conflict (id) do update
  set name = excluded.name, vertical = excluded.vertical, asset_type = excluded.asset_type,
      make = excluded.make, model = excluded.model, version = excluded.version;

delete from public.template_items where template_id = '00000000-0000-4000-a000-00000000a000';

insert into public.template_items
  (template_id, category, title, description, sort_order, risk_weight, ata_chapter, est_cost_low, est_cost_high)
values
-- ── Records & history ────────────────────────────────────────────────────────
('00000000-0000-4000-a000-00000000a000','Records','Logbook completeness & continuity',
 'Confirm airframe, engine and propeller logs are present and continuous since new. Gaps reduce value and can hide damage or time. Reconcile total time to advertised and to tach/Hobbs.',
 10, 78, '05', null, null),
('00000000-0000-4000-a000-00000000a000','Records','AD compliance crosscheck',
 'Pull the applicable Airworthiness Directive list for the airframe, engine, prop and appliances and crosscheck the logs. Identify recurring vs. terminating actions and any open/overdue ADs.',
 20, 86, '05', 500, 8000),
('00000000-0000-4000-a000-00000000a000','Records','Damage history & Form 337 review',
 'Review logs and 337s for major repairs/alterations; verify they are documented and properly signed. Undisclosed or improperly repaired damage is a major value and airworthiness risk.',
 30, 85, '05', null, null),
('00000000-0000-4000-a000-00000000a000','Records','Prop-strike → engine teardown crosscheck',
 'Crosscheck any indication of a prop strike against engine logs for a teardown/crankshaft inspection. A missed teardown is a catastrophic-cost risk.',
 40, 88, '61', 20000, 60000),
('00000000-0000-4000-a000-00000000a000','Records','Annual & IFR certification currency',
 'Confirm the latest annual sign-off, 24-month pitot/static (91.411) and transponder (91.413) checks, ELT battery date, and (if IFR) VOR check. Lapsed certs are cheap but gate dispatch.',
 50, 55, '05', null, null),
('00000000-0000-4000-a000-00000000a000','Records','Title search & NTSB history',
 'Run an FAA title/lien search and check NTSB accident records. Liens or an undisclosed accident materially affect the deal.',
 60, 70, '05', null, null),
-- ── Engine ───────────────────────────────────────────────────────────────────
('00000000-0000-4000-a000-00000000a000','Engine','Cylinder compression & borescope',
 'Differential compression on all cylinders and a borescope of bores, valves and pistons. Low/uneven compressions or valve/bore distress signal a top-overhaul or worse.',
 70, 90, '85', 4000, 30000),
('00000000-0000-4000-a000-00000000a000','Engine','Crankcase & case integrity',
 'Inspect the crankcase for cracks and unexplained leaks (especially case seams and cylinder base areas). Case repair/replacement is a major cost.',
 80, 90, '85', 6000, 40000),
('00000000-0000-4000-a000-00000000a000','Engine','Time since major/top overhaul vs TBO',
 'Compare engine hours and calendar years since major (and top, if applicable) to advertised, to tach/Hobbs, and to TBO. Factor run-out risk into value.',
 90, 80, '85', null, null),
('00000000-0000-4000-a000-00000000a000','Engine','Oil analysis & filter/screen',
 'Review oil-analysis history and trends; cut the filter / inspect screens for metal. Rising wear metals or visible metal indicate internal distress.',
 100, 75, '85', null, null),
('00000000-0000-4000-a000-00000000a000','Engine','Exhaust system integrity (CO risk)',
 'Inspect the exhaust for cracks, leaks, dents and secure mounting; check muffler/heat-exchanger condition. Exhaust leaks are a carbon-monoxide and fire hazard.',
 110, 74, '78', 800, 5000),
('00000000-0000-4000-a000-00000000a000','Engine','Mounts, hoses, baffling & accessories',
 'Check engine mount for cracks/corrosion, rubber hoses for age/cracking, induction/baffling condition, and accessory security/leaks (mags, alternator, pumps).',
 120, 58, '71', 500, 6000),
-- ── Propeller ────────────────────────────────────────────────────────────────
('00000000-0000-4000-a000-00000000a000','Propeller','Blade condition & overhaul currency',
 'Inspect blades for security, cracks, nicks and damage; verify governor operation and overhaul currency per AD/SB and calendar. Damaged blades or overdue overhaul are notable costs.',
 130, 68, '61', 2000, 9000),
('00000000-0000-4000-a000-00000000a000','Propeller','Spinner & bulkhead cracks',
 'Inspect spinner and bulkhead/backplate for cracks and damage; check for grease/oil leakage at the hub.',
 140, 42, '61', 300, 2500),
-- ── Structure ────────────────────────────────────────────────────────────────
('00000000-0000-4000-a000-00000000a000','Structure','Corrosion survey (spar, fittings, hidden areas)',
 'Inspect primary structure — spar/carry-through, attach fittings, belly, battery box and any known model trouble spots — for corrosion and standing water. Structural corrosion is among the most expensive findings.',
 150, 92, '57', 3000, 50000),
('00000000-0000-4000-a000-00000000a000','Structure','Skin, rivets & evidence of prior repair',
 'Sight along skins for dents, wrinkles, working rivets or paint blistering that can indicate damage or internal corrosion. Note ground-down rivets or filler suggesting prior repair.',
 160, 80, '57', 2000, 40000),
('00000000-0000-4000-a000-00000000a000','Structure','Control surfaces: security, hinges, balance',
 'Inspect all control surfaces for corrosion, cracks and play; check hinges, rod-ends, stops and evidence of re-balancing after paint.',
 170, 70, '55', 1000, 12000),
('00000000-0000-4000-a000-00000000a000','Structure','Fuel tanks/bladders & leaks',
 'Check wings and belly for fuel stains/leaks; verify vents and caps. Bladder or wet-wing repairs are costly and common on older airframes.',
 180, 64, '28', 1500, 12000),
-- ── Landing gear ─────────────────────────────────────────────────────────────
('00000000-0000-4000-a000-00000000a000','Landing gear','Retraction test & rigging (if retractable)',
 'For retractable gear, perform a retraction test: rigging tolerances, down-locks, transit time, uplocks and free play. Rigging/actuation faults are safety- and cost-critical.',
 190, 80, '32', 1500, 12000),
('00000000-0000-4000-a000-00000000a000','Landing gear','Struts, tires, brakes & hoses',
 'Inspect strut pistons for pitting/corrosion/leaks; tires for wear/cupping/cracking; brakes for disc grooving and pad wear; hoses for stiffness/leaks.',
 200, 50, '32', 400, 3000),
-- ── Systems & cabin ──────────────────────────────────────────────────────────
('00000000-0000-4000-a000-00000000a000','Systems','Fuel system & selector operation',
 'Confirm the fuel selector moves easily between all positions including OFF with working stops; check gascolator, boost pump and placards.',
 210, 58, '28', 500, 4000),
('00000000-0000-4000-a000-00000000a000','Systems','Electrical, lighting & battery',
 'Check the alternator/generator output, battery condition and date, bus/breaker operation, and interior/exterior lighting.',
 220, 48, '24', 300, 4000),
('00000000-0000-4000-a000-00000000a000','Systems','Avionics & autopilot functional check',
 'Functionally check avionics/instruments against IFR tolerances and the autopilot with all disconnects. Upgrades/repairs can be significant but are rarely deal-killers.',
 230, 45, '34', 1000, 20000),
('00000000-0000-4000-a000-00000000a000','Systems','Seats, belts & emergency egress',
 'Verify seats, tracks/stops, belts/harnesses and emergency exits operate and are properly installed. Safety-critical even if low-dollar.',
 240, 50, '25', 200, 3000),
('00000000-0000-4000-a000-00000000a000','Cabin & cosmetics','Windows, windshield, paint & interior',
 'Check windows/windshield for crazing/cracks; assess paint and interior condition. Primarily value/marketability, not airworthiness.',
 250, 22, '56', 500, 15000),
-- ── Flight ───────────────────────────────────────────────────────────────────
('00000000-0000-4000-a000-00000000a000','Flight','Engine performance in flight',
 'Confirm expected manifold pressure/RPM and fuel flow at takeoff, full-throttle static RPM, and cruise performance vs. POH. Shortfalls indicate engine/induction problems.',
 260, 64, '71', null, null),
('00000000-0000-4000-a000-00000000a000','Flight','Systems & handling check in flight',
 'In flight: verify instruments, autopilot modes/coupling, gear cycle (if retractable), and that the aircraft trims and handles normally. Validates systems under load.',
 270, 58, '00', null, null);
