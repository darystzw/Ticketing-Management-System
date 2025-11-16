-- Add banned column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT FALSE;

-- Add index for faster queries on banned status
CREATE INDEX IF NOT EXISTS idx_profiles_banned ON public.profiles(banned);

-- Update RLS policies to prevent banned users from accessing the system
-- This is a safeguard - the frontend will also check

-- Create function to check if user is banned
CREATE OR REPLACE FUNCTION public.is_user_banned(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(banned, FALSE) FROM public.profiles WHERE id = user_id;
$$;

-- Add comment explaining the column
COMMENT ON COLUMN public.profiles.banned IS 'If true, user is banned from accessing the system';
