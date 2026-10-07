ALTER POLICY "Super Admins only can manage roles"
  ON public.user_roles
  RENAME TO "Admins can manage roles";
