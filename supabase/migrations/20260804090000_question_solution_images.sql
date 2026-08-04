-- Teachers can now attach reference images to a question's solution/explanation
-- (solution_text), the same way image_urls already works for the question body
-- itself. Constant default '{}' is a metadata-only change, no table rewrite.
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS solution_image_urls text[] NOT NULL DEFAULT '{}';
