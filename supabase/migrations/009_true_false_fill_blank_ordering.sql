-- Add new question types: true/false, fill-in-the-blank, ordering
alter type question_type add value if not exists 'true_false';
alter type question_type add value if not exists 'fill_blank';
alter type question_type add value if not exists 'ordering';

-- Add extra_data column for type-specific configuration
alter table public.questions
  add column if not exists extra_data jsonb not null default '{}';
