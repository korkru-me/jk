-- Remember which indicator a question measures, on the question itself.
--
-- Naming the indicator for every item is the one part of an IOC form that only
-- a teacher can do, and today it is redone from scratch every term. Storing the
-- answer beside the question means the second form is prefilled from the first,
-- and the same pairing is what a table of specifications will need later.
--
-- Two tables rather than a text column on `questions`:
--
--   * one indicator covers many questions, and its wording is curriculum text
--     that should be typed once per school, not once per question;
--   * a question can measure more than one indicator.
--
-- An IOC form still freezes its own copy in `ioc_form_standards`. These rows
-- are the teacher's working library, and editing them later must not change a
-- document an expert has already signed.

CREATE TABLE public.learning_standards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- 'ค 3.1 ม.6/1'. Free text, because schools also write their own course
  -- outcomes ("ผลการเรียนรู้") that follow no national numbering.
  code        text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  -- Optional, and only ever used to narrow a picker. Both mirror the columns
  -- of the same name on `questions`.
  subject     text,
  grade_level text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_standards_not_blank
    CHECK (btrim(code) <> '' OR btrim(description) <> '')
);

COMMENT ON TABLE public.learning_standards IS
  'A school''s library of learning standards/indicators. Shared inside one organization and reused across IOC forms and future test blueprints.';

-- One code per organization, so a school does not accumulate five spellings of
-- the same indicator. Rows with no code at all are free-form outcomes and are
-- left out of the constraint.
CREATE UNIQUE INDEX idx_learning_standards_org_code
  ON public.learning_standards(org_id, lower(btrim(code)))
  WHERE btrim(code) <> '';
CREATE INDEX idx_learning_standards_org ON public.learning_standards(org_id, created_at DESC);

CREATE TRIGGER learning_standards_updated_at
  BEFORE UPDATE ON public.learning_standards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.question_standards (
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  standard_id uuid NOT NULL REFERENCES public.learning_standards(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, standard_id)
);

COMMENT ON TABLE public.question_standards IS
  'Which indicators a question measures. Written when a teacher fills in an IOC form, and read back to prefill the next one.';

CREATE INDEX idx_question_standards_standard ON public.question_standards(standard_id);
CREATE INDEX idx_question_standards_org ON public.question_standards(org_id);

ALTER TABLE public.learning_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_standards ENABLE ROW LEVEL SECURITY;

-- Everyone in the school reads the library; only the person who added a row
-- rewrites it, so one teacher cannot silently reword another's indicator.
CREATE POLICY learning_standards_select ON public.learning_standards
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR org_id = ANY (public.get_user_org_ids()));

CREATE POLICY learning_standards_insert ON public.learning_standards
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND org_id = ANY (public.get_user_org_ids())
  );

CREATE POLICY learning_standards_update ON public.learning_standards
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (created_by = (SELECT auth.uid()) AND org_id = ANY (public.get_user_org_ids()))
  )
  WITH CHECK (org_id = ANY (public.get_user_org_ids()));

CREATE POLICY learning_standards_delete ON public.learning_standards
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin()
    OR (created_by = (SELECT auth.uid()) AND org_id = ANY (public.get_user_org_ids()))
  );

-- The mapping follows the question: whoever can see the question can see what
-- it measures, and only its creator can change that.
CREATE POLICY question_standards_select ON public.question_standards
  FOR SELECT TO authenticated
  USING (
    public.is_question_creator(question_id)
    OR public.question_shared_with_my_orgs(question_id)
  );

CREATE POLICY question_standards_insert ON public.question_standards
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_question_creator(question_id)
    AND org_id = ANY (public.get_user_org_ids())
  );

CREATE POLICY question_standards_delete ON public.question_standards
  FOR DELETE TO authenticated
  USING (public.is_question_creator(question_id));

REVOKE ALL ON TABLE public.learning_standards FROM anon;
REVOKE ALL ON TABLE public.question_standards FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.learning_standards TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.question_standards TO authenticated;
REVOKE UPDATE ON TABLE public.question_standards FROM authenticated;
