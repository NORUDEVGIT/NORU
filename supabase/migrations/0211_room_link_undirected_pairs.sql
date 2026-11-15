-- Room links are undirected.
--
-- A row in hotel_room_links describes one physical relationship between two
-- rooms and is read in both directions. 0064 only made
-- (room_id, other_room_id, kind) unique, so the reverse row, or the same pair
-- stored as both connecting and adjacent, could still be inserted. A connecting
-- pair is also adjacent, so a pair carries exactly one kind.
--
-- This adds one unique index on the property and the room pair ordered
-- smaller / larger room id. Self-links stay refused by
-- hotel_room_links_distinct_check.
--
-- Existing rows are not rewritten. If a pair is already stored more than once
-- the migration stops, so staff can remove the extra row from Room
-- Configuration first.
--
-- Dual-lane: drizzle/migrations and supabase/migrations copies must match.
-- IN THE PR ONLY — do not apply from an agent.

DO $$
DECLARE
  duplicate_pairs integer;
BEGIN
  SELECT count(*) INTO duplicate_pairs
  FROM (
    SELECT 1
    FROM public.hotel_room_links
    GROUP BY restaurant_id, LEAST(room_id, other_room_id), GREATEST(room_id, other_room_id)
    HAVING count(*) > 1
  ) duplicates;
  IF duplicate_pairs > 0 THEN
    RAISE EXCEPTION
      'hotel_room_links has % room pair(s) stored more than once; remove the extra rows before applying 0211',
      duplicate_pairs;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS hotel_room_links_undirected_pair_unique
  ON public.hotel_room_links (
    restaurant_id,
    LEAST(room_id, other_room_id),
    GREATEST(room_id, other_room_id)
  );

COMMENT ON TABLE public.hotel_room_links IS
  'Physical room relationships (connecting or adjacent). One row per undirected room pair, read in both directions. Same-restaurant FKs only.';
