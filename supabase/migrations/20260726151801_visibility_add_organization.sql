DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'organization'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'visibility')
  ) THEN
    ALTER TYPE visibility ADD VALUE 'organization';
  END IF;
END$$;
;
