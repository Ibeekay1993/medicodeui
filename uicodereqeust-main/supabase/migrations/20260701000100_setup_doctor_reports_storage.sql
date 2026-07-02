-- Storage setup for doctor reports/diagnosis forms.
-- The bucket is private. Users store objects under their own auth.uid() prefix.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'doctor-reports',
  'doctor-reports',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Hospitals can upload doctor reports" ON storage.objects;
DROP POLICY IF EXISTS "Hospitals can view own doctor reports" ON storage.objects;
DROP POLICY IF EXISTS "Nurses and admins can view all doctor reports" ON storage.objects;
DROP POLICY IF EXISTS "Clinical staff can view doctor reports" ON storage.objects;
DROP POLICY IF EXISTS "Hospitals can delete own doctor reports" ON storage.objects;

CREATE POLICY "Hospitals can upload doctor reports"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'doctor-reports' AND
    public.has_role(auth.uid(), 'hospital') AND
    auth.uid()::text = (storage.foldername(name))[1] AND
    lower(storage.extension(name)) IN ('pdf', 'jpg', 'jpeg', 'png')
  );

CREATE POLICY "Hospitals can view own doctor reports"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'doctor-reports' AND
    public.has_role(auth.uid(), 'hospital') AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Clinical staff can view doctor reports"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'doctor-reports' AND
    (
      public.has_role(auth.uid(), 'admin') OR
      public.has_role(auth.uid(), 'nurse') OR
      public.has_role(auth.uid(), 'utilization_manager') OR
      public.has_role(auth.uid(), 'claims')
    )
  );

CREATE POLICY "Hospitals can delete own doctor reports"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'doctor-reports' AND
    public.has_role(auth.uid(), 'hospital') AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
