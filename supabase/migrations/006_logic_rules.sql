-- Migration 006: Add logic_rules column to questions
-- Run this in Supabase SQL Editor

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS logic_rules jsonb NOT NULL DEFAULT '[]';
