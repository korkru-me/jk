-- How many questions the online exam page shows at a time. 1 is the layout
-- that existed before this column — one question per screen with ถัดไป /
-- ก่อนหน้า between them — so every assignment already handed out keeps it.
-- A higher number groups that many questions onto one page; the navigation
-- then moves a page at a time. Bounded rather than free-form: a page of more
-- than 50 questions is a scroll, not a page.
ALTER TABLE public.assignments
  ADD COLUMN questions_per_page integer NOT NULL DEFAULT 1
    CHECK (questions_per_page BETWEEN 1 AND 50);
