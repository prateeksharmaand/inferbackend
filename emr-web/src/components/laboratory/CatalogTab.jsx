/**
 * CatalogTab - Manage Test Catalog & Panels
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Edit2, ToggleLeft, ToggleRight, X, Check, Layers, Download, Trash2 } from 'lucide-react';

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

export function CatalogTab({ labId, styles: s }) {
  const [activeSection, setActiveSection] = useState('catalog');

  const [tests, setTests] = useState([]);
  const [testsLoading, setTestsLoading] = useState(false);
  const [testsError, setTestsError] = useState('');
  const [showAddTest, setShowAddTest] = useState(false);
  const [editTest, setEditTest] = useState(null);
  const [testForm, setTestForm] = useState(EMPTY_TEST);
  const [testSubmitting, setTestSubmitting] = useState(false);
  const [testFormError, setTestFormError] = useState('');
  const [testFormSuccess, setTestFormSuccess] = useState('');
  const [toggleLoadingId, setToggleLoadingId] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const [panels, setPanels] = useState([]);
  const [panelsLoading, setPanelsLoading] = useState(false);
  const [panelsError, setPanelsError] = useState('');
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [panelForm, setPanelForm] = useState(EMPTY_PANEL);
  const [panelSubmitting, setPanelSubmitting] = useState(false);
  const [panelFormError, setPanelFormError] = useState('');
  const [panelFormSuccess, setPanelFormSuccess] = useState('');

  const [addTestsPanel, setAddTestsPanel] = useState(null);
  const [selectedTestIds, setSelectedTestIds] = useState([]);
  const [addTestsLoading, setAddTestsLoading] = useState(false);
  const [addTestsError, setAddTestsError] = useState('');

  const fetchTests = useCallback(async () => {
    try {
      setTestsLoading(true); setTestsError('');
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
      setPanelsLoading(true); setPanelsError('');
      const data = await apiFetch(`/api/v1/panels?lab_id=${labId}`);
      setPanels(data.panels || data || []);
    } catch (err) {
      setPanelsError(err.message);
    } finally {
      setPanelsLoading(false);
    }
  }, [labId]);

  useEffect(() => { fetchTests(); fetchPanels(); }, [fetchTests, fetchPanels]);

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
      test_code: test.test_code || '', test_name: test.test_name || '',
      category: test.category || 'HEMATOLOGY', sub_category: test.sub_category || '',
      specimen_type: test.specimen_type || 'BLOOD', collection_method: test.collection_method || '',
      sample_volume_ml: test.sample_volume_ml != null ? String(test.sample_volume_ml) : '',
      turnaround_hours: test.turnaround_hours != null ? String(test.turnaround_hours) : '',
      price: test.price != null ? String(test.price) : '',
      unit: test.unit || '',
      reference_range_low: test.reference_range_low != null ? String(test.reference_range_low) : '',
      reference_range_high: test.reference_range_high != null ? String(test.reference_range_high) : '',
      critical_low: test.critical_low != null ? String(test.critical_low) : '',
      critical_high: test.critical_high != null ? String(test.critical_high) : '',
    });
    setShowAddTest(true); setTestFormError(''); setTestFormSuccess('');
  };

  const handleTestFormChange = (e) => setTestForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmitTest = async (e) => {
    e.preventDefault();
    if (!testForm.test_code || !testForm.test_name) { setTestFormError('Test Code and Name are required'); return; }
    try {
      setTestSubmitting(true); setTestFormError(''); setTestFormSuccess('');
      const payload = { ...testForm, lab_id: labId };
      if (editTest) {
        await apiFetch(`/api/v1/catalog/${editTest.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setTestFormSuccess('Test updated successfully');
      } else {
        await apiFetch('/api/v1/catalog', { method: 'POST', body: JSON.stringify(payload) });
        setTestFormSuccess('Test added successfully');
      }
      setTestForm(EMPTY_TEST); setEditTest(null); setShowAddTest(false);
      fetchTests();
    } catch (err) {
      setTestFormError(err.message);
    } finally {
      setTestSubmitting(false);
    }
  };

  const handleSubmitPanel = async (e) => {
    e.preventDefault();
    if (!panelForm.panel_code || !panelForm.panel_name) { setPanelFormError('Panel Code and Name are required'); return; }
    try {
      setPanelSubmitting(true); setPanelFormError(''); setPanelFormSuccess('');
      await apiFetch('/api/v1/panels', { method: 'POST', body: JSON.stringify({ ...panelForm, lab_id: labId }) });
      setPanelFormSuccess('Panel created successfully');
      setPanelForm(EMPTY_PANEL); setShowAddPanel(false);
      fetchPanels();
    } catch (err) {
      setPanelFormError(err.message);
    } finally {
      setPanelSubmitting(false);
    }
  };

  const handleAddTestsToPanel = async () => {
    if (!addTestsPanel || selectedTestIds.length === 0) { setAddTestsError('Select at least one test'); return; }
    try {
      setAddTestsLoading(true); setAddTestsError('');
      await apiFetch(`/api/v1/panels/${addTestsPanel.id}/tests`, {
        method: 'POST',
        body: JSON.stringify({ test_ids: selectedTestIds }),
      });
      setAddTestsPanel(null); setSelectedTestIds([]);
      fetchPanels();
    } catch (err) {
      setAddTestsError(err.message);
    } finally {
      setAddTestsLoading(false);
    }
  };

  const toggleSelectedTest = (id) => setSelectedTestIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleSeedStandard = async () => {
    if (!window.confirm('Import ~100 standard Indian lab tests and 12 panels? Existing tests with the same code will be skipped.')) return;
    try {
      setSeeding(true);
      const data = await apiFetch('/api/v1/catalog/seed', { method: 'POST' });
      alert(`✓ Imported ${data.tests_added} tests (${data.tests_skipped} skipped) and ${data.panels_added} panels.`);
      fetchTests(); fetchPanels();
    } catch (err) {
      alert('Import failed: ' + err.message);
    } finally {
      setSeeding(false);
    }
  };

  const handleRemoveTestFromPanel = async (panelId, testId) => {
    if (!window.confirm('Remove this test from the panel?')) return;
    try {
      await apiFetch(`/api/v1/panels/${panelId}/tests/${testId}`, { method: 'DELETE' });
      fetchPanels();
    } catch (err) {
      alert('Failed: ' + err.message);
    }
  };

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Test Catalog & Panels</div>
          <div className={s.pageSubtitle}>Manage available tests and test panels</div>
        </div>
      </div>

      <div className={s.sectionTabs}>
        {[['catalog', 'Test Catalog'], ['panels', 'Panels']].map(([key, label]) => (
          <button key={key} className={`${s.sectionTab} ${activeSection === key ? s.sectionTabActive : ''}`} onClick={() => setActiveSection(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* Test Catalog */}
      {activeSection === 'catalog' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <button className={`${s.btn} ${s.btnSecondary}`} onClick={fetchTests}><RefreshCw size={14} /> Refresh</button>
            <button className={`${s.btn} ${s.btnSecondary}`} onClick={handleSeedStandard} disabled={seeding} style={{ color: '#6d28d9', borderColor: '#6d28d9' }}>
              <Download size={14} /> {seeding ? 'Importing…' : 'Import Standard Tests'}
            </button>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => { setShowAddTest(!showAddTest); setEditTest(null); setTestForm(EMPTY_TEST); setTestFormError(''); setTestFormSuccess(''); }}>
              <Plus size={14} /> {showAddTest && !editTest ? 'Cancel' : 'Add Test'}
            </button>
          </div>

          {showAddTest && (
            <div className={s.card} style={{ marginBottom: 16 }}>
              <div className={s.cardHeader}>
                <div className={s.cardTitle}>{editTest ? `Edit: ${editTest.test_name}` : 'Add New Test'}</div>
              </div>
              <div className={s.cardBody}>
                {testFormError && <div className={`${s.alert} ${s.alertError}`}>{testFormError}</div>}
                {testFormSuccess && <div className={`${s.alert} ${s.alertSuccess}`}>{testFormSuccess}</div>}
                <form onSubmit={handleSubmitTest}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div className={s.field}><label className={s.label}>Test Code *</label><input className={s.input} name="test_code" value={testForm.test_code} onChange={handleTestFormChange} placeholder="HB" disabled={testSubmitting} /></div>
                    <div className={s.field}><label className={s.label}>Test Name *</label><input className={s.input} name="test_name" value={testForm.test_name} onChange={handleTestFormChange} placeholder="Hemoglobin" disabled={testSubmitting} /></div>
                    <div className={s.field}><label className={s.label}>Category</label><select className={s.select} name="category" value={testForm.category} onChange={handleTestFormChange} disabled={testSubmitting}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
                    <div className={s.field}><label className={s.label}>Sub Category</label><input className={s.input} name="sub_category" value={testForm.sub_category} onChange={handleTestFormChange} placeholder="CBC" disabled={testSubmitting} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div className={s.field}><label className={s.label}>Specimen Type</label><select className={s.select} name="specimen_type" value={testForm.specimen_type} onChange={handleTestFormChange} disabled={testSubmitting}>{SPECIMEN_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
                    <div className={s.field}><label className={s.label}>Collection Method</label><input className={s.input} name="collection_method" value={testForm.collection_method} onChange={handleTestFormChange} placeholder="Venipuncture" disabled={testSubmitting} /></div>
                    <div className={s.field}><label className={s.label}>Volume (ml)</label><input className={s.input} type="number" step="0.1" name="sample_volume_ml" value={testForm.sample_volume_ml} onChange={handleTestFormChange} placeholder="3.0" disabled={testSubmitting} /></div>
                    <div className={s.field}><label className={s.label}>TAT (hours)</label><input className={s.input} type="number" name="turnaround_hours" value={testForm.turnaround_hours} onChange={handleTestFormChange} placeholder="24" disabled={testSubmitting} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div className={s.field}><label className={s.label}>Price (₹)</label><input className={s.input} type="number" step="0.01" name="price" value={testForm.price} onChange={handleTestFormChange} placeholder="200" disabled={testSubmitting} /></div>
                    <div className={s.field}><label className={s.label}>Unit</label><input className={s.input} name="unit" value={testForm.unit} onChange={handleTestFormChange} placeholder="g/dL" disabled={testSubmitting} /></div>
                    <div className={s.field}><label className={s.label}>Ref Low</label><input className={s.input} type="number" step="any" name="reference_range_low" value={testForm.reference_range_low} onChange={handleTestFormChange} placeholder="12.0" disabled={testSubmitting} /></div>
                    <div className={s.field}><label className={s.label}>Ref High</label><input className={s.input} type="number" step="any" name="reference_range_high" value={testForm.reference_range_high} onChange={handleTestFormChange} placeholder="17.5" disabled={testSubmitting} /></div>
                    <div className={s.field}><label className={s.label}>Critical Low</label><input className={s.input} type="number" step="any" name="critical_low" value={testForm.critical_low} onChange={handleTestFormChange} placeholder="7.0" disabled={testSubmitting} /></div>
                    <div className={s.field}><label className={s.label}>Critical High</label><input className={s.input} type="number" step="any" name="critical_high" value={testForm.critical_high} onChange={handleTestFormChange} placeholder="20.0" disabled={testSubmitting} /></div>
                  </div>
                  <div className={s.formActions}>
                    <button type="button" className={`${s.btn} ${s.btnSecondary}`} onClick={() => { setShowAddTest(false); setEditTest(null); }}>
                      <X size={14} /> Cancel
                    </button>
                    <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={testSubmitting}>
                      <Check size={14} /> {testSubmitting ? 'Saving...' : editTest ? 'Update Test' : 'Add Test'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {testsError && <div className={`${s.alert} ${s.alertError}`}>{testsError}</div>}
          <div className={s.card}>
            {testsLoading ? (
              <div className={s.emptyState}><div className={s.emptyText}>Loading catalog...</div></div>
            ) : tests.length === 0 ? (
              <div className={s.emptyState}><div className={s.emptyText}>No tests in catalog</div></div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>{['Code', 'Name', 'Category', 'Specimen', 'TAT(h)', 'Price', 'Unit', 'Ref Range', 'Active', ''].map((h) => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {tests.map((test) => (
                      <tr key={test.id} style={{ opacity: test.is_active ? 1 : 0.5 }}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{test.test_code}</td>
                        <td>{test.test_name}</td>
                        <td><span className={`${s.badge} ${s.badgeBlue}`}>{test.category}</span></td>
                        <td>{test.specimen_type}</td>
                        <td>{test.turnaround_hours ?? '—'}</td>
                        <td>{test.price != null ? `₹${test.price}` : '—'}</td>
                        <td>{test.unit || '—'}</td>
                        <td>{test.reference_range_low != null && test.reference_range_high != null ? `${test.reference_range_low}–${test.reference_range_high}` : '—'}</td>
                        <td>
                          <button
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: test.is_active ? 'var(--color-success)' : 'var(--color-text-3)', padding: 0, display: 'flex' }}
                            onClick={() => handleToggleActive(test)}
                            disabled={toggleLoadingId === test.id}
                          >
                            {test.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                          </button>
                        </td>
                        <td>
                          <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`} onClick={() => openEditTest(test)}>
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
        </div>
      )}

      {/* Panels */}
      {activeSection === 'panels' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 14 }}>
            <button className={`${s.btn} ${s.btnSecondary}`} onClick={fetchPanels}><RefreshCw size={14} /> Refresh</button>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => { setShowAddPanel(!showAddPanel); setPanelFormError(''); setPanelFormSuccess(''); }}>
              <Plus size={14} /> {showAddPanel ? 'Cancel' : 'Create Panel'}
            </button>
          </div>

          {showAddPanel && (
            <div className={s.card} style={{ marginBottom: 16 }}>
              <div className={s.cardHeader}><div className={s.cardTitle}>Create New Panel</div></div>
              <div className={s.cardBody}>
                {panelFormError && <div className={`${s.alert} ${s.alertError}`}>{panelFormError}</div>}
                {panelFormSuccess && <div className={`${s.alert} ${s.alertSuccess}`}>{panelFormSuccess}</div>}
                <form onSubmit={handleSubmitPanel}>
                  <div className={s.formGrid3} style={{ marginBottom: 12 }}>
                    <div className={s.field}><label className={s.label}>Panel Code *</label><input className={s.input} name="panel_code" value={panelForm.panel_code} onChange={(e) => setPanelForm((p) => ({ ...p, panel_code: e.target.value }))} placeholder="CBC" disabled={panelSubmitting} /></div>
                    <div className={s.field}><label className={s.label}>Panel Name *</label><input className={s.input} name="panel_name" value={panelForm.panel_name} onChange={(e) => setPanelForm((p) => ({ ...p, panel_name: e.target.value }))} placeholder="Complete Blood Count" disabled={panelSubmitting} /></div>
                    <div className={s.field}><label className={s.label}>Price (₹)</label><input className={s.input} type="number" step="0.01" value={panelForm.price} onChange={(e) => setPanelForm((p) => ({ ...p, price: e.target.value }))} placeholder="500" disabled={panelSubmitting} /></div>
                  </div>
                  <div className={s.field} style={{ marginBottom: 14 }}>
                    <label className={s.label}>Description</label>
                    <textarea className={s.textarea} value={panelForm.description} onChange={(e) => setPanelForm((p) => ({ ...p, description: e.target.value }))} placeholder="Panel description..." disabled={panelSubmitting} style={{ minHeight: 70 }} />
                  </div>
                  <div className={s.formActions}>
                    <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={panelSubmitting}>
                      <Check size={14} /> {panelSubmitting ? 'Creating...' : 'Create Panel'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {panelsError && <div className={`${s.alert} ${s.alertError}`}>{panelsError}</div>}
          {panelsLoading ? (
            <div className={s.emptyState}><div className={s.emptyText}>Loading panels...</div></div>
          ) : panels.length === 0 ? (
            <div className={s.emptyState}><div className={s.emptyText}>No panels defined yet</div></div>
          ) : (
            panels.map((panel) => (
              <div key={panel.id} className={s.card} style={{ marginBottom: 12 }}>
                <div className={s.cardBody}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Layers size={16} color="var(--color-primary)" />
                        {panel.panel_name}
                        <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text-3)' }}>({panel.panel_code})</span>
                      </div>
                      {panel.description && <div style={{ color: 'var(--color-text-2)', fontSize: 13, marginTop: 4 }}>{panel.description}</div>}
                      {panel.price != null && <div style={{ color: 'var(--color-primary)', fontWeight: 600, marginTop: 4 }}>₹{panel.price}</div>}
                    </div>
                    <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`} onClick={() => { setAddTestsPanel(panel); setSelectedTestIds([]); setAddTestsError(''); }}>
                      <Plus size={13} /> Add Tests
                    </button>
                  </div>
                  {Array.isArray(panel.tests) && panel.tests.length > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {panel.tests.map((t) => (
                        <span key={t.id || t.test_code} style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#dbeafe', color:'#1e40af', borderRadius:12, padding:'2px 8px', fontSize:12, fontWeight:600 }}>
                          {t.test_name || t.test_code}
                          <button onClick={() => handleRemoveTestFromPanel(panel.id, t.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#1e40af', padding:0, display:'flex', opacity:0.7 }} title="Remove">
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {(!panel.tests || panel.tests.length === 0) && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-2)' }}>No tests added yet. Click "Add Tests" to select from catalog.</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add Tests to Panel Modal */}
      {addTestsPanel && (
        <div className={s.modalOverlay} onClick={() => setAddTestsPanel(null)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <div className={s.modalTitle}>Add Tests to: {addTestsPanel.panel_name}</div>
              <button className={s.modalClose} onClick={() => setAddTestsPanel(null)}><X size={18} /></button>
            </div>
            <div className={s.modalBody}>
              {addTestsError && <div className={`${s.alert} ${s.alertError}`}>{addTestsError}</div>}
              <div className={s.scrollBox} style={{ maxHeight: 300, marginBottom: 16 }}>
                {tests.length === 0 ? (
                  <p style={{ color: 'var(--color-text-3)', fontSize: 13 }}>No tests available in catalog</p>
                ) : tests.map((test) => (
                  <label key={test.id} className={s.checkLabel}>
                    <input type="checkbox" checked={selectedTestIds.includes(test.id)} onChange={() => toggleSelectedTest(test.id)} />
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-3)', minWidth: 60 }}>{test.test_code}</span>
                    {test.test_name}
                  </label>
                ))}
              </div>
            </div>
            <div className={s.modalFooter}>
              <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => setAddTestsPanel(null)}>Cancel</button>
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleAddTestsToPanel} disabled={addTestsLoading}>
                {addTestsLoading ? 'Adding...' : `Add ${selectedTestIds.length} Tests`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CatalogTab;
