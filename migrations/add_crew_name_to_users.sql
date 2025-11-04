-- Migration: Add crew_name column to users table
-- Date: 2025-10-24
-- Purpose: Allow assignment of team members to specific crews for privacy/filtering

ALTER TABLE users ADD COLUMN IF NOT EXISTS crew_name TEXT;

-- Example usage: Assign users to crews
-- UPDATE users SET crew_name = 'Install Team A' WHERE email = 'installer1@example.com';
-- UPDATE users SET crew_name = 'Service Team B' WHERE email = 'service1@example.com';

COMMENT ON COLUMN users.crew_name IS 'Crew/team assignment for team roles (installer, service, etc.)';
