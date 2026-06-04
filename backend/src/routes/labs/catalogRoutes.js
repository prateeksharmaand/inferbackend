/**
 * Catalog Routes
 * Lab test catalog and panel management
 */

const router = require('express').Router();
const labAuth = require('../../middleware/labAuth');
const { query } = require('../../config/database');

const verifyLabToken = labAuth.verifyLabToken;

// GET /catalog - list tests
router.get('/catalog', verifyLabToken, async (req, res) => {
  try {
    const { lab_id, category, specimen_type, is_active = 'true', search } = req.query;
    const labId = lab_id || req.user.lab_id;
    const params = [];
    const conditions = [];
    let idx = 1;

    if (labId) { conditions.push(`lab_id = $${idx++}`); params.push(labId); }
    if (category) { conditions.push(`category = $${idx++}`); params.push(category); }
    if (specimen_type) { conditions.push(`specimen_type = $${idx++}`); params.push(specimen_type); }
    if (is_active !== undefined) { conditions.push(`is_active = $${idx++}`); params.push(is_active === 'true'); }
    if (search) { conditions.push(`(test_name ILIKE $${idx} OR test_code ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const res2 = await query(`SELECT * FROM lab_test_catalog ${where} ORDER BY category, test_name`, params);
    return res.json({ success: true, tests: res2.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /catalog - add test
router.post('/catalog', verifyLabToken, async (req, res) => {
  try {
    const {
      lab_id, test_code, test_name, category, sub_category, specimen_type,
      collection_method, sample_volume_ml, turnaround_hours, price, unit,
      reference_range_low, reference_range_high, reference_range_text,
      critical_low, critical_high,
    } = req.body;

    if (!test_code || !test_name) {
      return res.status(400).json({ error: 'test_code and test_name are required' });
    }

    const labId = lab_id || req.user.lab_id;

    const result = await query(
      `INSERT INTO lab_test_catalog
         (lab_id, test_code, test_name, category, sub_category, specimen_type,
          collection_method, sample_volume_ml, turnaround_hours, price, unit,
          reference_range_low, reference_range_high, reference_range_text,
          critical_low, critical_high)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        labId, test_code, test_name, category || null, sub_category || null,
        specimen_type || null, collection_method || null, sample_volume_ml || null,
        turnaround_hours || 24, price || null, unit || null,
        reference_range_low || null, reference_range_high || null, reference_range_text || null,
        critical_low || null, critical_high || null,
      ]
    );
    return res.status(201).json({ success: true, test: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Test code already exists for this lab' });
    return res.status(500).json({ error: err.message });
  }
});

// PUT /catalog/:test_id - update test
router.put('/catalog/:test_id', verifyLabToken, async (req, res) => {
  try {
    const {
      test_code, test_name, category, sub_category, specimen_type, collection_method,
      sample_volume_ml, turnaround_hours, price, unit, reference_range_low,
      reference_range_high, reference_range_text, critical_low, critical_high, is_active,
    } = req.body;

    const result = await query(
      `UPDATE lab_test_catalog SET
         test_code = COALESCE($1, test_code),
         test_name = COALESCE($2, test_name),
         category = COALESCE($3, category),
         sub_category = COALESCE($4, sub_category),
         specimen_type = COALESCE($5, specimen_type),
         collection_method = COALESCE($6, collection_method),
         sample_volume_ml = COALESCE($7, sample_volume_ml),
         turnaround_hours = COALESCE($8, turnaround_hours),
         price = COALESCE($9, price),
         unit = COALESCE($10, unit),
         reference_range_low = COALESCE($11, reference_range_low),
         reference_range_high = COALESCE($12, reference_range_high),
         reference_range_text = COALESCE($13, reference_range_text),
         critical_low = COALESCE($14, critical_low),
         critical_high = COALESCE($15, critical_high),
         is_active = COALESCE($16, is_active)
       WHERE id = $17
       RETURNING *`,
      [
        test_code, test_name, category, sub_category, specimen_type, collection_method,
        sample_volume_ml, turnaround_hours, price, unit, reference_range_low,
        reference_range_high, reference_range_text, critical_low, critical_high,
        is_active !== undefined ? is_active : null,
        req.params.test_id,
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Test not found' });
    return res.json({ success: true, test: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /catalog/:test_id - deactivate test
router.delete('/catalog/:test_id', verifyLabToken, async (req, res) => {
  try {
    const result = await query(
      `UPDATE lab_test_catalog SET is_active = FALSE WHERE id = $1 RETURNING *`,
      [req.params.test_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Test not found' });
    return res.json({ success: true, test: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /panels - list panels
router.get('/panels', verifyLabToken, async (req, res) => {
  try {
    const { lab_id, is_active = 'true' } = req.query;
    const labId = lab_id || req.user.lab_id;
    const params = [];
    const conditions = [];
    let idx = 1;

    if (labId) { conditions.push(`p.lab_id = $${idx++}`); params.push(labId); }
    conditions.push(`p.is_active = $${idx++}`);
    params.push(is_active === 'true');

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const panelsRes = await query(
      `SELECT p.*,
              COUNT(pt.test_id) AS test_count,
              COALESCE(json_agg(json_build_object('id',t.id,'test_code',t.test_code,'test_name',t.test_name))
                FILTER (WHERE t.id IS NOT NULL), '[]') AS tests
       FROM lab_test_panels p
       LEFT JOIN lab_panel_tests pt ON pt.panel_id = p.id
       LEFT JOIN lab_test_catalog t ON t.id = pt.test_id
       ${where}
       GROUP BY p.id
       ORDER BY p.panel_name`,
      params
    );
    return res.json({ success: true, panels: panelsRes.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /panels - create panel
router.post('/panels', verifyLabToken, async (req, res) => {
  try {
    const { lab_id, panel_code, panel_name, description, price } = req.body;
    if (!panel_code || !panel_name) {
      return res.status(400).json({ error: 'panel_code and panel_name are required' });
    }

    const labId = lab_id || req.user.lab_id;
    const result = await query(
      `INSERT INTO lab_test_panels (lab_id, panel_code, panel_name, description, price)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [labId, panel_code, panel_name, description || null, price || null]
    );
    return res.status(201).json({ success: true, panel: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /panels/:panel_id - update panel
router.put('/panels/:panel_id', verifyLabToken, async (req, res) => {
  try {
    const { panel_code, panel_name, description, price, is_active } = req.body;
    const result = await query(
      `UPDATE lab_test_panels SET
         panel_code = COALESCE($1, panel_code),
         panel_name = COALESCE($2, panel_name),
         description = COALESCE($3, description),
         price = COALESCE($4, price),
         is_active = COALESCE($5, is_active)
       WHERE id = $6 RETURNING *`,
      [panel_code, panel_name, description, price, is_active !== undefined ? is_active : null, req.params.panel_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Panel not found' });
    return res.json({ success: true, panel: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /panels/:panel_id/tests - add tests to panel
router.post('/panels/:panel_id/tests', verifyLabToken, async (req, res) => {
  try {
    const { test_ids } = req.body;
    if (!Array.isArray(test_ids) || test_ids.length === 0) {
      return res.status(400).json({ error: 'test_ids array is required' });
    }

    const inserted = [];
    for (const test_id of test_ids) {
      try {
        await query(
          `INSERT INTO lab_panel_tests (panel_id, test_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [req.params.panel_id, test_id]
        );
        inserted.push(test_id);
      } catch (_) { /* skip duplicates */ }
    }

    // Return updated panel with tests
    const panelRes = await query(
      `SELECT p.*, json_agg(json_build_object('id', t.id, 'test_code', t.test_code, 'test_name', t.test_name)) AS tests
       FROM lab_test_panels p
       JOIN lab_panel_tests pt ON pt.panel_id = p.id
       JOIN lab_test_catalog t ON t.id = pt.test_id
       WHERE p.id = $1
       GROUP BY p.id`,
      [req.params.panel_id]
    );

    return res.json({ success: true, inserted: inserted.length, panel: panelRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /panels/:panel_id/tests - list tests in a panel
router.get('/panels/:panel_id/tests', verifyLabToken, async (req, res) => {
  try {
    const r = await query(
      `SELECT t.*, pt.id AS panel_test_id FROM lab_panel_tests pt
       JOIN lab_test_catalog t ON t.id = pt.test_id
       WHERE pt.panel_id = $1 ORDER BY t.test_name`,
      [req.params.panel_id]
    );
    return res.json({ success: true, tests: r.rows });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// DELETE /panels/:panel_id/tests/:test_id - remove test from panel
router.delete('/panels/:panel_id/tests/:test_id', verifyLabToken, async (req, res) => {
  try {
    await query(`DELETE FROM lab_panel_tests WHERE panel_id = $1 AND test_id = $2`, [req.params.panel_id, req.params.test_id]);
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// POST /catalog/seed - seed standard Indian lab tests for this lab
router.post('/catalog/seed', verifyLabToken, async (req, res) => {
  const labId = req.user.lab_id;
  if (!labId) return res.status(400).json({ error: 'lab_id required' });

  const TESTS = [
    // ── HAEMATOLOGY ──────────────────────────────────────────────────────────
    { code:'CBC',    name:'Complete Blood Count',        cat:'HAEMATOLOGY', spec:'BLOOD', unit:'',      tat:4,  price:150, rl:null,  rh:null  },
    { code:'HB',     name:'Haemoglobin',                 cat:'HAEMATOLOGY', spec:'BLOOD', unit:'g/dL',  tat:2,  price:80,  rl:12.0,  rh:17.5  },
    { code:'TLC',    name:'Total Leucocyte Count',       cat:'HAEMATOLOGY', spec:'BLOOD', unit:'cells/µL',tat:2,price:60, rl:4000,  rh:11000 },
    { code:'DLC',    name:'Differential Leucocyte Count',cat:'HAEMATOLOGY', spec:'BLOOD', unit:'%',     tat:2,  price:80,  rl:null,  rh:null  },
    { code:'PLT',    name:'Platelet Count',              cat:'HAEMATOLOGY', spec:'BLOOD', unit:'lakhs/µL',tat:2,price:60, rl:1.5,   rh:4.5   },
    { code:'PCV',    name:'Packed Cell Volume (HCT)',    cat:'HAEMATOLOGY', spec:'BLOOD', unit:'%',     tat:2,  price:60,  rl:36,    rh:52    },
    { code:'MCV',    name:'Mean Corpuscular Volume',     cat:'HAEMATOLOGY', spec:'BLOOD', unit:'fL',    tat:2,  price:60,  rl:80,    rh:100   },
    { code:'MCH',    name:'Mean Corpuscular Haemoglobin',cat:'HAEMATOLOGY', spec:'BLOOD', unit:'pg',    tat:2,  price:60,  rl:27,    rh:33    },
    { code:'MCHC',   name:'MCHC',                        cat:'HAEMATOLOGY', spec:'BLOOD', unit:'g/dL',  tat:2,  price:60,  rl:31.5,  rh:36    },
    { code:'ESR',    name:'Erythrocyte Sedimentation Rate',cat:'HAEMATOLOGY',spec:'BLOOD',unit:'mm/hr', tat:2,  price:60,  rl:0,     rh:20    },
    { code:'RBC',    name:'Red Blood Cell Count',        cat:'HAEMATOLOGY', spec:'BLOOD', unit:'mill/µL',tat:2, price:60,  rl:4.5,   rh:6.5   },
    { code:'RETIC',  name:'Reticulocyte Count',          cat:'HAEMATOLOGY', spec:'BLOOD', unit:'%',     tat:4,  price:100, rl:0.5,   rh:2.5   },
    { code:'PS',     name:'Peripheral Blood Smear',      cat:'HAEMATOLOGY', spec:'BLOOD', unit:'',      tat:4,  price:150, rl:null,  rh:null  },
    { code:'MP',     name:'Malaria Parasite (QBC)',      cat:'HAEMATOLOGY', spec:'BLOOD', unit:'',      tat:4,  price:200, rl:null,  rh:null  },
    { code:'BT',     name:'Bleeding Time',               cat:'HAEMATOLOGY', spec:'BLOOD', unit:'min',   tat:2,  price:60,  rl:1,     rh:3     },
    { code:'CT',     name:'Clotting Time',               cat:'HAEMATOLOGY', spec:'BLOOD', unit:'min',   tat:2,  price:60,  rl:3,     rh:8     },
    { code:'PT',     name:'Prothrombin Time (PT/INR)',   cat:'HAEMATOLOGY', spec:'BLOOD', unit:'sec',   tat:4,  price:200, rl:null,  rh:null  },
    { code:'APTT',   name:'aPTT',                        cat:'HAEMATOLOGY', spec:'BLOOD', unit:'sec',   tat:4,  price:200, rl:25,    rh:37    },
    // ── BIOCHEMISTRY ─────────────────────────────────────────────────────────
    { code:'FBS',    name:'Fasting Blood Sugar',         cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/dL', tat:2,  price:80,  rl:70,    rh:100   },
    { code:'PPBS',   name:'Post Prandial Blood Sugar',   cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/dL', tat:2,  price:80,  rl:70,    rh:140   },
    { code:'RBS',    name:'Random Blood Sugar',          cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/dL', tat:1,  price:60,  rl:70,    rh:140   },
    { code:'HBA1C',  name:'HbA1c (Glycosylated Hb)',    cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'%',     tat:4,  price:400, rl:4.0,   rh:5.7   },
    { code:'UREA',   name:'Blood Urea',                  cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/dL', tat:2,  price:80,  rl:15,    rh:40    },
    { code:'CREAT',  name:'Serum Creatinine',            cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/dL', tat:2,  price:80,  rl:0.6,   rh:1.2   },
    { code:'UA',     name:'Uric Acid',                   cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/dL', tat:2,  price:100, rl:3.4,   rh:7.0   },
    { code:'EGFR',   name:'eGFR',                        cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mL/min',tat:2,  price:100, rl:60,    rh:null  },
    { code:'TBIL',   name:'Total Bilirubin',             cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/dL', tat:2,  price:80,  rl:0.2,   rh:1.2   },
    { code:'DBIL',   name:'Direct Bilirubin',            cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/dL', tat:2,  price:80,  rl:0,     rh:0.3   },
    { code:'IBIL',   name:'Indirect Bilirubin',          cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/dL', tat:2,  price:80,  rl:0.1,   rh:1.0   },
    { code:'SGOT',   name:'SGOT (AST)',                  cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'U/L',   tat:2,  price:80,  rl:10,    rh:40    },
    { code:'SGPT',   name:'SGPT (ALT)',                  cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'U/L',   tat:2,  price:80,  rl:7,     rh:56    },
    { code:'ALP',    name:'Alkaline Phosphatase',        cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'U/L',   tat:2,  price:80,  rl:44,    rh:147   },
    { code:'GGT',    name:'Gamma GT',                    cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'U/L',   tat:2,  price:100, rl:9,     rh:48    },
    { code:'TP',     name:'Total Protein',               cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'g/dL',  tat:2,  price:80,  rl:6.0,   rh:8.3   },
    { code:'ALB',    name:'Serum Albumin',               cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'g/dL',  tat:2,  price:80,  rl:3.5,   rh:5.0   },
    { code:'GLOB',   name:'Globulin',                    cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'g/dL',  tat:2,  price:80,  rl:2.0,   rh:3.5   },
    { code:'CHOL',   name:'Total Cholesterol',           cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/dL', tat:4,  price:100, rl:null,  rh:200   },
    { code:'TG',     name:'Triglycerides',               cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/dL', tat:4,  price:100, rl:null,  rh:150   },
    { code:'HDL',    name:'HDL Cholesterol',             cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/dL', tat:4,  price:100, rl:40,    rh:null  },
    { code:'LDL',    name:'LDL Cholesterol',             cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/dL', tat:4,  price:100, rl:null,  rh:100   },
    { code:'VLDL',   name:'VLDL Cholesterol',            cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/dL', tat:4,  price:100, rl:null,  rh:30    },
    { code:'NA',     name:'Sodium',                      cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mEq/L', tat:2,  price:80,  rl:136,   rh:146   },
    { code:'K',      name:'Potassium',                   cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mEq/L', tat:2,  price:80,  rl:3.5,   rh:5.1   },
    { code:'CL',     name:'Chloride',                    cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mEq/L', tat:2,  price:80,  rl:98,    rh:107   },
    { code:'CA',     name:'Calcium',                     cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/dL', tat:2,  price:100, rl:8.5,   rh:10.5  },
    { code:'PHOS',   name:'Phosphorus (Inorganic)',      cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/dL', tat:2,  price:100, rl:2.5,   rh:4.5   },
    { code:'MG',     name:'Magnesium',                   cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/dL', tat:2,  price:100, rl:1.7,   rh:2.2   },
    { code:'AMY',    name:'Amylase',                     cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'U/L',   tat:4,  price:200, rl:28,    rh:100   },
    { code:'LIP',    name:'Lipase',                      cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'U/L',   tat:4,  price:200, rl:13,    rh:60    },
    { code:'CK',     name:'Creatine Kinase (CK-MB)',     cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'U/L',   tat:4,  price:300, rl:0,     rh:25    },
    { code:'LDH',    name:'Lactate Dehydrogenase',       cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'U/L',   tat:4,  price:200, rl:140,   rh:280   },
    { code:'TROP',   name:'Troponin I (Quantitative)',   cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'ng/mL', tat:2,  price:600, rl:0,     rh:0.04  },
    { code:'FERR',   name:'Serum Ferritin',              cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'ng/mL', tat:4,  price:500, rl:12,    rh:300   },
    { code:'TIBC',   name:'TIBC',                        cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'µg/dL', tat:4,  price:300, rl:250,   rh:370   },
    { code:'IRONFE', name:'Serum Iron',                  cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'µg/dL', tat:4,  price:200, rl:60,    rh:170   },
    { code:'VB12',   name:'Vitamin B12',                 cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'pg/mL', tat:8,  price:700, rl:200,   rh:900   },
    { code:'VD',     name:'Vitamin D (25-OH)',           cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'ng/mL', tat:8,  price:1200,rl:30,    rh:100   },
    { code:'CRP',    name:'C-Reactive Protein (CRP)',    cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/L',  tat:4,  price:300, rl:0,     rh:5     },
    { code:'HSCRP',  name:'hsCRP',                       cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'mg/L',  tat:8,  price:500, rl:0,     rh:3     },
    // ── ENDOCRINOLOGY ────────────────────────────────────────────────────────
    { code:'TSH',    name:'TSH (Thyroid Stimulating Hormone)',cat:'ENDOCRINOLOGY',spec:'BLOOD',unit:'µIU/mL',tat:8,price:350,rl:0.4,rh:4.0},
    { code:'T3',     name:'Total T3',                    cat:'ENDOCRINOLOGY',spec:'BLOOD', unit:'ng/dL', tat:8,  price:300, rl:80,    rh:200   },
    { code:'T4',     name:'Total T4',                    cat:'ENDOCRINOLOGY',spec:'BLOOD', unit:'µg/dL', tat:8,  price:300, rl:5.1,   rh:14.1  },
    { code:'FT3',    name:'Free T3',                     cat:'ENDOCRINOLOGY',spec:'BLOOD', unit:'pg/mL', tat:8,  price:400, rl:2.3,   rh:4.2   },
    { code:'FT4',    name:'Free T4',                     cat:'ENDOCRINOLOGY',spec:'BLOOD', unit:'ng/dL', tat:8,  price:400, rl:0.89,  rh:1.76  },
    { code:'INSULIN',name:'Fasting Insulin',             cat:'ENDOCRINOLOGY',spec:'BLOOD', unit:'µIU/mL',tat:8,  price:600, rl:2.6,   rh:24.9  },
    { code:'CORTIS', name:'Cortisol (AM)',                cat:'ENDOCRINOLOGY',spec:'BLOOD', unit:'µg/dL', tat:8,  price:600, rl:6.2,   rh:19.4  },
    // ── IMMUNOLOGY / SEROLOGY ────────────────────────────────────────────────
    { code:'WIDAL',  name:'Widal Test',                  cat:'IMMUNOLOGY',  spec:'BLOOD', unit:'titer', tat:8,  price:200, rl:null,  rh:null  },
    { code:'DENGNS1',name:'Dengue NS1 Antigen',          cat:'IMMUNOLOGY',  spec:'BLOOD', unit:'',      tat:4,  price:500, rl:null,  rh:null  },
    { code:'DENGIGM',name:'Dengue IgM/IgG',              cat:'IMMUNOLOGY',  spec:'BLOOD', unit:'',      tat:4,  price:500, rl:null,  rh:null  },
    { code:'MALCARD',name:'Malaria Rapid Card Test',     cat:'IMMUNOLOGY',  spec:'BLOOD', unit:'',      tat:1,  price:200, rl:null,  rh:null  },
    { code:'TYPHI',  name:'Typhoid IgM (Rapid)',         cat:'IMMUNOLOGY',  spec:'BLOOD', unit:'',      tat:2,  price:300, rl:null,  rh:null  },
    { code:'HIV',    name:'HIV 1 & 2 (ELISA)',           cat:'IMMUNOLOGY',  spec:'BLOOD', unit:'',      tat:8,  price:400, rl:null,  rh:null  },
    { code:'HBSAG',  name:'HBsAg (Hepatitis B Surface Ag)',cat:'IMMUNOLOGY',spec:'BLOOD', unit:'',      tat:4,  price:300, rl:null,  rh:null  },
    { code:'HCVAB',  name:'Anti-HCV Antibody',           cat:'IMMUNOLOGY',  spec:'BLOOD', unit:'',      tat:4,  price:400, rl:null,  rh:null  },
    { code:'VDRL',   name:'VDRL (Syphilis)',              cat:'IMMUNOLOGY',  spec:'BLOOD', unit:'',      tat:4,  price:200, rl:null,  rh:null  },
    { code:'RATEST', name:'RA Factor',                   cat:'IMMUNOLOGY',  spec:'BLOOD', unit:'IU/mL', tat:4,  price:300, rl:0,     rh:14   },
    { code:'ANA',    name:'ANA (Antinuclear Antibody)',  cat:'IMMUNOLOGY',  spec:'BLOOD', unit:'',      tat:24, price:900, rl:null,  rh:null  },
    { code:'ASO',    name:'ASO Titre',                   cat:'IMMUNOLOGY',  spec:'BLOOD', unit:'IU/mL', tat:8,  price:300, rl:0,     rh:200  },
    { code:'PROCAL', name:'Procalcitonin',               cat:'IMMUNOLOGY',  spec:'BLOOD', unit:'ng/mL', tat:4,  price:1500,rl:0,     rh:0.5  },
    // ── URINE ────────────────────────────────────────────────────────────────
    { code:'URE',    name:'Urine Routine & Microscopy',  cat:'PATHOLOGY',   spec:'URINE', unit:'',      tat:2,  price:100, rl:null,  rh:null  },
    { code:'UCULTURE',name:'Urine Culture & Sensitivity',cat:'MICROBIOLOGY',spec:'URINE',unit:'',       tat:72, price:600, rl:null,  rh:null  },
    { code:'UPROT',  name:'Urine Protein (24hr)',        cat:'BIOCHEMISTRY',spec:'URINE', unit:'mg/day',tat:4,  price:150, rl:0,     rh:150  },
    { code:'UACR',   name:'Urine Albumin:Creatinine',   cat:'BIOCHEMISTRY',spec:'URINE', unit:'mg/g',  tat:4,  price:300, rl:0,     rh:30   },
    { code:'PREG',   name:'Urine Pregnancy Test (UPT)',  cat:'PATHOLOGY',   spec:'URINE', unit:'',      tat:0.5,price:100, rl:null,  rh:null  },
    // ── STOOL ────────────────────────────────────────────────────────────────
    { code:'STOOLRE',name:'Stool Routine & Microscopy',  cat:'PATHOLOGY',   spec:'STOOL', unit:'',      tat:4,  price:100, rl:null,  rh:null  },
    { code:'OCCULT', name:'Stool Occult Blood',          cat:'PATHOLOGY',   spec:'STOOL', unit:'',      tat:4,  price:150, rl:null,  rh:null  },
    // ── MICROBIOLOGY ─────────────────────────────────────────────────────────
    { code:'BLDCULT',name:'Blood Culture & Sensitivity', cat:'MICROBIOLOGY',spec:'BLOOD', unit:'',      tat:120,price:900, rl:null,  rh:null  },
    { code:'SWABCUL',name:'Wound Swab Culture',          cat:'MICROBIOLOGY',spec:'SWAB',  unit:'',      tat:72, price:600, rl:null,  rh:null  },
    { code:'SPUTCUL',name:'Sputum Culture & Sensitivity',cat:'MICROBIOLOGY',spec:'SPUTUM',unit:'',      tat:72, price:600, rl:null,  rh:null  },
    { code:'SPUTAFB',name:'Sputum AFB / ZN Stain',      cat:'MICROBIOLOGY',spec:'SPUTUM',unit:'',       tat:24, price:300, rl:null,  rh:null  },
    { code:'KOCHINF',name:'GeneXpert MTB/RIF (TB)',      cat:'MICROBIOLOGY',spec:'SPUTUM',unit:'',       tat:4,  price:1200,rl:null,  rh:null  },
    // ── CARDIAC MARKERS ──────────────────────────────────────────────────────
    { code:'CPKMB',  name:'CK-MB',                       cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'U/L',   tat:2,  price:400, rl:0,     rh:25   },
    { code:'MYOGL',  name:'Myoglobin',                   cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'ng/mL', tat:2,  price:500, rl:0,     rh:70   },
    { code:'NTPROBN',name:'NT-proBNP',                   cat:'BIOCHEMISTRY',spec:'BLOOD', unit:'pg/mL', tat:8,  price:2000,rl:0,     rh:125  },
    // ── HORMONES ─────────────────────────────────────────────────────────────
    { code:'LH',     name:'LH (Luteinizing Hormone)',    cat:'ENDOCRINOLOGY',spec:'BLOOD',unit:'mIU/mL',tat:8,  price:500, rl:null,  rh:null },
    { code:'FSH',    name:'FSH (Follicle Stimulating H)',cat:'ENDOCRINOLOGY',spec:'BLOOD',unit:'mIU/mL',tat:8,  price:500, rl:null,  rh:null },
    { code:'PRL',    name:'Prolactin',                   cat:'ENDOCRINOLOGY',spec:'BLOOD',unit:'ng/mL', tat:8,  price:500, rl:null,  rh:null },
    { code:'TESTO',  name:'Testosterone (Total)',        cat:'ENDOCRINOLOGY',spec:'BLOOD',unit:'ng/dL', tat:8,  price:600, rl:300,   rh:1000 },
    { code:'ESTRA',  name:'Oestradiol (E2)',             cat:'ENDOCRINOLOGY',spec:'BLOOD',unit:'pg/mL', tat:8,  price:600, rl:null,  rh:null },
    { code:'PROGEST',name:'Progesterone',                cat:'ENDOCRINOLOGY',spec:'BLOOD',unit:'ng/mL', tat:8,  price:600, rl:null,  rh:null },
    { code:'PTH',    name:'Parathyroid Hormone (PTH)',   cat:'ENDOCRINOLOGY',spec:'BLOOD',unit:'pg/mL', tat:8,  price:800, rl:15,    rh:65   },
    // ── TUMOUR MARKERS ───────────────────────────────────────────────────────
    { code:'PSA',    name:'PSA (Prostate Specific Antigen)',cat:'ONCOLOGY', spec:'BLOOD',unit:'ng/mL',  tat:8,  price:700, rl:0,     rh:4    },
    { code:'AFP',    name:'Alpha Fetoprotein (AFP)',     cat:'ONCOLOGY',    spec:'BLOOD',unit:'ng/mL',  tat:8,  price:700, rl:0,     rh:8.1  },
    { code:'CEA',    name:'Carcinoembryonic Antigen',    cat:'ONCOLOGY',    spec:'BLOOD',unit:'ng/mL',  tat:8,  price:700, rl:0,     rh:5    },
    { code:'CA125',  name:'CA-125',                      cat:'ONCOLOGY',    spec:'BLOOD',unit:'U/mL',   tat:8,  price:800, rl:0,     rh:35   },
    { code:'CA199',  name:'CA 19-9',                     cat:'ONCOLOGY',    spec:'BLOOD',unit:'U/mL',   tat:8,  price:800, rl:0,     rh:37   },
  ];

  const PANELS = [
    { code:'CBC_PKG', name:'Complete Blood Count (CBC)',       tests:['HB','TLC','DLC','PLT','PCV','MCV','MCH','MCHC','RBC'], price:250 },
    { code:'LFT',     name:'Liver Function Test (LFT)',        tests:['TBIL','DBIL','IBIL','SGOT','SGPT','ALP','TP','ALB','GLOB'], price:500 },
    { code:'KFT',     name:'Kidney Function Test (KFT)',       tests:['UREA','CREAT','UA','NA','K','CL','CA','PHOS'], price:500 },
    { code:'LIPID',   name:'Lipid Profile',                    tests:['CHOL','TG','HDL','LDL','VLDL'], price:400 },
    { code:'TFT',     name:'Thyroid Function Test (TFT)',      tests:['TSH','FT3','FT4'], price:700 },
    { code:'DIAB',    name:'Diabetes Panel',                   tests:['FBS','PPBS','HBA1C'], price:400 },
    { code:'ELECTRO', name:'Electrolytes',                     tests:['NA','K','CL','CA'], price:300 },
    { code:'CARDIAC', name:'Cardiac Panel (Basic)',            tests:['TROP','CPKMB','MYOGL','LDH'], price:1500 },
    { code:'FEVER',   name:'Fever Panel',                      tests:['CBC','WIDAL','MP','DENGNS1','DENGIGM','MALCARD'], price:700 },
    { code:'ANEMIA',  name:'Anaemia Panel',                    tests:['HB','MCV','MCH','MCHC','FERR','TIBC','IRONFE','VB12'], price:1200 },
    { code:'ARTHRIT', name:'Arthritis Panel',                  tests:['RATEST','ANA','ASO','CRP','UA'], price:900 },
    { code:'MASTER',  name:'Master Health Checkup',            tests:['HB','TLC','PLT','FBS','UREA','CREAT','SGPT','CHOL','TG','TSH','VD','VB12','URE'], price:1999 },
  ];

  try {
    let added = 0, skipped = 0;
    const codeToId = {};

    for (const t of TESTS) {
      try {
        const r = await query(
          `INSERT INTO lab_test_catalog
             (lab_id, test_code, test_name, category, specimen_type, turnaround_hours, price, unit,
              reference_range_low, reference_range_high, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
           ON CONFLICT (lab_id, test_code) DO NOTHING
           RETURNING id, test_code`,
          [labId, t.code, t.name, t.cat, t.spec, t.tat, t.price, t.unit||null, t.rl, t.rh]
        );
        if (r.rows.length > 0) { codeToId[t.code] = r.rows[0].id; added++; }
        else {
          const ex = await query(`SELECT id FROM lab_test_catalog WHERE lab_id=$1 AND test_code=$2`, [labId, t.code]);
          if (ex.rows[0]) codeToId[t.code] = ex.rows[0].id;
          skipped++;
        }
      } catch { skipped++; }
    }

    let panelsAdded = 0;
    for (const p of PANELS) {
      try {
        const pr = await query(
          `INSERT INTO lab_test_panels (lab_id, panel_code, panel_name, price, is_active)
           VALUES ($1,$2,$3,$4,true)
           ON CONFLICT (lab_id, panel_code) DO NOTHING
           RETURNING id`,
          [labId, p.code, p.name, p.price]
        );
        const panelId = pr.rows[0]?.id;
        if (!panelId) continue;
        panelsAdded++;
        for (const tc of p.tests) {
          const tid = codeToId[tc];
          if (tid) await query(`INSERT INTO lab_test_panels_tests (panel_id, test_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [panelId, tid]).catch(() =>
            query(`INSERT INTO lab_panel_tests (panel_id, test_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [panelId, tid])
          );
        }
      } catch { /* panel already exists */ }
    }

    return res.json({ success: true, tests_added: added, tests_skipped: skipped, panels_added: panelsAdded });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /sample-types - list all sample types
router.get('/sample-types', verifyLabToken, async (req, res) => {
  try {
    const res2 = await query(
      `SELECT id, name, description FROM lab_sample_types WHERE is_active = true ORDER BY name`,
      []
    );
    return res.json({ success: true, sample_types: res2.rows });
  } catch (err) {
    // If table doesn't exist yet (migration not run), return empty array
    if (err.message.includes('does not exist')) {
      return res.json({ success: true, sample_types: [] });
    }
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
