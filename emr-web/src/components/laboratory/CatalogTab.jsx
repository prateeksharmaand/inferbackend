/**
 * CatalogTab - Manage Test Catalog & Panels
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Edit2, ToggleLeft, ToggleRight, X, Check, Layers } from 'lucide-react';

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
});

async function apiFetch(url, options = {}) {
  const res = await fetch(url, { headers: authHeaders(), ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const CATEGORIES = ['HEMATOLOGY', 'BIOCHEMISTRY', 'MICROBIOLOGY', 'IMMUNOLOGY', 'ENDOCRINOLOGY', 'CARDIAC', 'ONCOLOGY', 'RADIOLOGY', 'POCT', 'OTHER'];
const SPECIMEN_TYPES = ['BLOOD', 'URINE', 'STOOL', 'TISSUE', 'SWAB', 'CSF', 'OTHER'];

const EMPTY_TEST = {
  test_code: '', test_name: '', category: 'HEMATOLOGY', sub_category: '',
  specimen_type: 'BLOOD', collection_method: '', sample_volume_ml: '',
  turnaround_hours: '', price: '', unit: '',
  reference_range_low: '', reference_range_high: '',
  critical_low: '', critical_high: '',
};

const EMPTY_PANEL = { panel_code: '', panel_name: '', description: '', price: '' };

export function CatalogTab({ labId }) {
  const [activeSection, setActiveSection] = useState('catalog'); // 'catalog' | 'panels'

  // Catalog
  const [tests, setTests] = useState([]);
  const [testsLoading, setTestsLoading] = useState(false);
  const [testsError, setTestsError] = useState('');
  const [showAddTest, setShowAddTest] = useState(false);
  const [editTest, setEditTest] = useState(null); // test being edited
  const [testForm, setTestForm] = useState(EMPTY_TEST);
  const [testSubmitting, setTestSubmitting] = useState(false);
  const [testFormError, setTestFormError] = useState('');
  const [testFormSuccess, setTestFormSuccess] = useState('');
  const [toggleLoadingId, setToggleLoadingId] = useState(null);

  // Panels
  const [panels, setPanels] = useState([]);
  const [panelsLoading, setPanelsLoading] = useState(false);
  const [panelsError, setPanelsError] = useState('');
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [panelForm, setPanelForm] = useState(EMPTY_PANEL);
  const [panelSubmitting, setPanelSubmitting] = useState(false);
  const [panelFormError, setPanelFormError] = useState('');
  const [panelFormSuccess, setPanelFormSuccess] = useState('');

  // Add tests to panel
  const [addTestsPanel, setAddTestsPanel] = useState(null);
  const [selectedTestIds, setSelectedTestIds] = useState([]);
  const [addTestsLoading, setAddTestsLoading] = useState(false);
  const [addTestsError, setAddTestsError] = useState('');

  const fetchTests = useCallback(async () => {
    try {
      setTestsLoading(true);
      setTestsError('');
      const data = await apiFetch(`/api/v1/catalog?lab_id=${labId}`);
      setTests(data.tests || data || []);
    } catch (err) {
      setTestsError(err.message);
    } finally {
      setTestsLoading(false);
    }
  }, [labId]);

  const fetchPanels = useCallback(async () => {
    try {
      setPanelsLoading(true);
      setPanelsError('');
      const data = await apiFetch(`/api/v1/panels?lab_id=${labId}`);
      setPanels(data.panels || data || []);
    } catch (err) {
      setPanelsError(err.message);
    } finally {
      setPanelsLoading(false);
    }
  }, [labId]);

  useEffect(() => {
    fetchTests();
    fetchPanels();
  }, [fetchTests, fetchPanels]);

  const handleToggleActive = async (test) => {
    try {
      setToggleLoadingId(test.id);
      await apiFetch(`/api/v1/catalog/${test.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !test.is_active }),
      });
      setTests((prev) => prev.map((t) => t.id === test.id ? { ...t, is_active: !t.is_active } : t));
    } catch (err) {
      setTestsError(err.message);
    } finally {
      setToggleLoadingId(null);
    }
  };

  const openEditTest = (test) => {
    setEditTest(test);
    setTestForm({
      test_code: test.test_code || '',
      test_name: test.test_name || '',
      category: test.category || 'HEMATOLOGY',
      sub_category: test.sub_category || '',
      specimen_type: test.specimen_type || 'BLOOD',
      collection_method: test.collection_method || '',
      sample_volume_ml: test.sample_volume_ml != null ? String(test.sample_volume_ml) : '',
      turnaround_hours: test.turnaround_hours != null ? String(test.turnaround_hours) : '',
      price: test.price != null ? String(test.price) : '',
      unit: test.unit || '',
      reference_range_low: test.reference_range_low != null ? String(test.reference_range_low) : '',
      reference_range_high: test.reference_range_high != null ? String(test.reference_range_high) : '',
      critical_low: test.critical_low != null ? String(test.critical_low) : '',
      critical_high: test.critical_high != null ? String(test.critical_high) : '',
    });
    setShowAddTest(true);
    setTestFormError('');
    setTestFormSuccess('');
  };

  const handleTestFormChange = (e) => setTestForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmitTest = async (e) => {
    e.preventDefault();
    if (!testForm.test_code || !testForm.test_name) {
      setTestFormError('Test Code and Name are required');
      return;
    }
    try {
      setTestSubmitting(true);
      setTestFormError('');
      setTestFormSuccess('');
      const payload = { ...testForm, lab_id: labId };
      if (editTest) {
        await apiFetch(`/api/v1/catalog/${editTest.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setTestFormSuccess('Test updated successfully');
      } else {
        await apiFetch('/api/v1/catalog', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setTestFormSuccess('Test added successfully');
      }
      setTestForm(EMPTY_TEST);
      setEditTest(null);
      setShowAddTest(false);
      fetchTests();
    } catch (err) {
      setTestFormError(err.message);
    } finally {
      setTestSubmitting(false);
    }
  };

  const handleSubmitPanel = async (e) => {
    e.preventDefault();
    if (!panelForm.panel_code || !panelForm.panel_name) {
      setPanelFormError('Panel Code and Name are required');
      return;
    }
    try {
      setPanelSubmitting(true);
      setPanelFormError('');
      setPanelFormSuccess('');
      await apiFetch('/api/v1/panels', {
        method: 'POST',
        body: JSON.stringify({ ...panelForm, lab_id: labId }),
      });
      setPanelFormSuccess('Panel created successfully');
      setPanelForm(EMPTY_PANEL);
      setShowAddPanel(false);
      fetchPanels();
    } catch (err) {
      setPanelFormError(err.message);
    } finally {
      setPanelSubmitting(false);
    }
  };

  const handleAddTestsToPanel = async () => {
    if (!addTestsPanel || selectedTestIds.length === 0) {
      setAddTestsError('Select at least one test');
      return;
    }
    try {
      setAddTestsLoading(true);
      setAddTestsError('');
      await apiFetch(`/api/v1/panels/${addTestsPanel.id}/tests`, {
        method: 'POST',
        body: JSON.stringify({ test_ids: selectedTestIds }),
      });
      setAddTestsPanel(null);
      setSelectedTestIds([]);
      fetchPanels();
    } catch (err) {
      setAddTestsError(err.message);
    } finally {
      setAddTestsLoading(false);
    }
  };

  const toggleSelectedTest = (id) => {
    setSelectedTestIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 20px', color: '#333', fontSize: 22 }}>Test Catalog & Panels</h2>

      {/* Section Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid #eee', paddingBottom: 10 }}>
        {[['catalog', 'Test Catalog'], ['panels', 'Panels']].map(([key, label]) => (
          <button key={key} onClick={() => setActiveSection(key)} style={{
            padding: '7px 18px', borderRadius: 4, border: '1px solid',
            borderColor: activeSection === key ? '#007bff' : '#ddd',
            background: activeSection === key ? '#e9f4ff' : 'white',
            color: activeSection === key ? '#007bff' : '#555',
            cursor: 'pointer', fontWeight: activeSection === key ? 600 : 400, fontSize: 14,
          }}>{label}</button>
        ))}
      </div>

      {/* Test Catalog */}
      {activeSection === 'catalog' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 14 }}>
            <button style={s.btnSecondary} onClick={fetchTests}><RefreshCw size={14} style={{ marginRight: 5 }} />Refresh</button>
            <button style={s.btnPrimary} onClick={() => { setShowAddTest(!showAddTest); setEditTest(null); setTestForm(EMPTY_TEST); setTestFormError(''); setTestFormSuccess(''); }}>
              <Plus size={14} style={{ marginRight: 5 }} />
              {showAddTest && !editTest ? 'Cancel' : 'Add Test'}
            </button>
          </div>

          {(showAddTest) && (
            <div style={s.card}>
              <h3 style={{ marginTop: 0, color: '#444' }}>{editTest ? `Edit: ${editTest.test_name}` : 'Add New Test'}</h3>
              {testFormError && <div style={s.alertDanger}>{testFormError}</div>}
              {testFormSuccess && <div style={s.alertSuccess}>{testFormSuccess}</div>}
              <form onSubmit={handleSubmitTest}>
                <div style={s.row}>
                  <div style={s.fg}>
                    <label style={s.label}>Test Code *</label>
                    <input style={s.input} name="test_code" value={testForm.test_code} onChange={handleTestFormChange} placeholder="HB" disabled={testSubmitting} />
                  </div>
                  <div style={{ ...s.fg, flex: 2 }}>
                    <label style={s.label}>Test Name *</label>
                    <input style={s.input} name="test_name" value={testForm.test_name} onChange={handleTestFormChange} placeholder="Hemoglobin" disabled={testSubmitting} />
                  </div>
                  <div style={s.fg}>
                    <label style={s.label}>Category</label>
                    <select style={s.input} name="category" value={testForm.category} onChange={handleTestFormChange} disabled={testSubmitting}>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={s.fg}>
                    <label style={s.label}>Sub Category</label>
                    <input style={s.input} name="sub_category" value={testForm.sub_category} onChange={handleTestFormChange} placeholder="CBC" disabled={testSubmitting} />
                  </div>
                </div>
                <div style={s.row}>
                  <div style={s.fg}>
                    <label style={s.label}>Specimen Type</label>
                    <select style={s.input} name="specimen_type" value={testForm.specimen_type} onChange={handleTestFormChange} disabled={testSubmitting}>
                      {SPECIMEN_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div style={s.fg}>
                    <label style={s.label}>Collection Method</label>
                    <input style={s.input} name="collection_method" value={testForm.collection_method} onChange={handleTestFormChange} placeholder="Venipuncture" disabled={testSubmitting} />
                  </div>
                  <div style={s.fg}>
                    <label style={s.label}>Volume (ml)</label>
                    <input style={s.input} type="number" step="0.1" name="sample_volume_ml" value={testForm.sample_volume_ml} onChange={handleTestFormChange} placeholder="3.0" disabled={testSubmitting} />
                  </div>
                  <div style={s.fg}>
                    <label style={s.label}>TAT (hours)</label>
                    <input style={s.input} type="number" name="turnaround_hours" value={testForm.turnaround_hours} onChange={handleTestFormChange} placeholder="24" disabled={testSubmitting} />
                  </div>
                </div>
                <div style={s.row}>
                  <div style={s.fg}>
                    <label style={s.label}>Price (₹)</label>
                    <input style={s.input} type="number" step="0.01" name="price" value={testForm.price} onChange={handleTestFormChange} placeholder="200" disabled={testSubmitting} />
                  </div>
                  <div style={s.fg}>
                    <label style={s.label}>Unit</label>
                    <input style={s.input} name="unit" value={testForm.unit} onChange={handleTestFormChange} placeholder="g/dL" disabled={testSubmitting} />
                  </div>
                  <div style={s.fg}>
                    <label style={s.label}>Ref Range Low</label>
                    <input style={s.input} type="number" step="any" name="reference_range_low" value={testForm.reference_range_low} onChange={handleTestFormChange} placeholder="12.0" disabled={testSubmitting} />
                  </div>
                  <div style={s.fg}>
                    <label style={s.label}>Ref Range High</label>
                    <input style={s.input} type="number" step="any" name="reference_range_high" value={testForm.reference_range_high} onChange={handleTestFormChange} placeholder="17.5" disabled={testSubmitting} />
                  </div>
                  <div style={s.fg}>
                    <label style={s.label}>Critical Low</label>
                    <input style={s.input} type="number" step="any" name="critical_low" value={testForm.critical_low} onChange={handleTestFormChange} placeholder="7.0" disabled={testSubmitting} />
                  </div>
                  <div style={s.fg}>
                    <label style={s.label}>Critical High</label>
                    <input style={s.input} type="number" step="any" name="critical_high" value={testForm.critical_high} onChange={handleTestFormChange} placeholder="20.0" disabled={testSubmitting} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="submit" style={s.btnPrimary} disabled={testSubmitting}>
                    <Check size={14} style={{ marginRight: 4 }} />
                    {testSubmitting ? 'Saving...' : editTest ? 'Update Test' : 'Add Test'}
                  </button>
                  <button type="button" style={s.btnSecondary} onClick={() => { setShowAddTest(false); setEditTest(null); }}>
                    <X size={14} style={{ marginRight: 4 }} />Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {testsError && <div style={s.alertDanger}>{testsError}</div>}
          {testsLoading ? (
            <div style={s.empty}>Loading catalog...</div>
          ) : tests.length === 0 ? (
            <div style={s.empty}>No tests in catalog</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr style={{ background: '#f5f6fa' }}>
                    {['Code', 'Name', 'Category', 'Specimen', 'TAT(h)', 'Price', 'Unit', 'Ref Range', 'Active', 'Edit'].map((h) => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tests.map((test) => (
                    <tr key={test.id} style={{ borderBottom: '1px solid #eee', opacity: test.is_active ? 1 : 0.5 }}>
                      <td style={{ ...s.td, fontFamily: 'monospace', fontWeight: 600 }}>{test.test_code}</td>
                      <td style={s.td}>{test.test_name}</td>
                      <td style={s.td}><span style={{ fontSize: 12, background: '#f0f0f0', borderRadius: 8, padding: '2px 7px' }}>{test.category}</span></td>
                      <td style={s.td}>{test.specimen_type}</td>
                      <td style={s.td}>{test.turnaround_hours ?? '—'}</td>
                      <td style={s.td}>{test.price != null ? `₹${test.price}` : '—'}</td>
                      <td style={s.td}>{test.unit || '—'}</td>
                      <td style={s.td}>{test.reference_range_low != null && test.reference_range_high != null ? `${test.reference_range_low}–${test.reference_range_high}` : '—'}</td>
                      <td style={s.td}>
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: test.is_active ? '#28a745' : '#aaa', padding: 0 }}
                          onClick={() => handleToggleActive(test)}
                          disabled={toggleLoadingId === test.id}
                          title={test.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {test.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                        </button>
                      </td>
                      <td style={s.td}>
                        <button style={s.btnSmall} onClick={() => openEditTest(test)}>
                          <Edit2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Panels */}
      {activeSection === 'panels' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 14 }}>
            <button style={s.btnSecondary} onClick={fetchPanels}><RefreshCw size={14} style={{ marginRight: 5 }} />Refresh</button>
            <button style={s.btnPrimary} onClick={() => { setShowAddPanel(!showAddPanel); setPanelFormError(''); setPanelFormSuccess(''); }}>
              <Plus size={14} style={{ marginRight: 5 }} />
              {showAddPanel ? 'Cancel' : 'Create Panel'}
            </button>
          </div>

          {showAddPanel && (
            <div style={s.card}>
              <h3 style={{ marginTop: 0 }}>Create New Panel</h3>
              {panelFormError && <div style={s.alertDanger}>{panelFormError}</div>}
              {panelFormSuccess && <div style={s.alertSuccess}>{panelFormSuccess}</div>}
              <form onSubmit={handleSubmitPanel}>
                <div style={s.row}>
                  <div style={s.fg}>
                    <label style={s.label}>Panel Code *</label>
                    <input style={s.input} name="panel_code" value={panelForm.panel_code} onChange={(e) => setPanelForm((p) => ({ ...p, panel_code: e.target.value }))} placeholder="CBC" disabled={panelSubmitting} />
                  </div>
                  <div style={{ ...s.fg, flex: 2 }}>
                    <label style={s.label}>Panel Name *</label>
                    <input style={s.input} name="panel_name" value={panelForm.panel_name} onChange={(e) => setPanelForm((p) => ({ ...p, panel_name: e.target.value }))} placeholder="Complete Blood Count" disabled={panelSubmitting} />
                  </div>
                  <div style={s.fg}>
                    <label style={s.label}>Price (₹)</label>
                    <input style={s.input} type="number" step="0.01" name="price" value={panelForm.price} onChange={(e) => setPanelForm((p) => ({ ...p, price: e.target.value }))} placeholder="500" disabled={panelSubmitting} />
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={s.label}>Description</label>
                  <textarea style={{ ...s.input, height: 70, resize: 'vertical' }} value={panelForm.description} onChange={(e) => setPanelForm((p) => ({ ...p, description: e.target.value }))} placeholder="Panel description..." disabled={panelSubmitting} />
                </div>
                <button type="submit" style={s.btnPrimary} disabled={panelSubmitting}>
                  <Check size={14} style={{ marginRight: 4 }} />
                  {panelSubmitting ? 'Creating...' : 'Create Panel'}
                </button>
              </form>
            </div>
          )}

          {panelsError && <div style={s.alertDanger}>{panelsError}</div>}
          {panelsLoading ? (
            <div style={s.empty}>Loading panels...</div>
          ) : panels.length === 0 ? (
            <div style={s.empty}>No panels defined yet</div>
          ) : (
            panels.map((panel) => (
              <div key={panel.id} style={{ ...s.card, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#333' }}>
                      <Layers size={16} style={{ marginRight: 6, verticalAlign: 'middle', color: '#007bff' }} />
                      {panel.panel_name}
                      <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#888', marginLeft: 8 }}>({panel.panel_code})</span>
                    </div>
                    {panel.description && <div style={{ color: '#666', fontSize: 14, marginTop: 4 }}>{panel.description}</div>}
                    {panel.price != null && <div style={{ color: '#007bff', fontWeight: 600, marginTop: 4 }}>₹{panel.price}</div>}
                  </div>
                  <button style={s.btnSmall} onClick={() => { setAddTestsPanel(panel); setSelectedTestIds([]); setAddTestsError(''); }}>
                    <Plus size={13} style={{ marginRight: 3 }} />Add Tests
                  </button>
                </div>
                {(panel.tests && panel.tests.length > 0) && (
                  <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {panel.tests.map((t) => (
                      <span key={t.id || t.test_code} style={{ background: '#e9f4ff', color: '#007bff', border: '1px solid #b3d9ff', borderRadius: 10, padding: '2px 10px', fontSize: 13 }}>
                        {t.test_name || t.test_code}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Add Tests to Panel Modal */}
      {addTestsPanel && (
        <div style={s.overlay} onClick={() => setAddTestsPanel(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>Add Tests to Panel: {addTestsPanel.panel_name}</h3>
              <button onClick={() => setAddTestsPanel(null)} style={s.iconBtn}><X size={18} /></button>
            </div>
            {addTestsError && <div style={s.alertDanger}>{addTestsError}</div>}
            <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: 10, maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
              {tests.length === 0 ? (
                <p style={{ color: '#999' }}>No tests available in catalog</p>
              ) : tests.map((test) => (
                <label key={test.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer', fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={selectedTestIds.includes(test.id)}
                    onChange={() => toggleSelectedTest(test.id)}
                  />
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#888', minWidth: 60 }}>{test.test_code}</span>
                  {test.test_name}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ ...s.btnPrimary, flex: 1, justifyContent: 'center' }} onClick={handleAddTestsToPanel} disabled={addTestsLoading}>
                {addTestsLoading ? 'Adding...' : `Add ${selectedTestIds.length} Tests`}
              </button>
              <button style={s.btnSecondary} onClick={() => setAddTestsPanel(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  card: { background: '#f9f9f9', border: '1px solid #ddd', borderRadius: 8, padding: 22, marginBottom: 20 },
  row: { display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 4 },
  fg: { flex: 1, minWidth: 150, marginBottom: 12 },
  label: { display: 'block', marginBottom: 4, fontWeight: 600, color: '#333', fontSize: 14 },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' },
  btnPrimary: { padding: '8px 16px', background: '#007bff', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 },
  btnSecondary: { padding: '8px 16px', background: 'white', color: '#555', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', fontWeight: 500, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 },
  btnSmall: { padding: '5px 12px', background: '#e9f0ff', color: '#007bff', border: '1px solid #b3cfff', borderRadius: 4, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center' },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: 4, display: 'flex', alignItems: 'center' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#555', fontSize: 13, borderBottom: '2px solid #eee' },
  td: { padding: '10px 12px', color: '#333' },
  empty: { textAlign: 'center', padding: 40, color: '#999', fontSize: 15 },
  alertDanger: { background: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb', borderRadius: 4, padding: '10px 14px', marginBottom: 14, fontSize: 14 },
  alertSuccess: { background: '#d4edda', color: '#155724', border: '1px solid #c3e6cb', borderRadius: 4, padding: '10px 14px', marginBottom: 14, fontSize: 14 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { background: 'white', borderRadius: 8, padding: 28, width: '90%', maxWidth: 520, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', maxHeight: '85vh', overflowY: 'auto' },
};

export default CatalogTab;
