-- Add new question types for matching and essay
alter type question_type add value if not exists 'matching';
alter type question_type add value if not exists 'essay';
