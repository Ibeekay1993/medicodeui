
-- Add common NHIA procedures to nhia_items
BEGIN;

INSERT INTO public.nhia_items (code, name, category, subcategory, amount) VALUES
('NHIA-PROC-001', 'Full Blood Count (FBC)', 'procedure', 'Laboratory', 2500),
('NHIA-PROC-002', 'Malaria Parasite (MP) Test', 'procedure', 'Laboratory', 1200),
('NHIA-PROC-003', 'Urinalysis', 'procedure', 'Laboratory', 800),
('NHIA-PROC-004', 'Blood Glucose (Fasting/Random)', 'procedure', 'Laboratory', 1000),
('NHIA-PROC-005', 'Chest X-Ray (CXR)', 'procedure', 'Radiology', 5500),
('NHIA-PROC-006', 'Ultrasound Scan (Abdominal/Pelvic)', 'procedure', 'Radiology', 6000),
('NHIA-PROC-007', 'Specialist Review / Consultation', 'procedure', 'Consultation', 5000),
('NHIA-PROC-008', 'Electrocardiography (ECG)', 'procedure', 'Radiology', 4500),
('NHIA-PROC-009', 'Liver Function Test (LFT)', 'procedure', 'Laboratory', 8500),
('NHIA-PROC-010', 'Kidney Function Test (KFT/U&E)', 'procedure', 'Laboratory', 9000),
('NHIA-PROC-011', 'Lipid Profile', 'procedure', 'Laboratory', 7500),
('NHIA-PROC-012', 'Widal Test', 'procedure', 'Laboratory', 1500),
('NHIA-PROC-013', 'Echocardiography (ECHO)', 'procedure', 'Radiology', 15000),
('NHIA-PROC-014', 'Pelvic Ultrasound', 'procedure', 'Radiology', 5000),
('NHIA-PROC-015', 'Obstetric Ultrasound', 'procedure', 'Radiology', 5000),
('NHIA-PROC-016', 'Full Electrolytes-(a-d)', 'procedure', 'Laboratory', 5000)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  subcategory = EXCLUDED.subcategory,
  amount = EXCLUDED.amount;

-- Add abbreviations for these procedures
INSERT INTO public.abbreviations (shorthand, item_code, confidence) VALUES
('FBC', 'NHIA-PROC-001', 'high'),
('MP', 'NHIA-PROC-002', 'high'),
('UA', 'NHIA-PROC-003', 'high'),
('FBS', 'NHIA-PROC-004', 'high'),
('RBS', 'NHIA-PROC-004', 'high'),
('CXR', 'NHIA-PROC-005', 'high'),
('USS', 'NHIA-PROC-006', 'high'),
('REVIEW', 'NHIA-PROC-007', 'high'),
('ECG', 'NHIA-PROC-008', 'high'),
('LFT', 'NHIA-PROC-009', 'high'),
('KFT', 'NHIA-PROC-010', 'high'),
('U&E', 'NHIA-PROC-010', 'high'),
('ECHO', 'NHIA-PROC-013', 'high'),
('Full Electrolytes', 'NHIA-PROC-016', 'high'),
('Electrolytes', 'NHIA-PROC-016', 'high'),
('Serum Electrolytes', 'NHIA-PROC-016', 'high')
ON CONFLICT DO NOTHING;

COMMIT;
