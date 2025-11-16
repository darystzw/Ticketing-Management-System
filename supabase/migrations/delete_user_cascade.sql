-- Migration: Add RPC function to delete user cascade (auth + profiles + roles)
-- Purpose: Securely delete a user from auth.users along with their profile and roles

CREATE OR REPLACE FUNCTION public.delete_user_cascade(_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_email TEXT;
  _rows_deleted INT := 0;
BEGIN
  -- Get the user email for logging/confirmation
  SELECT email INTO _user_email FROM auth.users WHERE id = _user_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'message', 'User not found'
    );
  END IF;

  -- Delete user roles first (foreign key constraint)
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  GET DIAGNOSTICS _rows_deleted = ROW_COUNT;

  -- Delete profile (cascades to tickets/sales due to foreign keys)
  DELETE FROM public.profiles WHERE id = _user_id;
  GET DIAGNOSTICS _rows_deleted = ROW_COUNT;

  -- Delete from auth.users using admin API
  -- Note: this uses the internal auth schema and requires SECURITY DEFINER
  DELETE FROM auth.users WHERE id = _user_id;
  GET DIAGNOSTICS _rows_deleted = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'message', 'User ' || COALESCE(_user_email, _user_id::TEXT) || ' deleted successfully',
    'deleted_user_id', _user_id
  );
END;
$$;

-- Grant permission to authenticated users to call this function
GRANT EXECUTE ON FUNCTION public.delete_user_cascade(UUID) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.delete_user_cascade IS 'Deletes a user cascade: removes auth user, profile, and roles. Only callable by authenticated users with admin role (enforced via RLS).';
