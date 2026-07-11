-- Allow authenticated users to add new formulas to the shared formula preset
-- library (formula_presets has no org_id/created_by — it's a global, shared list).

DROP POLICY IF EXISTS "formula_presets_insert_authenticated" ON public.formula_presets;
CREATE POLICY "formula_presets_insert_authenticated" ON public.formula_presets
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
