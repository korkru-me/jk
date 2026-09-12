-- Teaches the education-research max-score function about "ตารางจำแนก".
--
-- Separate from the migration that added the enum label because Postgres will
-- not let a value added by ALTER TYPE ... ADD VALUE be used in the same
-- transaction that added it, and the CLI runs one transaction per file.
--
-- Without this branch a classify question falls through to the trailing
-- answer_parts path and reports a max score of 1 — a research project would
-- record every ตารางจำแนก as worth one point regardless of how many cells it
-- has, and the pre/post totals a teacher analyses would be wrong without
-- anything visibly failing.
--
-- The body below is the live definition with one branch added; every other
-- type's rule is unchanged.

CREATE OR REPLACE FUNCTION public.education_research_question_max_score(p_question public.questions)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  item_count integer;
  score_answer numeric := 1;
  explanation_score numeric := 0;
  total numeric;
BEGIN
  IF p_question.question_type = 'true_false' THEN
    item_count := CASE
      WHEN jsonb_typeof(p_question.extra_data->'statements') = 'array'
        THEN jsonb_array_length(p_question.extra_data->'statements')
      ELSE 0
    END;
    score_answer := COALESCE(NULLIF(p_question.extra_data->>'score_answer', '')::numeric, 1);
    IF COALESCE(p_question.extra_data->>'explanation_mode', 'none') <> 'none' THEN
      explanation_score := COALESCE(NULLIF(p_question.extra_data->>'score_explanation', '')::numeric, 1);
    END IF;
    RETURN score_answer * GREATEST(item_count + 1, 1) + explanation_score;
  END IF;

  IF p_question.question_type = 'fill_blank' THEN
    item_count := CASE
      WHEN jsonb_typeof(p_question.extra_data->'blanks') = 'array'
        THEN jsonb_array_length(p_question.extra_data->'blanks')
      ELSE 0
    END;
    RETURN GREATEST(item_count, 1);
  END IF;

  IF p_question.question_type = 'ordering' THEN
    item_count := CASE
      WHEN jsonb_typeof(p_question.extra_data->'items') = 'array'
        THEN jsonb_array_length(p_question.extra_data->'items')
      ELSE 0
    END;
    RETURN GREATEST(item_count, 1);
  END IF;

  IF p_question.question_type = 'matching' THEN
    item_count := CASE
      WHEN jsonb_typeof(p_question.mcq_options) = 'array'
        THEN jsonb_array_length(p_question.mcq_options)
      ELSE 0
    END;
    RETURN GREATEST(item_count, 1);
  END IF;

  IF p_question.question_type = 'composite' THEN
    IF jsonb_typeof(p_question.extra_data->'parts') <> 'array'
      OR jsonb_array_length(p_question.extra_data->'parts') = 0
    THEN
      RETURN 1;
    END IF;

    SELECT COALESCE(SUM(
      CASE
        WHEN jsonb_typeof(part->'score') = 'number' AND (part->>'score')::numeric > 0
          THEN (part->>'score')::numeric
        ELSE 1
      END
    ), 1)
    INTO total
    FROM jsonb_array_elements(p_question.extra_data->'parts') AS part;
    RETURN total;
  END IF;

  -- ตารางจำแนก: 1 คะแนนต่อช่อง, counting only the cells the teacher actually
  -- keyed. A cell whose key is missing, is not a whole number, or points past
  -- the end of its column's options cannot be graded, so charging the student
  -- for it would repeat the composite เติมคำ mistake — a sub-question counted
  -- toward the maximum that the student was never given a way to answer.
  --
  -- This mirrors classifyCellCount() in lib/classify.ts, which the application
  -- grades and scores by. The two must give the same number for the same row;
  -- change them together.
  IF p_question.question_type = 'classify' THEN
    IF jsonb_typeof(p_question.extra_data->'columns') <> 'array'
      OR jsonb_typeof(p_question.extra_data->'rows') <> 'array'
    THEN
      RETURN 1;
    END IF;

    SELECT COUNT(*)
    INTO item_count
    FROM jsonb_array_elements(p_question.extra_data->'rows') AS row_value
    CROSS JOIN jsonb_array_elements(p_question.extra_data->'columns') AS column_value
    WHERE jsonb_typeof(column_value->'options') = 'array'
      AND jsonb_typeof(row_value->'answers'->(column_value->>'id')) = 'number'
      AND (row_value->'answers'->>(column_value->>'id'))::numeric >= 0
      AND (row_value->'answers'->>(column_value->>'id'))::numeric
          < jsonb_array_length(column_value->'options')
      AND (row_value->'answers'->>(column_value->>'id'))::numeric
          = trunc((row_value->'answers'->>(column_value->>'id'))::numeric);

    RETURN GREATEST(item_count, 1);
  END IF;

  IF p_question.question_type = 'file_upload' THEN
    RETURN 1;
  END IF;

  item_count := CASE
    WHEN jsonb_typeof(p_question.answer_parts) = 'array'
      THEN jsonb_array_length(p_question.answer_parts)
    ELSE 0
  END;
  RETURN CASE WHEN item_count > 1 THEN item_count ELSE 1 END;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN 1;
END;
$$;
