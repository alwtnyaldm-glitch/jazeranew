-- Migration: Add bank_logo column to applications table
-- Date: 2026-07-07

ALTER TABLE applications ADD COLUMN IF NOT EXISTS bank_logo TEXT;
