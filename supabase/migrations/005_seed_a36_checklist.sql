-- 005_seed_a36_checklist.sql — global pre-purchase checklist for the Beech A36 Bonanza.
--
-- PreBuy-authored content. Organized after the standard prepurchase survey structure
-- (records → engine → prop → gear → structure → systems → flight) and informed by the
-- ABS (American Bonanza Society) survey checklist used as reference — NOT copied; the
-- ABS document is copyrighted and is not stored in this repo. Wording is original.
--
-- risk_weight (0..100) drives the guided "inspect highest-dollar-risk first" order
-- (see lib/risk.js). Higher = a discrepancy here is the most likely deal-killer /
-- biggest repair bill, so it surfaces first. est_cost_* are rough ballparks for the
-- *repair if discrepant*, to help the buyer's negotiation — not the inspection cost.
--
-- Idempotent: fixed template id; re-running replaces the items.

-- A36-specific global template (is_global → org_id null).
insert into public.checklist_templates (id, is_global, vertical, asset_type, make, model, name, version)
values ('00000000-0000-4000-a000-0000000a3600', true, 'aviation', 'piston-single',
        'Beech', 'A36', 'Beech A36 Bonanza — Pre-Purchase Survey', 1)
on conflict (id) do update
  set name = excluded.name, vertical = excluded.vertical, asset_type = excluded.asset_type,
      make = excluded.make, model = excluded.model, version = excluded.version;

-- Replace items on re-seed.
delete from public.template_items where template_id = '00000000-0000-4000-a000-0000000a3600';

insert into public.template_items
  (template_id, category, title, description, sort_order, risk_weight, ata_chapter, est_cost_low, est_cost_high)
values
-- ── Records & history (the logbook audit) ───────────────────────────────────
('00000000-0000-4000-a000-0000000a3600','Records','Logbook completeness since manufacture',
 'Confirm airframe, engine and propeller logs are present and continuous since new. Gaps reduce value and can hide damage or time. Reconcile total airframe time to advertised and to tach/Hobbs.',
 10, 78, '05', null, null),
('00000000-0000-4000-a000-0000000a3600','Records','AD compliance crosscheck',
 'Pull the applicable Airworthiness Directive list and crosscheck airframe, engine and prop logs for compliance. Identify recurring vs. terminating actions and any open/overdue ADs.',
 20, 86, '05', 500, 8000),
('00000000-0000-4000-a000-0000000a3600','Records','Damage history & Form 337 review',
 'Review logs and 337s for major repairs/alterations. Verify documented, properly signed repairs. Undisclosed damage is a major value and airworthiness risk.',
 30, 85, '05', null, null),
('00000000-0000-4000-a000-0000000a3600','Records','Prop-strike → engine teardown crosscheck',
 'Crosscheck any indication of a prop strike against engine logs for a teardown/crankshaft inspection, and against airframe logs for a gear-up/collapse and proper repair. A missed teardown is a catastrophic-cost risk.',
 40, 88, '61', 25000, 60000),
('00000000-0000-4000-a000-0000000a3600','Records','Annual & IFR certification currency',
 'Confirm latest annual sign-off, 24-month static system and transponder checks, ELT battery date, and 30-day VOR check. Lapsed certs are cheap but gate dispatch.',
 50, 55, '05', null, null),
('00000000-0000-4000-a000-0000000a3600','Records','Title search & NTSB history',
 'Run an FAA title/lien search and check NTSB accident records. Liens or an undisclosed accident materially affect the deal.',
 60, 70, '05', null, null),
-- ── Engine ──────────────────────────────────────────────────────────────────
('00000000-0000-4000-a000-0000000a3600','Engine','Cylinder compression & borescope',
 'Differential compression on all cylinders and borescope of bores, valves and pistons. Low/uneven compressions or valve/bore distress signal a top-overhaul or worse.',
 70, 90, '85', 4000, 30000),
('00000000-0000-4000-a000-0000000a3600','Engine','Crankcase cracks',
 'Inspect top of case and cylinder base bolt areas for cracks; look for unexplained leaks on lower/rear case that can indicate a crankcase crack. Case repair/replacement is a major cost.',
 80, 92, '85', 6000, 40000),
('00000000-0000-4000-a000-0000000a3600','Engine','Time since major/top overhaul',
 'Compare engine hours and calendar years since major (and top, if applicable) to advertised and to tach/Hobbs. Factor TBO and run-out risk into value.',
 90, 80, '85', null, null),
('00000000-0000-4000-a000-0000000a3600','Engine','Oil analysis & filter screen',
 'Review oil-analysis frequency, results and trends; cut open the filter / inspect screens for metal. Rising wear metals or visible metal indicate internal distress.',
 100, 75, '85', null, null),
('00000000-0000-4000-a000-0000000a3600','Engine','Cylinder leaks & cracks (injector/plug areas)',
 'Inspect cylinders for leaks or cracks, especially around injector nozzles and spark-plug holes. Cracks condemn a cylinder.',
 110, 70, '85', 1200, 6000),
('00000000-0000-4000-a000-0000000a3600','Engine','Exhaust system integrity (CO risk)',
 'Inspect exhaust for cracks, leaks, dents, and secure mounting; muffler condition and flame cones. Exhaust leaks are a carbon-monoxide and fire hazard.',
 120, 74, '78', 800, 5000),
-- ── Structure (highest-dollar airframe) ─────────────────────────────────────
('00000000-0000-4000-a000-0000000a3600','Structure','Wing attach "bathtub" fitting corrosion',
 'Inspect the wing attach bathtub fittings and bolts for corrosion, standing water (or evidence of it), paint stripper, and proper covers/drains. Corroded wing-attach structure is among the most expensive findings.',
 130, 95, '57', 5000, 50000),
('00000000-0000-4000-a000-0000000a3600','Structure','Wing skin / spar corrosion (paint blistering)',
 'Sight along wing top and bottom for dents, wrinkles or paint blistering that can indicate skin/spar/internal corrosion. Look for ground-down rivets suggesting prior repair.',
 140, 88, '57', 3000, 40000),
('00000000-0000-4000-a000-0000000a3600','Structure','Serial-number crosscheck (fuselage/ailerons/flaps)',
 'Crosscheck serial numbers across fuselage, ailerons, flaps and logbooks. Differing numbers can indicate replacement after prior damage.',
 150, 65, '57', null, null),
('00000000-0000-4000-a000-0000000a3600','Structure','Tail surfaces: corrosion, security, balance',
 'Inspect ruddervators/fixed surfaces for corrosion, cracks, wrinkles; check security, hinges, rod-end play, and evidence controls were re-balanced after paint. Check tail tie-down area for overstress.',
 160, 72, '55', 1500, 15000),
('00000000-0000-4000-a000-0000000a3600','Structure','Fuel leaks & bladder condition',
 'Check top and bottom of wings for fuel stains/leaks and proper vents. Bladder replacement is costly and common on older airframes.',
 170, 66, '28', 1500, 12000),
-- ── Landing gear ────────────────────────────────────────────────────────────
('00000000-0000-4000-a000-0000000a3600','Landing gear','Full retraction test & rigging',
 'Conduct a gear retraction test; check rigging tolerances, down-locks/tensions, gearbox free play, uplock clearance, transit time, and bent extension arms. Rigging/actuation faults are safety- and cost-critical.',
 180, 82, '32', 1500, 12000),
('00000000-0000-4000-a000-0000000a3600','Landing gear','Strut corrosion & chrome pitting',
 'Inspect nose and main strut pistons for rust, pitting or worn chrome, and for leaks. Pitted chrome leads to seal/strut overhaul.',
 190, 70, '32', 1200, 8000),
('00000000-0000-4000-a000-0000000a3600','Landing gear','Brakes, tires & hoses',
 'Check brake disc grooving and pad wear; tires for cupping, cracking, wear or flat spots; hoses for stiffness/kinks/leaks. Mostly routine but adds up.',
 200, 45, '32', 400, 3000),
-- ── Propeller ───────────────────────────────────────────────────────────────
('00000000-0000-4000-a000-0000000a3600','Propeller','Blade condition & overhaul currency',
 'Inspect blades for security, cracks, nicks and damage; verify overhaul/re-lube within the last six years (or per AD/SB). Damaged blades or overdue overhaul are notable costs.',
 210, 68, '61', 2000, 9000),
('00000000-0000-4000-a000-0000000a3600','Propeller','Spinner & bulkhead cracks',
 'Inspect spinner and bulkhead/backplate for cracks and damage. Cracks can liberate the spinner and indicate prop issues.',
 220, 42, '61', 300, 2500),
-- ── Systems & cabin ─────────────────────────────────────────────────────────
('00000000-0000-4000-a000-0000000a3600','Systems','Seats, belts & emergency exits',
 'Verify proper installation/operation of seats and adjustment mechanisms, seat belts/harnesses, and emergency exits. Safety-critical even if low-dollar.',
 230, 50, '25', 200, 3000),
('00000000-0000-4000-a000-0000000a3600','Systems','Fuel selector operation & stops',
 'Confirm the fuel selector moves easily between all positions including OFF, with working safety stops. Selector faults are a safety risk.',
 240, 58, '28', 500, 4000),
('00000000-0000-4000-a000-0000000a3600','Systems','Autopilot & avionics functional check',
 'Functionally check the autopilot and all disconnects, plus avionics/instruments against IFR tolerances. Avionics repairs/upgrades can be significant but are rarely deal-killers.',
 250, 45, '34', 1000, 20000),
('00000000-0000-4000-a000-0000000a3600','Systems','Windows & windshield condition',
 'Check for crazing, cracking or bluish discoloration of windows/windshield, and molding condition. Mostly cosmetic/comfort with moderate replacement cost.',
 260, 28, '56', 500, 4000),
('00000000-0000-4000-a000-0000000a3600','Cowl & cosmetics','Cowl flaps & cowling fit',
 'Check cowl flap fit/operation (binding can indicate nose-gear interference), and cowling/cowl-door fit, latches and damage.',
 270, 40, '71', 300, 3000),
('00000000-0000-4000-a000-0000000a3600','Cowl & cosmetics','Paint & interior condition',
 'Assess paint and interior cosmetic condition. Primarily a value/marketability factor, not airworthiness.',
 280, 15, '11', 500, 15000),
-- ── Flight ──────────────────────────────────────────────────────────────────
('00000000-0000-4000-a000-0000000a3600','Flight','Engine performance in flight',
 'Confirm expected manifold pressure and rpm at full throttle, fuel flow at/above redline at takeoff, and true airspeed vs. POH. Shortfalls indicate engine/induction problems.',
 290, 64, '71', null, null),
('00000000-0000-4000-a000-0000000a3600','Flight','In-flight gear cycle & systems',
 'Cycle the gear in flight; verify transit time and indications, autopilot modes/coupling, and a full instrument/avionics flow check. Validates systems under load.',
 300, 60, '32', null, null);
