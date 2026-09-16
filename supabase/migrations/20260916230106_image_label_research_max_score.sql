-- Teaches the education-research max-score function about "ติดป้ายบนรูป".
--
-- Separate from the migration that added the enum label because Postgres will
-- not let a value added by ALTER TYPE ... ADD VALUE be used in the same
-- transaction that added it, and the CLI runs one transaction per file.
--
-- Without this branch an image_label question falls through to the trailing
-- answer_parts path and reports a max score of 1 — a research project would
-- record every ใบงานติดป้าย as worth one point regardless of how many places
-- on the picture it asks about, and the pre/post totals a teacher analyses
-- would be wrong without anything visibly failing.
--
-- The body below is the live definition with one branch added; every other
-- type's rule is unchanged. It was lifted from
-- 20260912073314_classify_research_max_score.sql by script rather than
-- retyped, for the reason that file gives: a typo in a branch nobody is
-- looking at changes scores silently.

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

  -- ติดป้ายบนรูป: 1 คะแนนต่อจุด, counting only the points somebody could
  -- actually get right. A point the teacher never keyed is not gradable, and
  -- neither is one keyed to a word the question no longer offers — which is
  -- what a file import, or a later edit to the word bank, leaves behind.
  -- Charging the student for either would repeat the composite เติมคำ mistake:
  -- a sub-question counted toward the maximum that the student was never given
  -- a way to answer.
  --
  -- 'typed' has no list to be unreachable in, so it filters nothing. A
  -- 'dropdown' point offers its own options, or the question's bank when it
  -- has none of its own — an emptied list counts as no list, not as a list
  -- offering nothing.
  --
  -- This mirrors imageLabelMarkerCount() in lib/image-label.ts, which the
  -- application grades and scores by. The two must give the same number for
  -- the same row; change them together. lib/image-label-sql.test.ts runs this
  -- file against a real Postgres and checks exactly that.
  IF p_question.question_type = 'image_label' THEN
    IF jsonb_typeof(p_question.extra_data->'markers') <> 'array' THEN
      RETURN 1;
    END IF;

    SELECT COUNT(*)
    INTO item_count
    FROM jsonb_array_elements(p_question.extra_data->'markers') AS marker_value
    CROSS JOIN LATERAL (
      SELECT
        COALESCE(p_question.extra_data->>'answer_mode', 'typed') AS mode,
        (
          SELECT COALESCE(
                   array_agg(btrim(word #>> '{}'))
                     FILTER (WHERE jsonb_typeof(word) = 'string' AND btrim(word #>> '{}') <> ''),
                   '{}'::text[])
          FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(p_question.extra_data->'bank') = 'array'
                      THEN p_question.extra_data->'bank' ELSE '[]'::jsonb END) AS word
        ) AS bank,
        (
          SELECT COALESCE(
                   array_agg(btrim(word #>> '{}'))
                     FILTER (WHERE jsonb_typeof(word) = 'string' AND btrim(word #>> '{}') <> ''),
                   '{}'::text[])
          FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(marker_value->'options') = 'array'
                      THEN marker_value->'options' ELSE '[]'::jsonb END) AS word
        ) AS own
    ) AS lists
    WHERE EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(marker_value->'answers') = 'array'
                  THEN marker_value->'answers' ELSE '[]'::jsonb END) AS accepted
      WHERE jsonb_typeof(accepted) = 'string'
        AND btrim(accepted #>> '{}') <> ''
        AND (
          lists.mode NOT IN ('dropdown', 'drag')
          OR btrim(accepted #>> '{}') = ANY (
               CASE
                 WHEN lists.mode = 'drag' THEN lists.bank
                 WHEN COALESCE(array_length(lists.own, 1), 0) > 0 THEN lists.own
                 ELSE lists.bank
               END)
        )
    );

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
