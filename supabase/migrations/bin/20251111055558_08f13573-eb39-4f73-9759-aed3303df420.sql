-- Fix admin bootstrap chicken-and-egg problem
-- 1) Create helper function to detect if any admin exists
CREATE OR REPLACE FUNCTION public.has_any_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'
  );
$$;

-- 2) Tighten and clarify role management policies
-- Drop legacy policy if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'Only admins can manage roles'
  ) THEN
    DROP POLICY "Only admins can manage roles" ON public.user_roles;
  END IF;
END$$;

-- Ensure admins can manage roles (insert/update/delete)
CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) Bootstrap policy: allow the FIRST admin to be created by any authenticated user, ONLY if no admins exist yet
CREATE POLICY "Bootstrap first admin"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  NOT public.has_any_admin()
  AND user_id = auth.uid()
  AND role = 'admin'
);
