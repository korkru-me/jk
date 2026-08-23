-- Team org support: add type + invite_code to organizations, and an invite-code generator.
-- Personal (auto-created) orgs keep type/invite_code NULL — only "team" orgs created/joined
-- explicitly by a teacher get these set.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS type text CHECK (type IN ('school', 'team')),
  ADD COLUMN IF NOT EXISTS invite_code text UNIQUE;

CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text;
  code_exists boolean;
BEGIN
  LOOP
    code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    SELECT EXISTS(
      SELECT 1 FROM public.organizations WHERE invite_code = code
    ) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN code;
END;
$$;
;
