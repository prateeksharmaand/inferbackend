# Clinical Template Builder

Clinics and doctors configure the consultation screen (InferPad) per speciality — sections, fields,
validation, defaults, order and printing — without an app release. Saved consultations never change
when a template changes.

## How it fits the existing EMR

| Existing piece | How the builder uses it |
| --- | --- |
| InferPad section keys (`INFERPAD_SECTIONS`, 33 keys) | Are the template's section keys, so print, PDF, FHIR and ABDM export keep working |
| `emr_encounters` columns (vitals, medications, diagnosis, …) | Still hold built-in data. Template fields with `storage: 'core'` map onto them (`vitals.pulse`, `medications[].route`) |
| Speciality → sections map (`TemplateSelector.jsx`) | Became the 15 seeded system templates (+ General), with clinically specific fields per speciality |
| AI scribe prompts (`scribe.templates.js`) | Unchanged; each template carries `scribe_specialty` |
| `emr_clinical_terms` (symptoms, diagnoses) | Unchanged and reused; no new medicine or investigation master |
| Browser-only InferPad settings (localStorage) | Still used by clinics that have **not** adopted templates. "Use my current InferPad settings" imports them once |

**Opt-in per clinic.** A clinic with no row in `clinic_template_selections` behaves exactly as before.
A clinic adopts templates by offering at least one (Settings → Clinical Templates).

## Inheritance

```
System template (published version)  →  clinic overrides  →  doctor overrides  →  consultation
```

Clinic and doctor levels store only changes (`clinical_template_overrides`: one row per changed
section/field, or an added field). Rules (`backend/src/emr/clinicalTemplates/definition.js`):

- **Clinic** may rename, describe, require, lock, hide, re-order, set defaults, change options/limits/
  units/reference ranges of inherited items, and add sections and fields.
- **Doctor** may show/hide (unless required), re-order, set defaults and placeholders of inherited items,
  and add personal fields (full control over those).
- **Locked** items (compliance) cannot be hidden, made optional or have their rules changed below the
  level that locked them. Disallowed changes are skipped and reported back as `ignored`.
- Inherited items are never deleted at a lower level — removing one disables it.

## Data model (migration `backend/src/db/migrations/033_clinical_templates.sql`)

| Table | Purpose |
| --- | --- |
| `clinical_templates` | Template; `clinic_id NULL` = system. One system template per `specialty_key` |
| `clinical_template_versions` | `draft` → `published` → `archived`; one draft per template; resolved `definition` cached at publish |
| `clinical_template_sections`, `clinical_template_fields` | Normalised sections and fields of a version (type, options, limits, units, validation, visibility, storage) |
| `clinic_template_selections` | Templates a clinic offers + its default |
| `emr_clinic_staff.clinical_template_id` | A doctor's chosen template |
| `clinical_template_overrides` | Clinic (`staff_id NULL`) and doctor customisations |
| `consultation_template_snapshots` | Exact effective template of a consultation; shared by hash (template + version + content) |
| `emr_encounters.template_snapshot_id` | Set on the first save and never changed afterwards |
| `consultation_field_values` | Custom field values per encounter |
| `clinical_template_audit` | Every create / draft / publish / override / selection change |

Database triggers make published and archived versions immutable.

## Consultation save

`POST /api/emr/appointments/:id/encounter` (existing endpoint) runs in one transaction:

1. Lock the encounter row. If it already has a snapshot, validate against **that** snapshot.
   Otherwise resolve the effective template (doctor choice → clinic default); none = legacy save.
2. Validate (`validator.js`). Errors return `422 { error: 'validation_failed', errors[], warnings[] }`.
   `allow_incomplete: true` (the existing "End without Rx") bypasses errors except on locked items.
   Reference ranges only produce warnings.
3. Save the encounter (built-in columns as before) + snapshot id + custom values (unknown keys dropped).

Responses add `template_warnings` / `template_errors`; `GET /appointments/:id` adds `clinical_template`
(snapshot definition + values). The emailed PDF and the browser print include custom fields.

## API (all under `/api/emr`, clinic taken from the login token)

| Method & path | Who | Purpose |
| --- | --- | --- |
| `GET /clinical-templates` | any | System + own templates, `adopted`, `can_manage` |
| `GET /clinical-templates/catalog` | any | Sections, field types, vitals catalogue, row columns, specialities |
| `GET /clinical-templates/:id` | any | Template, published and (own) draft definitions, clinic view |
| `GET /clinical-templates/:id/versions`, `/audit` | any | Version history, change log |
| `POST /clinical-templates` | admin | Create clinic template (`name`, `specialty_key`, optional `from_template_id`) |
| `PUT /clinical-templates/:id` · `DELETE` | admin | Rename / describe · archive (own templates) |
| `POST /clinical-templates/:id/duplicate` | admin | Copy (with the clinic's customisations) into a clinic template |
| `PUT /clinical-templates/:id/draft` · `POST …/publish` | admin | Replace draft definition · publish it |
| `POST /clinical-templates/:id/sections` | admin | Add a section to the draft |
| `PUT·DELETE /clinical-template-sections/:id` · `POST …/:id/fields` | admin | Edit / delete a draft section · add a field |
| `PUT·DELETE /clinical-template-fields/:id` | admin | Edit / delete a draft field (built-in fields: disable only) |
| `GET·PUT /clinical-template-config` | admin (PUT) | Offered templates `{ selections: [{ template_id, is_default }] }` |
| `GET·PUT /clinical-template-config/templates/:id` | admin (PUT) | Clinic customisation: PUT `{ definition }` (diffed into overrides) or `{ overrides }` |
| `GET·PUT /clinical-template-config/doctors/:staffId` | self or admin | Doctor template choice and preferences (`me` = yourself) |
| `GET /clinical-templates/effective?template_id=` | any | Effective template for a new consultation |
| `GET /appointments/:id/effective-template` | any | Snapshot + values once saved, else the current effective template |
| `POST /clinical-templates/validate` | any | Validate a payload with the server's rules, without saving |
| `POST·PUT /appointments/:id/clinical-data` | any | Save only custom values of a saved consultation |

"admin" = clinic admin role, or permission `all`, `settings.clinic` or `templates.manage`.
Super admin (`/api/admin`, superadmin token) has the same template routes for **system** templates,
plus `POST /clinical-templates` with a new `specialty_key` to create a speciality.

### Definition format

```json
{ "sections": [ {
    "key": "examination_findings", "label": "Examination Findings", "builtin": true,
    "enabled": true, "required": false, "locked": false, "print_enabled": true,
    "default_value": null, "order": 8,
    "fields": [ {
      "key": "murmur", "label": "Murmur", "type": "radio",
      "options": [{ "value": "absent", "label": "Absent" }, { "value": "present", "label": "Present" }],
      "required": true, "enabled": true, "storage": "custom", "order": 2 },
    { "key": "murmur_details", "label": "Murmur details", "type": "text",
      "visibility": { "field": "murmur", "op": "eq", "value": "present" } } ] } ] }
```

Field types: `text textarea number decimal dropdown multiselect radio checkbox date time datetime boolean measurement`.
Field properties: `key label description type placeholder default_value required locked enabled print_enabled
min max min_length max_length options unit validation{pattern, ref_ranges[{sex, age_min, age_max, low, high}]}
visibility{field, op: eq|neq|in|filled|empty, value} storage core_path order`.
Consultation values: `template_values: { "<section_key>": { "<field_key>": value } }`.

Mobile clients consume the same endpoints and definition; all validation is server-side.

## Web app

- **Settings → Clinical Templates** (`pages/settings/ClinicalTemplateBuilder.jsx`): offer templates and
  the default, customise, create / duplicate / edit / publish clinic templates, history, import browser
  settings, and **My preferences** for doctors.
- **Super Admin → Clinical Templates** (`pages/admin/AdminClinicalTemplates.jsx`): system templates.
- Editor: `components/clinicalTemplates/TemplateEditor.jsx`; field renderer: `DynamicFields.jsx`.
- InferPad (`components/InferPad.jsx`) takes `clinicalTemplate`: order, visibility, labels, required
  badges, vitals, medication / investigation columns and custom fields inside each section card.
  Without it InferPad is unchanged.

## Deploying

1. Deploy the backend. On start-up the migration runner applies `033_clinical_templates.sql` once, and
   `ensureSystemTemplates` seeds the 16 system templates (only missing ones; never overwrites edits).
2. Deploy the OPD web app.
3. Nothing changes for any clinic until its admin offers a template.

Rollback: redeploy the previous code. The new tables and the two added columns are unused by old code.

## Tests

- `backend/tests/clinical-templates.unit.test.js` — seeds, inheritance and locks, diff, hashing, validation (36 tests).
- `backend/tests/integration/clinical-templates.db.test.js` — full lifecycle against PostgreSQL inside a
  rolled-back transaction: `CT_DB_TEST=1 npx jest tests/integration/clinical-templates.db.test.js`.

## Known limitations

- No Flutter integration: there is no doctor-facing Flutter app yet; the API is ready for one.
- No medicine master: medicine search still uses the NLM RxTerms API (no Indian brands).
- The existing save ignores `injections`, `dental_chart` and `ophtho` (they are sent but not stored);
  this predates the builder and is not fixed here. Template fields in those sections are stored.
- Lab-result columns cannot be hidden individually (the results table has a fixed layout).
- Analytics/reports do not yet read custom field values (`consultation_field_values` is indexed for it).
