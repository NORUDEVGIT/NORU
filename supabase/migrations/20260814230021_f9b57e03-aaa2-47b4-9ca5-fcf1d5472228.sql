DO $$
DECLARE
  rid uuid;
  uid uuid;
  now_approved boolean;
  garden uuid := '2610521b-53b9-4f75-83c9-741ac84254d0';
  member boolean;
BEGIN
  SELECT r.id, ru.user_id INTO rid, uid
  FROM restaurants r JOIN restaurant_users ru ON ru.restaurant_id = r.id
  WHERE r.slug = 'test-bistro' LIMIT 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);

  -- Attempt self-approval as the owner (protected by trigger).
  UPDATE restaurants SET approved = true, active = false, slug = 'hacked' WHERE id = rid;
  SELECT approved INTO now_approved FROM restaurants WHERE id = rid;
  IF now_approved THEN
    RAISE EXCEPTION 'SECURITY FAIL: owner was able to self-approve';
  END IF;

  -- Cross-restaurant membership check.
  member := public.is_restaurant_member(garden);
  IF member THEN
    RAISE EXCEPTION 'SECURITY FAIL: Test Bistro owner is a member of The Garden';
  END IF;

  -- Attempt account_type escalation as the owner (protected by trigger).
  UPDATE profiles SET account_type = 'platform_admin' WHERE id = uid;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = uid AND account_type = 'platform_admin') THEN
    RAISE EXCEPTION 'SECURITY FAIL: owner escalated to platform_admin';
  END IF;

  RAISE NOTICE 'All protections held';
END $$;