import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Trash2, X, Settings, ChevronDown, ChevronUp,
  BookOpen, LayoutTemplate, Clock, Search, Utensils,
} from 'lucide-react';
import { api } from '../api/client';
import { INDIAN_FOODS, searchFoods } from '../data/indianFoods';
import s from './DietChartTab.module.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const STANDARD_GROUPS = [
  'Animal Foods','Beverages','Vegetable','Cereals & Millets','Dairy Products',
  'Fruits','Green Leafy Vegetables','Mushrooms','Nuts & Seeds','Oils & Fats',
  'Other','Pickles & Preserves','Processed Foods','Pulses & Legumes',
  'Roots & Tubers','Snacks & Sweets','Soups & Broths','Spices & Condiments',
  'Sugar & Jaggery','Vegetables','Nuts',
];

const DEFAULT_MEALS = ['Breakfast','Mid-Morning','Lunch','Evening Snack','Dinner'];

const SERVING_SIZES = [
  // Weight
  '100 g','50 g','25 g','200 g','250 g','500 g','1 kg',
  // Volume
  '100 ml','150 ml','200 ml','250 ml','500 ml','1 L',
  // Cups & spoons
  '1 cup','½ cup','¼ cup','2 cups',
  '1 tbsp','2 tbsp','3 tbsp','1 tsp','2 tsp',
  // Indian measures
  '1 katori','2 katori','½ katori',
  '1 bowl','1 small bowl','1 large bowl',
  '1 plate','1 thali',
  '1 glass','1 small glass','1 large glass',
  // Pieces / units
  '1 piece','2 pieces','3 pieces','4 pieces','5 pieces',
  '1 slice','2 slices','1 medium','1 large','1 small',
  '1 whole','½ whole','¼ whole',
  // Handfuls
  '1 handful','2 handfuls','1 small handful',
  // Servings
  '1 serving','2 servings',
];

const MACRO_FIELDS = [
  { key: 'energy',          label: 'Energy',         unit: 'kcal' },
  { key: 'protein',         label: 'Protein',         unit: 'g' },
  { key: 'total_fat',       label: 'Total Fat',       unit: 'g' },
  { key: 'carbohydrates',   label: 'Carbohydrates',   unit: 'g' },
  { key: 'dietary_fibre',   label: 'Dietary Fibre',   unit: 'g' },
];

const VITAMIN_FIELDS = [
  { key: 'beta_carotene',   label: 'Beta-Carotene',       unit: 'mcg' },
  { key: 'vitamin_a',       label: 'Vitamin A (RAE)',      unit: 'mcg' },
  { key: 'vitamin_b1',      label: 'Thiamine (B1)',        unit: 'mg' },
  { key: 'vitamin_b2',      label: 'Riboflavin (B2)',      unit: 'mg' },
  { key: 'vitamin_b3',      label: 'Niacin (B3)',          unit: 'mg' },
  { key: 'vitamin_b5',      label: 'Pantothenic Acid (B5)',unit: 'mg' },
  { key: 'vitamin_b6',      label: 'Pyridoxine (B6)',      unit: 'mg' },
  { key: 'vitamin_b7',      label: 'Biotin (B7)',          unit: 'mcg' },
  { key: 'vitamin_b9',      label: 'Folate (B9)',          unit: 'mcg' },
  { key: 'vitamin_b12',     label: 'Vitamin B12',          unit: 'mcg' },
  { key: 'vitamin_c',       label: 'Vitamin C',            unit: 'mg' },
  { key: 'vitamin_d',       label: 'Vitamin D',            unit: 'mcg' },
  { key: 'vitamin_e',       label: 'Vitamin E',            unit: 'mg' },
  { key: 'vitamin_k',       label: 'Vitamin K',            unit: 'mcg' },
];

const MINERAL_FIELDS = [
  { key: 'calcium',         label: 'Calcium',     unit: 'mg' },
  { key: 'phosphorus',      label: 'Phosphorus',  unit: 'mg' },
  { key: 'iron',            label: 'Iron',        unit: 'mg' },
  { key: 'sodium',          label: 'Sodium',      unit: 'mg' },
  { key: 'potassium',       label: 'Potassium',   unit: 'mg' },
  { key: 'magnesium',       label: 'Magnesium',   unit: 'mg' },
  { key: 'zinc',            label: 'Zinc',        unit: 'mg' },
  { key: 'copper',          label: 'Copper',      unit: 'mg' },
  { key: 'manganese',       label: 'Manganese',   unit: 'mg' },
  { key: 'selenium',        label: 'Selenium',    unit: 'mcg' },
  { key: 'iodine',          label: 'Iodine',      unit: 'mcg' },
  { key: 'chromium',        label: 'Chromium',    unit: 'mcg' },
];

function uid() { return Math.random().toString(36).slice(2, 9); }

function todayStr() { return new Date().toISOString().slice(0, 10); }

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Extract leading numeric from serving string, e.g. "2 cups" → 2, "½ cup" → 0.5
function parseServingQty(serving) {
  if (!serving) return 1;
  const s = serving.trim();
  if (s.startsWith('½') || s.startsWith('1/2')) return 0.5;
  if (s.startsWith('¼') || s.startsWith('1/4')) return 0.25;
  const m = s.match(/^(\d+(\.\d+)?)/);
  return m ? parseFloat(m[1]) : 1;
}

function calcNutrition(dayPlans) {
  const totals = { energy: 0, protein: 0, total_fat: 0, carbohydrates: 0, dietary_fibre: 0 };
  dayPlans.forEach(dp => {
    dp.meals.forEach(meal => {
      meal.food_items.forEach(item => {
        // Scale by ratio of current serving qty vs base serving qty
        const baseQty    = parseServingQty(item._base_serving || item.serving_size);
        const currentQty = parseServingQty(item.serving_size);
        const scale = baseQty > 0 ? currentQty / baseQty : 1;
        MACRO_FIELDS.forEach(f => {
          totals[f.key] = (totals[f.key] || 0) + parseFloat(item.nutrition?.[f.key] || 0) * scale;
        });
      });
    });
  });
  return totals;
}

// ── Small modals ──────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal} style={{ width }}>
        <div className={s.modalHeader}>
          <span className={s.modalTitle}>{title}</span>
          <button className={s.modalClose} onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NutritionTargetsModal({ targets, onSave, onClose }) {
  const [vals, setVals] = useState({ ...targets });
  return (
    <Modal title="Nutrition Targets / per day plan" onClose={onClose} width={520}>
      <div className={s.modalBody}>
        <div className={s.infoBar}>
          ℹ️ To enable calculate nutrition target from vitals, fill Height &amp; Weight on Rx Pad.
        </div>
        <div className={s.nutriGrid}>
          {MACRO_FIELDS.map(f => (
            <div key={f.key} className={s.nutriField}>
              <label>{f.label}</label>
              <div className={s.nutriInput}>
                <input type="number" placeholder="0" value={vals[f.key] || ''}
                  onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))} />
                <span>{f.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={s.modalFooter}>
        <button className={s.btnOutline} onClick={() => setVals({})}>Reset</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={s.btnGhost} onClick={onClose}>Cancel</button>
          <button className={s.btnPrimary} onClick={() => onSave(vals)}>Save</button>
        </div>
      </div>
    </Modal>
  );
}

function DietDurationModal({ startDate, duration, onSave, onClose }) {
  const [start, setStart] = useState(startDate || todayStr());
  const [dur, setDur] = useState(duration || '');

  function calcEnd() {
    if (!start || !dur) return null;
    const weeks = dur.match(/(\d+)\s*w/i);
    const days  = dur.match(/(\d+)\s*d/i);
    let totalDays = 0;
    if (weeks) totalDays += parseInt(weeks[1]) * 7;
    if (days)  totalDays += parseInt(days[1]);
    if (!totalDays) return null;
    const d = new Date(start);
    d.setDate(d.getDate() + totalDays);
    return d.toISOString().slice(0, 10);
  }

  const end = calcEnd();
  return (
    <Modal title="Diet duration" onClose={onClose} width={400}>
      <div className={s.modalBody}>
        <div className={s.formRow}>
          <label>Start Date</label>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} className={s.dateInput} />
        </div>
        <div className={s.formRow}>
          <label>Duration</label>
          <input placeholder="e.g., 2 weeks" value={dur} onChange={e => setDur(e.target.value)} className={s.textInput} />
          <span className={s.endLabel}>End Date</span>
          <span className={s.endVal}>{end ? fmtDate(end) : '—'}</span>
        </div>
      </div>
      <div className={s.modalFooter}>
        <button className={s.btnOutline} onClick={() => { setStart(todayStr()); setDur(''); }}>Reset</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={s.btnGhost} onClick={onClose}>Cancel</button>
          <button className={s.btnPrimary} onClick={() => onSave({ start_date: start, duration: dur, end_date: end })}>Save</button>
        </div>
      </div>
    </Modal>
  );
}

function FoodGroupsModal({ selected, onSave, onClose }) {
  const [sel, setSel] = useState(new Set(selected || []));
  const toggle = g => setSel(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  return (
    <Modal title="Preferred Food Groups" onClose={onClose} width={560}>
      <div className={s.modalBody}>
        <p className={s.hint}>If none selected, all items will be shown.</p>
        <div className={s.chipWrap}>
          {STANDARD_GROUPS.map(g => (
            <button key={g} className={`${s.chip} ${sel.has(g) ? s.chipActive : ''}`}
              onClick={() => toggle(g)}>{g}</button>
          ))}
        </div>
      </div>
      <div className={s.modalFooter}>
        <button className={s.btnOutline} onClick={() => setSel(new Set())}>Reset</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={s.btnGhost} onClick={onClose}>Cancel</button>
          <button className={s.btnPrimary} onClick={() => onSave([...sel])}>Done</button>
        </div>
      </div>
    </Modal>
  );
}

function SaveTemplateModal({ onSave, onClose }) {
  const [name, setName] = useState('');
  return (
    <Modal title="Save as Template" onClose={onClose} width={380}>
      <div className={s.modalBody}>
        <div className={s.formRow}>
          <label>Template Name</label>
          <input placeholder="e.g., Diabetic Diet Plan" value={name}
            onChange={e => setName(e.target.value)} className={s.textInput} />
        </div>
      </div>
      <div className={s.modalFooter}>
        <button className={s.btnGhost} onClick={onClose}>Cancel</button>
        <button className={s.btnPrimary} disabled={!name.trim()} onClick={() => onSave(name.trim())}>Save</button>
      </div>
    </Modal>
  );
}

// ── Add Food Item Modal ───────────────────────────────────────────────────────

function AddFoodItemModal({ allGroups, editItem, onSave, onClose }) {
  const [form, setForm] = useState(editItem || {
    name: '', group_name: '', serving_size: '', nutrition: {}
  });
  const [showExtra, setShowExtra] = useState(false);
  const [customServing, setCustomServing] = useState(
    editItem?.serving_size && !SERVING_SIZES.includes(editItem.serving_size)
  );
  const [suggestions, setSuggestions] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const nameRef = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setN = (k, v) => setForm(f => ({ ...f, nutrition: { ...f.nutrition, [k]: v } }));

  function handleNameChange(val) {
    set('name', val);
    const results = searchFoods(val);
    setSuggestions(results);
    setShowSugg(results.length > 0);
  }

  function applySuggestion(food) {
    setForm(f => ({
      ...f,
      name: food.name,
      group_name: food.group || f.group_name,
      serving_size: food.serving || f.serving_size,
      nutrition: { ...food.nutrition },
    }));
    setCustomServing(!SERVING_SIZES.includes(food.serving));
    setSuggestions([]);
    setShowSugg(false);
  }

  return (
    <Modal title={editItem ? 'Edit Food Item' : 'Add Food Item'} onClose={onClose} width={700}>
      <div className={s.modalBody} style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <div className={s.formCol}>
          <div className={s.formField} style={{ position: 'relative' }} ref={nameRef}>
            <label>Name</label>
            <input placeholder="e.g., Brown Rice, Idli, Dal Tadka…" value={form.name}
              onChange={e => handleNameChange(e.target.value)}
              onFocus={() => suggestions.length && setShowSugg(true)}
              onBlur={() => setTimeout(() => setShowSugg(false), 150)}
              className={s.textInput} autoComplete="off" />
            {showSugg && (
              <div className={s.foodDropdown} style={{ top: '100%' }}>
                {suggestions.map(food => (
                  <div key={food.name} className={s.foodOption} onMouseDown={() => applySuggestion(food)}>
                    <span className={s.foodOptionName}>{food.name}</span>
                    <span className={s.foodOptionMeta}>{food.serving} · {food.group}</span>
                    <span className={s.foodOptionKcal}>{food.nutrition.energy} kcal</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className={s.formField}>
            <label>Food Group</label>
            <select value={form.group_name} onChange={e => set('group_name', e.target.value)} className={s.textInput}>
              <option value="">Select food group</option>
              {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className={s.formField}>
            <label>Serving size</label>
            {customServing ? (
              <div className={s.servingCustomRow}>
                <input placeholder="e.g., 2 rotis" value={form.serving_size}
                  onChange={e => set('serving_size', e.target.value)} className={s.textInput} />
                <button className={s.btnGhost} onClick={() => { setCustomServing(false); set('serving_size', ''); }}>
                  ← Pick from list
                </button>
              </div>
            ) : (
              <div className={s.servingCustomRow}>
                <select value={form.serving_size} onChange={e => set('serving_size', e.target.value)} className={s.textInput}>
                  <option value="">Select serving size</option>
                  {SERVING_SIZES.map(sz => <option key={sz} value={sz}>{sz}</option>)}
                </select>
                <button className={s.btnGhost} onClick={() => setCustomServing(true)}>
                  Custom
                </button>
              </div>
            )}
          </div>
        </div>

        <div className={s.sectionLabel}>Macros</div>
        <div className={s.nutriGrid}>
          {MACRO_FIELDS.map(f => (
            <div key={f.key} className={s.nutriField}>
              <label>{f.label} ({f.unit})</label>
              <input type="number" placeholder="0" value={form.nutrition[f.key] || ''}
                onChange={e => setN(f.key, e.target.value)} className={s.textInput} />
            </div>
          ))}
        </div>

        <button className={s.btnExtraNutrients} onClick={() => setShowExtra(x => !x)}>
          {showExtra ? '▲ Hide extra nutrients' : '▼ Show extra nutrients'}
        </button>

        {showExtra && (
          <>
            <div className={s.sectionLabel} style={{ marginTop: 12 }}>Vitamins</div>
            <div className={s.nutriGrid}>
              {VITAMIN_FIELDS.map(f => (
                <div key={f.key} className={s.nutriField}>
                  <label>{f.label} ({f.unit})</label>
                  <input type="number" placeholder="0" value={form.nutrition[f.key] || ''}
                    onChange={e => setN(f.key, e.target.value)} className={s.textInput} />
                </div>
              ))}
            </div>
            <div className={s.sectionLabel} style={{ marginTop: 12 }}>Minerals</div>
            <div className={s.nutriGrid}>
              {MINERAL_FIELDS.map(f => (
                <div key={f.key} className={s.nutriField}>
                  <label>{f.label} ({f.unit})</label>
                  <input type="number" placeholder="0" value={form.nutrition[f.key] || ''}
                    onChange={e => setN(f.key, e.target.value)} className={s.textInput} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className={s.modalFooter}>
        <button className={s.btnGhost} onClick={onClose}>Cancel</button>
        <button className={s.btnPrimary} disabled={!form.name.trim()} onClick={() => onSave(form)}>
          {editItem ? 'Update Item' : 'Add Item'}
        </button>
      </div>
    </Modal>
  );
}

// ── Custom Food Library Modal ─────────────────────────────────────────────────

function AddGroupModal({ onSave, onClose }) {
  const [name, setName] = useState('');
  return (
    <Modal title="Add Group" onClose={onClose} width={340}>
      <div className={s.modalBody}>
        <div className={s.formField}>
          <label>Group Name</label>
          <input placeholder="e.g., Nuts & Seeds" value={name}
            onChange={e => setName(e.target.value)} className={s.textInput} />
        </div>
      </div>
      <div className={s.modalFooter}>
        <button className={s.btnGhost} onClick={onClose}>Cancel</button>
        <button className={s.btnPrimary} disabled={!name.trim()} onClick={() => onSave(name.trim())}>Add Group</button>
      </div>
    </Modal>
  );
}

function CustomFoodLibraryModal({ onClose }) {
  const [libTab, setLibTab]     = useState('standard'); // 'standard' | 'custom'
  const [items, setItems]       = useState([]);
  const [groups, setGroups]     = useState([]);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showAddItem, setShowAddItem]   = useState(false);
  const [search, setSearch]     = useState('');
  const [error, setError]       = useState('');

  const reload = () => {
    api.get('/diet/food-items').then(setItems).catch(e => setError(e.message));
    api.get('/diet/food-groups').then(r => setGroups(r.map(g => g.name))).catch(() => {});
  };

  useEffect(() => { reload(); }, []);

  const allGroups = [...new Set([...STANDARD_GROUPS, ...groups])];

  async function handleAddGroup(name) {
    try {
      await api.post('/diet/food-groups', { name });
      const r = await api.get('/diet/food-groups');
      setGroups(r.map(g => g.name));
      setShowAddGroup(false);
    } catch (e) { setError(e.message); }
  }

  async function handleSaveItem(form) {
    setError('');
    try {
      if (editItem?.id) {
        const updated = await api.put(`/diet/food-items/${editItem.id}`, form);
        setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
      } else {
        const created = await api.post('/diet/food-items', form);
        setItems(prev => [...prev, created]);
      }
      invalidateCustomCache();
      setShowAddItem(false);
      setEditItem(null);
    } catch (e) { setError(e.message); }
  }

  async function handleDeleteItem(id) {
    try {
      await api.delete(`/diet/food-items/${id}`);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e) { setError(e.message); }
  }

  // Standard library filtered from static Indian foods
  const stdFiltered = INDIAN_FOODS.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );
  const stdByGroup = STANDARD_GROUPS.reduce((acc, g) => {
    const list = stdFiltered.filter(f => f.group === g);
    if (list.length) acc[g] = list;
    return acc;
  }, {});

  // Custom items from DB
  const filtered  = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const byGroup   = allGroups.reduce((acc, g) => {
    const list = filtered.filter(i => i.group_name === g);
    if (list.length) acc[g] = list;
    return acc;
  }, {});
  const ungrouped = filtered.filter(i => !i.group_name);

  return (
    <>
      <Modal title="Food Library" onClose={onClose} width={720}>
        <div className={s.modalBody} style={{ maxHeight: '68vh', overflowY: 'auto' }}>

          {/* Tab switcher */}
          <div className={s.libTabs}>
            <button className={`${s.libTabBtn} ${libTab === 'standard' ? s.libTabActive : ''}`}
              onClick={() => setLibTab('standard')}>
              Standard Library <span className={s.libCount}>{INDIAN_FOODS.length}</span>
            </button>
            <button className={`${s.libTabBtn} ${libTab === 'custom' ? s.libTabActive : ''}`}
              onClick={() => setLibTab('custom')}>
              My Custom Items <span className={s.libCount}>{items.length}</span>
            </button>
          </div>

          <div className={s.libToolbar}>
            <div className={s.searchWrap}>
              <Search size={14} />
              <input placeholder="Search…" value={search}
                onChange={e => setSearch(e.target.value)} />
            </div>
            {libTab === 'custom' && (
              <>
                <button className={s.btnOutline} onClick={() => setShowAddGroup(true)}>
                  <Plus size={13} /> Add Group
                </button>
                <button className={s.btnPrimary} onClick={() => { setEditItem(null); setShowAddItem(true); }}>
                  <Plus size={13} /> Add Food Item
                </button>
              </>
            )}
          </div>

          {error && <div className={s.errorBar}>{error}</div>}

          {/* Standard Library */}
          {libTab === 'standard' && (
            stdFiltered.length === 0
              ? <div className={s.emptyLib}>No results for "{search}"</div>
              : Object.entries(stdByGroup).map(([group, list]) => (
                <div key={group} className={s.libGroup}>
                  <div className={s.libGroupLabel}>{group}</div>
                  {list.map(food => (
                    <div key={food.name} className={s.libItem}>
                      <div className={s.libItemName}>{food.name}</div>
                      <div className={s.libItemMeta}>{food.serving}</div>
                      <div className={s.libItemNutri}>{food.nutrition.energy} kcal</div>
                      <div className={s.libItemMacros}>
                        P: {food.nutrition.protein}g · F: {food.nutrition.total_fat}g · C: {food.nutrition.carbohydrates}g
                      </div>
                    </div>
                  ))}
                </div>
              ))
          )}

          {/* Custom Items */}
          {libTab === 'custom' && (
            filtered.length === 0
              ? <div className={s.emptyLib}>No custom food items yet. Click "Add Food Item" above.</div>
              : <>
                {Object.entries(byGroup).map(([group, list]) => (
                  <div key={group} className={s.libGroup}>
                    <div className={s.libGroupLabel}>{group}</div>
                    {list.map(item => (
                      <div key={item.id} className={s.libItem}>
                        <div className={s.libItemName}>{item.name}</div>
                        <div className={s.libItemMeta}>{item.serving_size}</div>
                        <div className={s.libItemNutri}>{item.nutrition?.energy ? `${item.nutrition.energy} kcal` : ''}</div>
                        <div className={s.libItemActions}>
                          <button onClick={() => { setEditItem(item); setShowAddItem(true); }}>Edit</button>
                          <button onClick={() => handleDeleteItem(item.id)} className={s.delBtn}><Trash2 size={12} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {ungrouped.length > 0 && (
                  <div className={s.libGroup}>
                    <div className={s.libGroupLabel}>Uncategorised</div>
                    {ungrouped.map(item => (
                      <div key={item.id} className={s.libItem}>
                        <div className={s.libItemName}>{item.name}</div>
                        <div className={s.libItemMeta}>{item.serving_size}</div>
                        <div className={s.libItemActions}>
                          <button onClick={() => { setEditItem(item); setShowAddItem(true); }}>Edit</button>
                          <button onClick={() => handleDeleteItem(item.id)} className={s.delBtn}><Trash2 size={12} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
          )}
        </div>
        <div className={s.modalFooter}>
          <button className={s.btnPrimary} onClick={onClose}>Done</button>
        </div>
      </Modal>

      {showAddGroup && <AddGroupModal onSave={handleAddGroup} onClose={() => setShowAddGroup(false)} />}
      {showAddItem  && (
        <AddFoodItemModal allGroups={allGroups} editItem={editItem}
          onSave={handleSaveItem} onClose={() => { setShowAddItem(false); setEditItem(null); }} />
      )}
    </>
  );
}

// ── Food Search within meal ───────────────────────────────────────────────────

// Cache custom items at module level so all meal searches share one fetch
let _customFoodsCache = null;
function getCustomFoods() {
  if (_customFoodsCache) return Promise.resolve(_customFoodsCache);
  return api.get('/diet/food-items').then(items => { _customFoodsCache = items; return items; }).catch(() => []);
}
function invalidateCustomCache() { _customFoodsCache = null; }

function FoodSearch({ activeGroups, onAdd }) {
  const [q, setQ]       = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const lower = q.toLowerCase();

    // Static Indian foods (instant, no network)
    const staticHits = INDIAN_FOODS
      .filter(f => {
        const matchQ = f.name.toLowerCase().includes(lower);
        const matchG = !activeGroups?.length || activeGroups.includes(f.group);
        return matchQ && matchG;
      })
      .map(f => ({ _key: `s_${f.name}`, name: f.name, serving_size: f.serving, group_name: f.group, nutrition: f.nutrition }));

    // Custom DB foods (cached after first fetch)
    getCustomFoods().then(custom => {
      const customHits = custom.filter(i => {
        const matchQ = i.name.toLowerCase().includes(lower);
        const matchG = !activeGroups?.length || activeGroups.includes(i.group_name);
        return matchQ && matchG;
      }).map(i => ({ ...i, _key: `c_${i.id}` }));

      // Custom items first (clinic-specific), then static, dedupe by name
      const seen = new Set();
      const merged = [...customHits, ...staticHits].filter(item => {
        if (seen.has(item.name.toLowerCase())) return false;
        seen.add(item.name.toLowerCase());
        return true;
      }).slice(0, 15);

      setResults(merged);
      setOpen(merged.length > 0);
    });
  }, [q, activeGroups]);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={s.foodSearchWrap} ref={ref}>
      <div className={s.foodSearchInput}>
        <Search size={13} />
        <input placeholder="Search to add food item…" value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => q && setOpen(true)} />
      </div>
      {open && results.length > 0 && (
        <div className={s.foodDropdown}>
          {results.map(item => (
            <div key={item._key} className={s.foodOption}
              onClick={() => { onAdd(item); setQ(''); setOpen(false); }}>
              <span className={s.foodOptionName}>{item.name}</span>
              <span className={s.foodOptionMeta}>{item.serving_size} · {item.group_name}</span>
              {item.nutrition?.energy && <span className={s.foodOptionKcal}>{item.nutrition.energy} kcal</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Food Item Row (with inline serving selector) ──────────────────────────────

function FoodItemRow({ item, onServingChange, onRemove }) {
  const [custom, setCustom] = useState(
    item.serving_size && !SERVING_SIZES.includes(item.serving_size)
  );

  return (
    <div className={s.foodItemRow}>
      <span className={s.foodItemName}>{item.name}</span>
      <div className={s.foodItemServingWrap}>
        {custom ? (
          <>
            <input
              className={s.foodItemServingInput}
              value={item.serving_size || ''}
              onChange={e => onServingChange(e.target.value)}
              placeholder="e.g., 2 rotis"
            />
            <button className={s.foodItemServingToggle} onClick={() => { setCustom(false); onServingChange(''); }}>↩</button>
          </>
        ) : (
          <>
            <select
              className={s.foodItemServingSelect}
              value={item.serving_size || ''}
              onChange={e => {
                if (e.target.value === '__custom__') { setCustom(true); }
                else onServingChange(e.target.value);
              }}
            >
              {item.serving_size && !SERVING_SIZES.includes(item.serving_size) && (
                <option value={item.serving_size}>{item.serving_size}</option>
              )}
              {SERVING_SIZES.map(sz => <option key={sz} value={sz}>{sz}</option>)}
              <option value="__custom__">Custom…</option>
            </select>
          </>
        )}
      </div>
      <span className={s.foodItemKcal}>{item.nutrition?.energy ? `${item.nutrition.energy} kcal` : ''}</span>
      <button className={s.foodItemDel} onClick={onRemove}><X size={11} /></button>
    </div>
  );
}

// ── Diet Chart Editor ─────────────────────────────────────────────────────────

function makeDefaultDayPlan(n = 1) {
  return {
    id: uid(),
    name: `Day Plan ${n}`,
    meals: DEFAULT_MEALS.map(m => ({ id: uid(), name: m, time: '', instructions: '', food_items: [] })),
  };
}

function DietChartEditor({ chart: initialChart, patientMobile, doctorId, onSave, onBack }) {
  const [chart, setChart] = useState(initialChart || {
    id: null,
    title: `Diet chart - ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    start_date: todayStr(),
    duration: '',
    end_date: null,
    nutrition_targets: {},
    day_plans: [makeDefaultDayPlan(1)],
    food_groups: [],
  });
  const [activeDay, setActiveDay]   = useState(0);
  const [showTargets, setShowTargets]   = useState(false);
  const [showDuration, setShowDuration] = useState(false);
  const [showGroups, setShowGroups]   = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [saving, setSaving]         = useState(false);

  const totals = calcNutrition([chart.day_plans[activeDay] || chart.day_plans[0]]);
  const targets = chart.nutrition_targets || {};

  function setField(k, v) { setChart(c => ({ ...c, [k]: v })); }

  function addDayPlan() {
    const n = chart.day_plans.length + 1;
    setChart(c => ({ ...c, day_plans: [...c.day_plans, makeDefaultDayPlan(n)] }));
    setActiveDay(chart.day_plans.length);
  }

  function addMeal(dpIdx) {
    const name = prompt('Meal name (e.g., Snack):');
    if (!name?.trim()) return;
    setChart(c => {
      const dps = [...c.day_plans];
      dps[dpIdx] = { ...dps[dpIdx], meals: [...dps[dpIdx].meals, { id: uid(), name: name.trim(), time: '', instructions: '', food_items: [] }] };
      return { ...c, day_plans: dps };
    });
  }

  function deleteMeal(dpIdx, mIdx) {
    setChart(c => {
      const dps = [...c.day_plans];
      const meals = dps[dpIdx].meals.filter((_, i) => i !== mIdx);
      dps[dpIdx] = { ...dps[dpIdx], meals };
      return { ...c, day_plans: dps };
    });
  }

  function addFoodItem(dpIdx, mIdx, item) {
    setChart(c => {
      const dps = c.day_plans.map((dp, di) => {
        if (di !== dpIdx) return dp;
        const meals = dp.meals.map((meal, mi) => {
          if (mi !== mIdx) return meal;
          return { ...meal, food_items: [...meal.food_items, { ...item, _key: uid(), _base_serving: item.serving_size }] };
        });
        return { ...dp, meals };
      });
      return { ...c, day_plans: dps };
    });
  }

  function updateFoodItemServing(dpIdx, mIdx, key, serving) {
    setChart(c => {
      const dps = c.day_plans.map((dp, di) => {
        if (di !== dpIdx) return dp;
        const meals = dp.meals.map((meal, mi) => {
          if (mi !== mIdx) return meal;
          return { ...meal, food_items: meal.food_items.map(f => f._key === key ? { ...f, serving_size: serving } : f) };
        });
        return { ...dp, meals };
      });
      return { ...c, day_plans: dps };
    });
  }

  function removeFoodItem(dpIdx, mIdx, key) {
    setChart(c => {
      const dps = c.day_plans.map((dp, di) => {
        if (di !== dpIdx) return dp;
        const meals = dp.meals.map((meal, mi) => {
          if (mi !== mIdx) return meal;
          return { ...meal, food_items: meal.food_items.filter(f => f._key !== key) };
        });
        return { ...dp, meals };
      });
      return { ...c, day_plans: dps };
    });
  }

  function setMealInstructions(dpIdx, mIdx, val) {
    setChart(c => {
      const dps = c.day_plans.map((dp, di) => {
        if (di !== dpIdx) return dp;
        const meals = dp.meals.map((meal, mi) => mi === mIdx ? { ...meal, instructions: val } : meal);
        return { ...dp, meals };
      });
      return { ...c, day_plans: dps };
    });
  }

  function setMealTime(dpIdx, mIdx, val) {
    setChart(c => {
      const dps = c.day_plans.map((dp, di) => {
        if (di !== dpIdx) return dp;
        const meals = dp.meals.map((meal, mi) => mi === mIdx ? { ...meal, time: val } : meal);
        return { ...dp, meals };
      });
      return { ...c, day_plans: dps };
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = { ...chart, patient_mobile: patientMobile, doctor_id: doctorId };
      let saved;
      if (chart.id) {
        saved = await api.put(`/diet/charts/${chart.id}`, payload);
      } else {
        saved = await api.post('/diet/charts', payload);
      }
      onSave(saved);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTemplate(name) {
    await api.post('/diet/templates', {
      template_name: name,
      day_plans: chart.day_plans,
      nutrition_targets: chart.nutrition_targets,
      food_groups: chart.food_groups,
    });
    setShowTemplate(false);
  }

  const dp = chart.day_plans[activeDay] || chart.day_plans[0];

  return (
    <div className={s.editor}>
      {/* Editor header */}
      <div className={s.editorHeader}>
        <button className={s.backBtn} onClick={onBack}>‹ Diet Charts</button>
        <span className={s.editorTitle}>{chart.title}</span>
        <div className={s.editorActions}>
          <button className={s.editorBtn} onClick={() => setShowTargets(true)}>
            🎯 Nutrition Targets
          </button>
          <button className={s.editorBtn} onClick={() => setShowDuration(true)}>
            📅 Diet duration
          </button>
          <button className={s.editorBtn} onClick={() => setShowGroups(true)}>
            ⚙️ Food Groups
          </button>
        </div>
      </div>

      <div className={s.editorBody}>
        {/* Left: Day plans + meals */}
        <div className={s.editorLeft}>
          {/* Day plan tabs */}
          <div className={s.dayTabs}>
            {chart.day_plans.map((dp, i) => (
              <button key={dp.id}
                className={`${s.dayTab} ${i === activeDay ? s.dayTabActive : ''}`}
                onClick={() => setActiveDay(i)}>
                ⠿ {dp.name}
              </button>
            ))}
            <button className={s.addDayBtn} onClick={addDayPlan}><Plus size={14} /></button>
          </div>

          {/* Meals */}
          <div className={s.mealList}>
            {dp.meals.map((meal, mIdx) => {
              const scaledVal = (fi, key) => {
                const bq = parseServingQty(fi._base_serving || fi.serving_size);
                const cq = parseServingQty(fi.serving_size);
                const sc = bq > 0 ? cq / bq : 1;
                return parseFloat(fi.nutrition?.[key] || 0) * sc;
              };
              const mealKcal = meal.food_items.reduce((sum, fi) => sum + scaledVal(fi, 'energy'), 0);
              const mealP    = meal.food_items.reduce((sum, fi) => sum + scaledVal(fi, 'protein'), 0);
              const mealF    = meal.food_items.reduce((sum, fi) => sum + scaledVal(fi, 'total_fat'), 0);
              const mealC    = meal.food_items.reduce((sum, fi) => sum + scaledVal(fi, 'carbohydrates'), 0);
              const mealFb   = meal.food_items.reduce((sum, fi) => sum + scaledVal(fi, 'dietary_fibre'), 0);

              return (
                <div key={meal.id} className={s.mealCard}>
                  <div className={s.mealHeader}>
                    <div className={s.mealIcon}><Utensils size={14} /></div>
                    <span className={s.mealName}>{meal.name}</span>
                    <button className={s.mealTimeBtn} onClick={() => {
                      const t = prompt('Set meal time (e.g., 8:00 AM):', meal.time);
                      if (t !== null) setMealTime(activeDay, mIdx, t);
                    }}>
                      <Clock size={12} /> {meal.time || '+ Time'}
                    </button>
                    <button className={s.mealDelBtn} onClick={() => deleteMeal(activeDay, mIdx)}>
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {meal.food_items.length > 0 && (
                    <div className={s.foodItemsList}>
                      {meal.food_items.map(fi => (
                        <FoodItemRow
                          key={fi._key}
                          item={fi}
                          onServingChange={serving => updateFoodItemServing(activeDay, mIdx, fi._key, serving)}
                          onRemove={() => removeFoodItem(activeDay, mIdx, fi._key)}
                        />
                      ))}
                    </div>
                  )}

                  <FoodSearch activeGroups={chart.food_groups}
                    onAdd={item => addFoodItem(activeDay, mIdx, item)} />

                  <div className={s.mealTotals}>
                    <span>{mealKcal.toFixed(0)} kcal</span>
                    <span>P: {mealP.toFixed(1)}g</span>
                    <span>F: {mealF.toFixed(1)}g</span>
                    <span>C: {mealC.toFixed(1)}g</span>
                    <span>Fb: {mealFb.toFixed(1)}g</span>
                    <button className={s.instrBtn} onClick={() => {
                      const v = prompt('Add instructions:', meal.instructions);
                      if (v !== null) setMealInstructions(activeDay, mIdx, v);
                    }}>Add Instructions</button>
                  </div>
                  {meal.instructions && <div className={s.instrText}>{meal.instructions}</div>}
                </div>
              );
            })}

            <button className={s.addMealBtn} onClick={() => addMeal(activeDay)}>
              <Plus size={14} /> Add Meal
            </button>
          </div>
        </div>

        {/* Right: Nutrition Tracker */}
        <div className={s.tracker}>
          <div className={s.trackerHeader}><span>🧮</span> Nutrition Tracker</div>
          <div className={s.trackerKcal}>{totals.energy.toFixed(0)}</div>
          <div className={s.trackerKcalLabel}>kcal</div>
          {targets.energy
            ? <div className={s.trackerStatus}>
                {totals.energy < targets.energy ? `${(targets.energy - totals.energy).toFixed(0)} kcal remaining` : 'Target reached!'}
              </div>
            : <div className={s.trackerStatus}>Set targets to track progress</div>
          }
          <div className={s.trackerMacros}>
            {[
              { label: 'Protein',       key: 'protein',       color: '#3b82f6' },
              { label: 'Total Fat',     key: 'total_fat',     color: '#f59e0b' },
              { label: 'Carbohydrates', key: 'carbohydrates', color: '#10b981' },
            ].map(m => (
              <div key={m.key} className={s.trackerMacro}>
                <span className={s.trackerDot} style={{ background: m.color }} />
                <span className={s.trackerMacroLabel}>{m.label}</span>
                <span className={s.trackerMacroVal}>{totals[m.key].toFixed(1)}g</span>
                {targets[m.key] && (
                  <div className={s.trackerBar}>
                    <div className={s.trackerBarFill}
                      style={{ width: `${Math.min(100, (totals[m.key] / targets[m.key]) * 100)}%`, background: m.color }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className={s.editorFooter}>
        <button className={s.btnClear} onClick={onBack}>Clear</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={s.btnOutline} onClick={() => setShowTemplate(true)}>
            Save as Template
          </button>
          <button className={s.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Assign to Patient'}
          </button>
        </div>
      </div>

      {showTargets  && <NutritionTargetsModal targets={chart.nutrition_targets}
        onSave={v => { setField('nutrition_targets', v); setShowTargets(false); }}
        onClose={() => setShowTargets(false)} />}
      {showDuration && <DietDurationModal startDate={chart.start_date} duration={chart.duration}
        onSave={v => { setChart(c => ({ ...c, ...v })); setShowDuration(false); }}
        onClose={() => setShowDuration(false)} />}
      {showGroups   && <FoodGroupsModal selected={chart.food_groups}
        onSave={v => { setField('food_groups', v); setShowGroups(false); }}
        onClose={() => setShowGroups(false)} />}
      {showTemplate && <SaveTemplateModal onSave={handleSaveTemplate} onClose={() => setShowTemplate(false)} />}
    </div>
  );
}

// ── Diet Charts List ──────────────────────────────────────────────────────────

function ApplyTemplateModal({ onApply, onClose }) {
  const [templates, setTemplates] = useState([]);
  useEffect(() => { api.get('/diet/templates').then(setTemplates).catch(() => {}); }, []);
  return (
    <Modal title="Apply Template" onClose={onClose} width={480}>
      <div className={s.modalBody} style={{ maxHeight: '50vh', overflowY: 'auto' }}>
        {templates.length === 0 && <div className={s.emptyLib}>No templates saved yet.</div>}
        {templates.map(t => (
          <div key={t.id} className={s.templateRow}>
            <span className={s.templateName}>{t.template_name}</span>
            <button className={s.btnPrimary} onClick={() => onApply(t)}>Apply</button>
          </div>
        ))}
      </div>
      <div className={s.modalFooter}>
        <button className={s.btnGhost} onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

// ── AI Meal Plan Modal ────────────────────────────────────────────────────────

const PREFERENCES = [
  { key: 'vegetarian',     label: '🥦 Vegetarian',   desc: 'No meat, chicken, fish or eggs' },
  { key: 'non-vegetarian', label: '🍗 Non-Vegetarian',desc: 'Includes chicken & fish' },
  { key: 'eggetarian',     label: '🥚 Eggetarian',    desc: 'Vegetarian + eggs' },
  { key: 'vegan',          label: '🌱 Vegan',          desc: 'No animal products' },
];

function AIMealPlanModal({ patientContext, onApply, onClose }) {
  const [pref, setPref]         = useState('vegetarian');
  const [calories, setCalories] = useState('1800');
  const [days, setDays]         = useState('1');
  const [plans, setPlans]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [expanded, setExpanded] = useState(null);

  const conditions = (patientContext?.patient?.medical_history || [])
    .map(h => h.condition || h.label || h.key).filter(Boolean);

  async function handleGenerate() {
    setLoading(true); setError(''); setPlans([]); setExpanded(null);
    try {
      const payload = {
        preference: pref,
        conditions,
        age:             patientContext?.patient?.age,
        gender:          patientContext?.patient?.gender,
        calories_target: calories ? parseInt(calories) : undefined,
        days:            parseInt(days) || 1,
      };
      const data = await api.post('/diet/ai-meal-plan', payload);
      setPlans(data.plans || []);
      if (data.plans?.length) setExpanded(0);
    } catch (e) {
      if (e.proRequired) {
        onClose();
        window.dispatchEvent(new CustomEvent('subscription:limit', {
          detail: { resource: 'ai_meal_plan', message: 'AI Meal Plan is available on Infer Pro only. Please upgrade your plan.' },
        }));
        return;
      }
      setError(e.message + (e.detail ? ` — ${JSON.stringify(e.detail)}` : ''));
      console.error('[AI meal plan]', e);
    } finally { setLoading(false); }
  }

  function getMealTotalKcal(meal) {
    return meal.food_items.reduce((s, f) => s + parseFloat(f.nutrition?.energy || 0), 0).toFixed(0);
  }

  const AI_STEPS = [
    { icon: '🔍', label: 'Analysing patient conditions…' },
    { icon: '🥗', label: 'Selecting suitable Indian foods…' },
    { icon: '⚖️', label: 'Balancing macros & calories…' },
    { icon: '✨', label: 'Finalising your meal plan…' },
  ];

  return (
    <Modal title="✨ AI Powered Meal Plan" onClose={onClose} width={740}>
      <div className={s.modalBody} style={{ maxHeight: '75vh', overflowY: 'auto' }}>

        {/* Loading animation overlay */}
        {loading && (
          <div className={s.aiLoadingWrap}>
            <div className={s.aiLoadingOrb} />
            <div className={s.aiLoadingTitle}>Generating your meal plan…</div>
            <div className={s.aiLoadingSteps}>
              {AI_STEPS.map((step, i) => (
                <div key={i} className={s.aiLoadingStep} style={{ animationDelay: `${i * 0.6}s` }}>
                  <span className={s.aiLoadingStepIcon}>{step.icon}</span>
                  <span className={s.aiLoadingStepLabel}>{step.label}</span>
                </div>
              ))}
            </div>
            <div className={s.aiLoadingDots}>
              <span /><span /><span />
            </div>
          </div>
        )}

        {/* Food preference */}
        <div className={s.aiSection}>
          <div className={s.aiLabel}>Food Preference</div>
          <div className={s.aiPrefGrid}>
            {PREFERENCES.map(p => (
              <button key={p.key}
                className={`${s.aiPrefBtn} ${pref === p.key ? s.aiPrefActive : ''}`}
                onClick={() => setPref(p.key)}>
                <span className={s.aiPrefLabel}>{p.label}</span>
                <span className={s.aiPrefDesc}>{p.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Calories + Days */}
        <div className={s.aiSection}>
          <div className={s.aiInputRow}>
            <div className={s.aiInputField}>
              <label>Target Calories (kcal/day)</label>
              <input type="number" value={calories} min="800" max="4000" step="50"
                onChange={e => setCalories(e.target.value)} className={s.textInput}
                placeholder="e.g. 1800" />
            </div>
            <div className={s.aiInputField}>
              <label>Number of Days</label>
              <select value={days} onChange={e => setDays(e.target.value)} className={s.textInput}>
                {[1,2,3,4,5,6,7].map(d => <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Patient conditions */}
        {conditions.length > 0 && (
          <div className={s.aiSection}>
            <div className={s.aiLabel}>Patient Conditions (auto-detected)</div>
            <div className={s.aiChips}>
              {conditions.map(c => <span key={c} className={s.aiConditionChip}>{c}</span>)}
            </div>
          </div>
        )}

        {error && <div className={s.errorBar}>{error}</div>}

        {/* Generated plan */}
        {plans.length > 0 && (
          <div className={s.aiSection}>
            <div className={s.aiLabel}>Generated Plan — review and apply or generate another</div>
            {plans.map((plan, idx) => (
              <div key={idx} className={`${s.aiPlanCard} ${expanded === idx ? s.aiPlanCardOpen : ''}`}>
                <div className={s.aiPlanHeader} onClick={() => setExpanded(expanded === idx ? null : idx)}>
                  <div className={s.aiPlanLeft}>
                    <span className={s.aiPlanName}>{plan.plan_name}</span>
                    <span className={s.aiPlanTheme}>{plan.theme}</span>
                  </div>
                  <div className={s.aiPlanRight}>
                    <span className={s.aiPlanKcalBig}>{plan.nutrition_targets?.energy || '—'} kcal/day</span>
                    <span className={s.aiPlanChevron}>{expanded === idx ? '▲' : '▼'}</span>
                  </div>
                </div>

                {expanded === idx && (
                  <div className={s.aiPlanBody}>
                    <p className={s.aiPlanDesc}>{plan.description}</p>

                    {/* Macro summary bar */}
                    <div className={s.aiMacroBar}>
                      <div className={s.aiMacroBarItem} style={{ background: '#eff6ff' }}>
                        <span className={s.aiMacroBarVal}>{plan.nutrition_targets?.energy || '—'}</span>
                        <span className={s.aiMacroBarLabel}>kcal</span>
                      </div>
                      {[{k:'protein',c:'#dcfce7'},{k:'total_fat',c:'#fef9c3'},{k:'carbohydrates',c:'#fce7f3'},{k:'dietary_fibre',c:'#f3e8ff'}].map(({k,c}) => (
                        <div key={k} className={s.aiMacroBarItem} style={{ background: c }}>
                          <span className={s.aiMacroBarVal}>{plan.nutrition_targets?.[k] || '—'}g</span>
                          <span className={s.aiMacroBarLabel}>{k === 'total_fat' ? 'Fat' : k === 'dietary_fibre' ? 'Fibre' : k.charAt(0).toUpperCase() + k.slice(1)}</span>
                        </div>
                      ))}
                    </div>

                    {plan.day_plans?.map((dp, di) => (
                      <div key={di}>
                        {plan.day_plans.length > 1 && <div className={s.aiDayLabel}>{dp.name}</div>}
                        {dp.meals?.map(meal => (
                          <div key={meal.name} className={s.aiMealBlock}>
                            <div className={s.aiMealName}>
                              {meal.name}
                              {meal.time && <span className={s.aiMealTime}>{meal.time}</span>}
                              <span className={s.aiMealKcal}>{getMealTotalKcal(meal)} kcal</span>
                            </div>
                            {meal.food_items.map((fi, i) => (
                              <div key={i} className={s.aiMealItem}>
                                <span className={s.aiMealItemName}>{fi.name}</span>
                                <span className={s.aiMealItemServing}>{fi.serving_size}</span>
                                <span className={s.aiMealItemKcal}>{fi.nutrition?.energy} kcal</span>
                              </div>
                            ))}
                            {meal.instructions && <div className={s.aiMealInstr}>{meal.instructions}</div>}
                          </div>
                        ))}
                      </div>
                    ))}

                    <button className={s.btnPrimary} style={{ marginTop: 12, width: '100%' }}
                      onClick={() => onApply(plan)}>
                      Apply This Plan to Patient
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={s.modalFooter}>
        <button className={s.btnGhost} onClick={onClose}>Cancel</button>
        {plans.length > 0 && (
          <button className={s.btnOutline} onClick={handleGenerate} disabled={loading}>
            {loading ? '✨ Generating…' : '🔄 Generate Another'}
          </button>
        )}
        <button className={s.btnPrimary} onClick={handleGenerate} disabled={loading}>
          {loading ? '✨ Generating…' : '✨ Generate Plan'}
        </button>
      </div>
    </Modal>
  );
}

// ── Main DietChartTab ─────────────────────────────────────────────────────────

export default function DietChartTab({ patientMobile, doctorId, patientContext }) {
  const [charts, setCharts]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editChart, setEditChart] = useState(null); // null = list, object = editor
  const [showLib, setShowLib]       = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showAI, setShowAI]         = useState(false);
  const [showNutrTargets, setShowNutrTargets] = useState(false);
  const [newChartTargets, setNewChartTargets] = useState(null);

  useEffect(() => {
    if (!patientMobile) { setLoading(false); return; }
    api.get(`/diet/charts?patient_mobile=${patientMobile}`)
      .then(setCharts).finally(() => setLoading(false));
  }, [patientMobile]);

  function handleNewChart() { setShowNutrTargets(true); }

  function handleTargetsSaved(targets) {
    setNewChartTargets(targets);
    setShowNutrTargets(false);
    setEditChart({
      id: null,
      title: `Diet chart - ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
      start_date: todayStr(), duration: '', end_date: null,
      nutrition_targets: targets,
      day_plans: [makeDefaultDayPlan(1)],
      food_groups: [],
    });
  }

  function handleChartSaved(saved) {
    setCharts(prev => {
      const exists = prev.find(c => c.id === saved.id);
      return exists ? prev.map(c => c.id === saved.id ? saved : c) : [saved, ...prev];
    });
    setEditChart(null);
  }

  async function handleDeleteChart(id) {
    if (!confirm('Delete this diet chart?')) return;
    await api.delete(`/diet/charts/${id}`);
    setCharts(prev => prev.filter(c => c.id !== id));
  }

  function handleApplyTemplate(template) {
    setEditChart({
      id: null,
      title: `Diet chart - ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
      start_date: todayStr(), duration: '', end_date: null,
      nutrition_targets: template.nutrition_targets || {},
      day_plans: template.day_plans || [makeDefaultDayPlan(1)],
      food_groups: template.food_groups || [],
    });
    setShowTemplate(false);
  }

  if (editChart !== null) {
    return (
      <DietChartEditor chart={editChart} patientMobile={patientMobile} doctorId={doctorId}
        onSave={handleChartSaved} onBack={() => setEditChart(null)} />
    );
  }

  return (
    <div className={s.root}>
      <div className={s.topBar}>
        <span className={s.pageTitle}>Diet Charts</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={s.btnOutline} onClick={() => setShowLib(true)}>
            <BookOpen size={13} /> Custom food library
          </button>
          <button className={s.btnOutline} onClick={() => setShowTemplate(true)}>
            <LayoutTemplate size={13} /> Apply Template
          </button>
          <button className={s.btnAI} onClick={() => setShowAI(true)}>
            ✨ AI Meal Plan
          </button>
        </div>
      </div>

      {loading ? (
        <div className={s.emptyState}><p className={s.hint}>Loading…</p></div>
      ) : charts.length === 0 ? (
        <div className={s.emptyState}>
          <div className={s.emptyIcon}>📋</div>
          <p className={s.emptyMsg}>No diet charts yet</p>
          <button className={s.newChartBtn} onClick={handleNewChart}>
            <Plus size={14} /> New Chart
          </button>
        </div>
      ) : (
        <div className={s.chartList}>
          <button className={s.newChartBtnInline} onClick={handleNewChart}>
            <Plus size={13} /> New Chart
          </button>
          {charts.map(c => (
            <div key={c.id} className={s.chartCard} onClick={() => setEditChart(c)} style={{ cursor: 'pointer' }}>
              <div className={s.chartCardLeft}>
                <span className={s.chartCardTitle}>{c.title}</span>
                <span className={s.chartCardMeta}>
                  {c.start_date ? fmtDate(c.start_date) : 'No start date'}
                  {c.duration ? ` · ${c.duration}` : ''}
                  {c.end_date ? ` → ${fmtDate(c.end_date)}` : ''}
                  {c.nutrition_targets?.energy ? ` · ${c.nutrition_targets.energy} kcal/day` : ''}
                </span>
              </div>
              <div className={s.chartCardActions} onClick={e => e.stopPropagation()}>
                <button className={s.delBtn} onClick={() => handleDeleteChart(c.id)}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNutrTargets && (
        <NutritionTargetsModal targets={{}} onSave={handleTargetsSaved} onClose={() => setShowNutrTargets(false)} />
      )}
      {showLib      && <CustomFoodLibraryModal onClose={() => setShowLib(false)} />}
      {showTemplate && <ApplyTemplateModal onApply={handleApplyTemplate} onClose={() => setShowTemplate(false)} />}
      {showAI && (
        <AIMealPlanModal
          patientContext={patientContext}
          onApply={plan => {
            // Normalize AI food items — stamp _key and _base_serving so tracker works
            const normalizedDayPlans = (plan.day_plans || [makeDefaultDayPlan(1)]).map(dp => ({
              ...dp,
              id: dp.id || uid(),
              meals: (dp.meals || []).map(meal => ({
                ...meal,
                id: meal.id || uid(),
                food_items: (meal.food_items || []).map(fi => ({
                  ...fi,
                  _key: fi._key || uid(),
                  _base_serving: fi.serving_size,
                })),
              })),
            }));
            setEditChart({
              id: null,
              title: `${plan.plan_name} - ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
              start_date: todayStr(), duration: '', end_date: null,
              nutrition_targets: plan.nutrition_targets || {},
              day_plans: normalizedDayPlans,
              food_groups: [],
            });
            setShowAI(false);
          }}
          onClose={() => setShowAI(false)}
        />
      )}
    </div>
  );
}
