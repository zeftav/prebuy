-- 013_seed_marine_checklist.sql — generic boat-survey checklist (fallback for the
-- "marine" vertical). Generated from supabase/seed/inspection-guidelines.json
-- (synthesized from typical pre-purchase scope + ABYC domains; NOT a verbatim
-- published standard). Regenerate via scripts/seed/gen-checklist-sql.mjs. Idempotent.

-- A generic template has no make/model; relax those NOT NULLs (idempotent — also done in 011).
alter table public.checklist_templates alter column make drop not null;
alter table public.checklist_templates alter column model drop not null;

insert into public.checklist_templates (id, is_global, vertical, asset_type, make, model, name, version)
values ('00000000-0000-4000-c000-000000000002', true, 'marine', null, null, null, 'General Boat — Pre-Purchase Survey (generic)', 1)
on conflict (id) do update
  set name = excluded.name, vertical = excluded.vertical, version = excluded.version;

delete from public.template_items where template_id = '00000000-0000-4000-c000-000000000002';

insert into public.template_items
  (template_id, category, title, description, sort_order, risk_weight)
values
  ('00000000-0000-4000-c000-000000000002', 'Hull & Structure', 'Hull exterior topsides and bottom (sounding for voids/delamination)', null, 10, 90),
  ('00000000-0000-4000-c000-000000000002', 'Hull & Structure', 'Moisture readings on hull and deck (cored areas especially)', null, 20, 90),
  ('00000000-0000-4000-c000-000000000002', 'Hull & Structure', 'Keel, keel-to-hull joint, and ballast attachment', null, 30, 90),
  ('00000000-0000-4000-c000-000000000002', 'Hull & Structure', 'Stringers, bulkheads and internal structural members (accessible)', null, 40, 90),
  ('00000000-0000-4000-c000-000000000002', 'Hull & Structure', 'Blisters, cracks, prior repairs, osmosis (FRP) / corrosion (metal) / rot (wood)', null, 50, 90),
  ('00000000-0000-4000-c000-000000000002', 'Hull & Structure', 'Deck, cabin top and hull-to-deck joint', null, 60, 90),
  ('00000000-0000-4000-c000-000000000002', 'Hull & Structure', 'Transom and swim platform', null, 70, 90),
  ('00000000-0000-4000-c000-000000000002', 'Hull & Structure', 'Structural delamination, significant moisture intrusion, or compromised hull-to-deck joint', 'Defect condition — flag if present.', 80, 90),
  ('00000000-0000-4000-c000-000000000002', 'Deck Hardware & Topsides', 'Cleats, chocks, stanchions, pulpits and rails (backing plates where accessible)', null, 90, 45),
  ('00000000-0000-4000-c000-000000000002', 'Deck Hardware & Topsides', 'Hatches, ports, windows and seals', null, 100, 45),
  ('00000000-0000-4000-c000-000000000002', 'Deck Hardware & Topsides', 'Lifelines, rails and guards', null, 110, 45),
  ('00000000-0000-4000-c000-000000000002', 'Deck Hardware & Topsides', 'Non-skid and deck surface condition', null, 120, 45),
  ('00000000-0000-4000-c000-000000000002', 'Through-Hulls, Seacocks & Running Gear', 'All through-hull fittings and seacocks (operation and bonding)', null, 130, 92),
  ('00000000-0000-4000-c000-000000000002', 'Through-Hulls, Seacocks & Running Gear', 'Hose clamps, hoses and double-clamping below waterline', null, 140, 92),
  ('00000000-0000-4000-c000-000000000002', 'Through-Hulls, Seacocks & Running Gear', 'Shaft, strut, cutless bearing and shaft seal', null, 150, 92),
  ('00000000-0000-4000-c000-000000000002', 'Through-Hulls, Seacocks & Running Gear', 'Propeller(s) and rudder(s)', null, 160, 92),
  ('00000000-0000-4000-c000-000000000002', 'Through-Hulls, Seacocks & Running Gear', 'Sacrificial anodes (zincs) condition', null, 170, 92),
  ('00000000-0000-4000-c000-000000000002', 'Through-Hulls, Seacocks & Running Gear', 'Seized/corroded seacocks, single-clamped below-waterline hoses, or excessive shaft/bearing play', 'Defect condition — flag if present.', 180, 92),
  ('00000000-0000-4000-c000-000000000002', 'Propulsion & Machinery', 'Engine(s) external condition, mounts and alignment', null, 190, 82),
  ('00000000-0000-4000-c000-000000000002', 'Propulsion & Machinery', 'Belts, hoses, exhaust system and risers', null, 200, 82),
  ('00000000-0000-4000-c000-000000000002', 'Propulsion & Machinery', 'Transmission/gearcase and controls', null, 210, 82),
  ('00000000-0000-4000-c000-000000000002', 'Propulsion & Machinery', 'Cooling system (raw-water and closed-loop)', null, 220, 82),
  ('00000000-0000-4000-c000-000000000002', 'Propulsion & Machinery', 'Operation under load during sea trial (smoke, temp, RPM, vibration)', null, 230, 82),
  ('00000000-0000-4000-c000-000000000002', 'Fuel System', 'Tanks, mounting and labeling', null, 240, 80),
  ('00000000-0000-4000-c000-000000000002', 'Fuel System', 'Fuel lines, fittings, filters and shut-offs', null, 250, 80),
  ('00000000-0000-4000-c000-000000000002', 'Fuel System', 'Fill, vent and anti-siphon arrangements', null, 260, 80),
  ('00000000-0000-4000-c000-000000000002', 'Fuel System', 'Conformance with ABYC / NFPA fuel-system standards', null, 270, 80),
  ('00000000-0000-4000-c000-000000000002', 'Fuel System', 'Fuel leaks, non-compliant lines/fittings, or improper tank installation', 'Defect condition — flag if present.', 280, 80),
  ('00000000-0000-4000-c000-000000000002', 'Electrical (AC & DC)', 'DC system: batteries, switches, fusing/breakers, wiring condition', null, 290, 78),
  ('00000000-0000-4000-c000-000000000002', 'Electrical (AC & DC)', 'AC system: shore power inlet, panel, GFCI/ELCI protection, polarity', null, 300, 78),
  ('00000000-0000-4000-c000-000000000002', 'Electrical (AC & DC)', 'Wiring runs, support, chafe protection and connections', null, 310, 78),
  ('00000000-0000-4000-c000-000000000002', 'Electrical (AC & DC)', 'Bonding and galvanic/cathodic protection system', null, 320, 78),
  ('00000000-0000-4000-c000-000000000002', 'Electrical (AC & DC)', 'Conformance with ABYC electrical standards (E-11 etc.)', null, 330, 78),
  ('00000000-0000-4000-c000-000000000002', 'Electrical (AC & DC)', 'Improper/undersized wiring, missing overcurrent protection, AC reverse polarity, or unsafe shore-power connection', 'Defect condition — flag if present.', 340, 78),
  ('00000000-0000-4000-c000-000000000002', 'Plumbing & Tankage', 'Fresh water system, tanks, pumps and fixtures', null, 350, 64),
  ('00000000-0000-4000-c000-000000000002', 'Plumbing & Tankage', 'Bilge pumps (manual and automatic) and high-water alarms', null, 360, 64),
  ('00000000-0000-4000-c000-000000000002', 'Plumbing & Tankage', 'Marine sanitation device (MSD), holding tank and overboard valves', null, 370, 64),
  ('00000000-0000-4000-c000-000000000002', 'Plumbing & Tankage', 'Hoses, clamps and anti-siphon loops', null, 380, 64),
  ('00000000-0000-4000-c000-000000000002', 'Steering & Controls', 'Steering system (hydraulic/mechanical/cable) and play', null, 390, 72),
  ('00000000-0000-4000-c000-000000000002', 'Steering & Controls', 'Rudder bearings, stuffing box and linkages', null, 400, 72),
  ('00000000-0000-4000-c000-000000000002', 'Steering & Controls', 'Engine/throttle/shift controls', null, 410, 72),
  ('00000000-0000-4000-c000-000000000002', 'Steering & Controls', 'Autopilot, if fitted', null, 420, 72),
  ('00000000-0000-4000-c000-000000000002', 'Ground Tackle & Mooring', 'Anchor(s), rode, chain and connections', null, 430, 48),
  ('00000000-0000-4000-c000-000000000002', 'Ground Tackle & Mooring', 'Windlass operation', null, 440, 48),
  ('00000000-0000-4000-c000-000000000002', 'Ground Tackle & Mooring', 'Dock lines and fenders', null, 450, 48),
  ('00000000-0000-4000-c000-000000000002', 'Safety Equipment (USCG / NFPA)', 'PFDs (count, type, condition)', null, 460, 70),
  ('00000000-0000-4000-c000-000000000002', 'Safety Equipment (USCG / NFPA)', 'Fire extinguishers / fixed suppression (charge, mounting, certification)', null, 470, 70),
  ('00000000-0000-4000-c000-000000000002', 'Safety Equipment (USCG / NFPA)', 'Flares and visual distress signals (in date)', null, 480, 70),
  ('00000000-0000-4000-c000-000000000002', 'Safety Equipment (USCG / NFPA)', 'Navigation lights and sound-signaling device', null, 490, 70),
  ('00000000-0000-4000-c000-000000000002', 'Safety Equipment (USCG / NFPA)', 'Required placards (oil, garbage, MSD), registration and HIN', null, 500, 70),
  ('00000000-0000-4000-c000-000000000002', 'Safety Equipment (USCG / NFPA)', 'CO detectors and propane/LPG system safety (if fitted)', null, 510, 70),
  ('00000000-0000-4000-c000-000000000002', 'Safety Equipment (USCG / NFPA)', 'EPIRB / liferaft, where applicable', null, 520, 70),
  ('00000000-0000-4000-c000-000000000002', 'Safety Equipment (USCG / NFPA)', 'Missing/expired required safety equipment or non-compliance with USCG carriage requirements', 'Defect condition — flag if present.', 530, 70),
  ('00000000-0000-4000-c000-000000000002', 'Navigation & Electronics', 'GPS/chartplotter, radar, depth sounder, VHF (operability)', null, 540, 40),
  ('00000000-0000-4000-c000-000000000002', 'Navigation & Electronics', 'Compass and instrumentation', null, 550, 40),
  ('00000000-0000-4000-c000-000000000002', 'Navigation & Electronics', 'Antennas and mounting', null, 560, 40);
