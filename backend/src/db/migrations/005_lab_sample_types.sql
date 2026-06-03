-- ============================================
-- LAB SAMPLE TYPES - LOINC Compatible
-- ============================================

CREATE TABLE IF NOT EXISTS lab_sample_types (
  id INT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sample_types_active ON lab_sample_types(is_active);

-- Insert all sample types from the provided list
INSERT INTO lab_sample_types (id, name, description) VALUES
(341, 'Blood Specimen', 'Blood sample collected for testing'),
(342, 'Urine', 'Urine sample for urinalysis'),
(345, 'Serum', 'Serum separated from blood'),
(112, 'Sputum', 'Sputum sample for respiratory testing'),
(114, 'Plasma', 'Plasma collected from blood'),
(348, 'Semen', 'Semen sample for fertility testing'),
(344, 'Cerebrospinal fluid', 'CSF collected via lumbar puncture'),
(343, 'Feces', 'Fecal specimen for analysis'),
(102, 'saliva', 'Saliva sample'),
(126, 'Pus specimen', 'Pus sample for culture'),
(161, 'Body fluid specimen', 'General body fluid sample'),
(125, 'Amniotic fluid specimen', 'Amniotic fluid from pregnancy'),
(120, 'Urethral fluid', 'Urethral specimen'),
(347, 'Vaginal fluid', 'Vaginal specimen'),
(118, 'Tissue Specimen', 'Tissue biopsy sample'),
(94, 'Nasopharyngeal Swab', 'Nasopharyngeal swab'),
(93, 'Cervical Swab', 'Cervical swab specimen'),
(346, 'Skin Specimen', 'Skin biopsy or scraping'),
(202, 'Other Specimen', 'Other type of specimen'),
(116, 'Whole blood sample', 'Whole blood without separation'),
(84, 'Bone marrow specimen', 'Bone marrow biopsy'),
(87, 'Rectal swab', 'Rectal swab sample'),
(89, 'Biopsy specimen', 'General biopsy specimen'),
(91, 'Aspirate specimen', 'Aspirate sample'),
(92, 'Pericardial fluid specimen', 'Pericardial fluid'),
(95, 'Nasal swab specimen', 'Nasal swab'),
(96, 'Oropharyngeal swab specimen', 'Oropharyngeal swab'),
(98, 'Pleural fluid', 'Pleural fluid specimen'),
(99, 'Ascitic fluid', 'Ascites fluid'),
(103, 'High vaginal swab', 'High vaginal swab'),
(104, 'Bronchial aspirate', 'Bronchial aspirate specimen'),
(105, 'Specimen from stomach', 'Stomach specimen'),
(106, 'Joint fluid', 'Synovial fluid from joints'),
(110, 'Expressed breastmilk', 'Expressed breastmilk sample'),
(111, 'Urogenital swab', 'Urogenital swab specimen'),
(113, 'Peripheral blood mononuclear cells', 'PBMC sample'),
(82, 'Mucus specimen', 'Mucus sample for testing')
ON CONFLICT (id) DO NOTHING;

-- Ensure the specimen_type field in lab_test_results references the sample type name
-- This allows linking results to the proper sample type definitions
