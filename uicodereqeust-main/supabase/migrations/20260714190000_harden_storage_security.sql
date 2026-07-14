-- Secure Storage Buckets Configuration
-- Limit to 5MB (5242880 bytes) and only allow specific secure MIME types

-- 1. Harden 'doctor-reports' bucket
UPDATE storage.buckets
SET 
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf']
WHERE id = 'doctor-reports';

-- 2. Harden 'support-attachments' bucket
UPDATE storage.buckets
SET 
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf']
WHERE id = 'support-attachments';

-- 3. Enforce strict ownership RLS on storage.objects

-- Users can only upload files if they are authenticated and the file belongs to them
CREATE POLICY "Users can upload their own storage objects"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('doctor-reports', 'support-attachments') 
  AND auth.uid() = owner
);

-- Users can only view files they own
CREATE POLICY "Users can view their own storage objects"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('doctor-reports', 'support-attachments') 
  AND auth.uid() = owner
);

-- Users can only delete files they own
CREATE POLICY "Users can delete their own storage objects"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN ('doctor-reports', 'support-attachments') 
  AND auth.uid() = owner
);

-- Admins/Support can view any files
CREATE POLICY "Admins can view all storage objects"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('doctor-reports', 'support-attachments') 
  AND EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'support')
  )
);
