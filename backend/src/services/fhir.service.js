const axios = require('axios');

const FHIR_BASE = process.env.FHIR_BASE_URL || 'http://fhir:8080/fhir';

const fhirClient = axios.create({
  baseURL: FHIR_BASE,
  headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' },
  timeout: 10_000,
});

// LOINC codes for vitals
const VITAL_LOINC = {
  bp_systolic:      { code: '8480-6', display: 'Systolic blood pressure',  unit: 'mm[Hg]' },
  bp_diastolic:     { code: '8462-4', display: 'Diastolic blood pressure', unit: 'mm[Hg]' },
  pulse:            { code: '8867-4', display: 'Heart rate',               unit: '/min' },
  spo2:             { code: '2708-6', display: 'Oxygen saturation',        unit: '%' },
  temp:             { code: '8310-5', display: 'Body temperature',         unit: 'Cel' },
  respiratory_rate: { code: '9279-1', display: 'Respiratory rate',         unit: '/min' },
  height:           { code: '8302-2', display: 'Body height',              unit: 'cm' },
  weight:           { code: '29463-7', display: 'Body weight',             unit: 'kg' },
  bmi:              { code: '39156-5', display: 'Body mass index',         unit: 'kg/m2' },
};

function patientResource(appt) {
  const identifiers = [];
  if (appt.uhid) identifiers.push({ system: 'urn:infer:uhid', value: appt.uhid });
  if (appt.patient_abha) identifiers.push({ system: 'https://abha.abdm.gov.in', value: appt.patient_abha });
  if (appt.patient_mobile) identifiers.push({ system: 'urn:infer:mobile', value: appt.patient_mobile });

  return {
    resourceType: 'Patient',
    identifier: identifiers,
    name: [{ text: appt.patient_name }],
    ...(appt.patient_gender && {
      gender: appt.patient_gender === 'M' ? 'male' : appt.patient_gender === 'F' ? 'female' : 'other',
    }),
    ...(appt.patient_dob && { birthDate: appt.patient_dob.toString().slice(0, 10) }),
    ...(appt.patient_mobile && {
      telecom: [{ system: 'phone', value: appt.patient_mobile }],
    }),
  };
}

function appointmentResource(appt, patientRef) {
  const dateStr = appt.appointment_date
    ? new Date(appt.appointment_date).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const start = `${dateStr}T${appt.appointment_time || '00:00:00'}`;
  return {
    resourceType: 'Appointment',
    status: 'booked',
    serviceType: [{ coding: [{ code: appt.visit_type || 'OPConsultation', display: appt.visit_type || 'OPConsultation' }] }],
    start,
    participant: [{ actor: { reference: patientRef }, status: 'accepted' }],
    ...(appt.notes && { comment: appt.notes }),
  };
}

function encounterResource(appt, patientRef, appointmentRef) {
  return {
    resourceType: 'Encounter',
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    type: [{ coding: [{ system: 'http://snomed.info/sct', code: '11429006', display: 'Consultation' }] }],
    subject: { reference: patientRef },
    ...(appointmentRef && { appointment: [{ reference: appointmentRef }] }),
    period: { start: appt.appointment_date ? new Date(appt.appointment_date).toISOString().slice(0, 10) + 'T00:00:00' : new Date().toISOString() },
  };
}

function vitalObservations(vitals, patientRef, encounterRef) {
  const obs = [];
  for (const [key, meta] of Object.entries(VITAL_LOINC)) {
    const val = vitals[key];
    if (val === null || val === undefined || val === '') continue;
    const num = parseFloat(val);
    if (isNaN(num)) continue;
    obs.push({
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: meta.code, display: meta.display }] },
      subject: { reference: patientRef },
      ...(encounterRef && { encounter: { reference: encounterRef } }),
      effectiveDateTime: new Date().toISOString(),
      valueQuantity: { value: num, unit: meta.unit, system: 'http://unitsofmeasure.org', code: meta.unit },
    });
  }
  return obs;
}

function conditionResources(diagnosis, patientRef, encounterRef) {
  return (diagnosis || []).filter(d => d.display).map(d => ({
    resourceType: 'Condition',
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
    code: {
      coding: d.code
        ? [{ system: d.system || 'http://snomed.info/sct', code: d.code, display: d.display }]
        : [],
      text: d.display,
    },
    subject: { reference: patientRef },
    ...(encounterRef && { encounter: { reference: encounterRef } }),
  }));
}

function medicationRequestResources(medications, patientRef, encounterRef) {
  return (medications || []).filter(m => m.name).map(m => ({
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    medicationCodeableConcept: { text: m.name },
    subject: { reference: patientRef },
    ...(encounterRef && { encounter: { reference: encounterRef } }),
    dosageInstruction: [{
      text: [m.dose, m.dosage, m.frequency, m.timing, m.duration].filter(Boolean).join(' '),
      ...(m.instructions && { patientInstruction: m.instructions }),
    }],
  }));
}

function serviceRequestResources(labInvestigations, patientRef, encounterRef) {
  return (labInvestigations || []).filter(Boolean).map(lab => {
    const name = typeof lab === 'string' ? lab : lab.test;
    if (!name) return null;
    return {
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      code: { text: name },
      subject: { reference: patientRef },
      ...(encounterRef && { encounter: { reference: encounterRef } }),
    };
  }).filter(Boolean);
}

function diagnosticObservations(labResults, patientRef, encounterRef) {
  return (labResults || []).filter(r => r.test && r.result).map(r => ({
    resourceType: 'Observation',
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
    code: { text: r.test },
    subject: { reference: patientRef },
    ...(encounterRef && { encounter: { reference: encounterRef } }),
    effectiveDateTime: new Date().toISOString(),
    valueString: `${r.result}${r.unit ? ' ' + r.unit : ''}`,
    ...(r.range && { referenceRange: [{ text: r.range }] }),
  }));
}

// Build a FHIR R4 transaction Bundle and POST it to HAPI FHIR
async function pushEncounterBundle(appt, encounter) {
  const patientId    = `urn:uuid:patient-${appt.id}`;
  const encounterId  = `urn:uuid:encounter-${appt.id}`;
  const appointmentId = `urn:uuid:appointment-${appt.id}`;

  const patient     = patientResource(appt);
  const appointment = appointmentResource(appt, patientId);
  const enc         = encounterResource(appt, patientId, appointmentId);

  const vitals    = typeof encounter.vitals === 'string' ? JSON.parse(encounter.vitals) : (encounter.vitals || {});
  const diagnosis = typeof encounter.diagnosis === 'string' ? JSON.parse(encounter.diagnosis) : (encounter.diagnosis || []);
  const meds      = typeof encounter.medications === 'string' ? JSON.parse(encounter.medications) : (encounter.medications || []);
  const labs      = typeof encounter.lab_investigations === 'string' ? JSON.parse(encounter.lab_investigations) : (encounter.lab_investigations || []);
  const results   = typeof encounter.lab_results === 'string' ? JSON.parse(encounter.lab_results) : (encounter.lab_results || []);

  const observations   = vitalObservations(vitals, patientId, encounterId);
  const conditions     = conditionResources(diagnosis, patientId, encounterId);
  const medRequests    = medicationRequestResources(meds, patientId, encounterId);
  const serviceReqs    = serviceRequestResources(labs, patientId, encounterId);
  const labObservations = diagnosticObservations(results, patientId, encounterId);

  const entries = [
    { fullUrl: patientId,     resource: patient,     request: { method: 'POST', url: 'Patient' } },
    { fullUrl: appointmentId, resource: appointment, request: { method: 'POST', url: 'Appointment' } },
    { fullUrl: encounterId,   resource: enc,         request: { method: 'POST', url: 'Encounter' } },
    ...observations.map((o, i)   => ({ fullUrl: `urn:uuid:obs-vital-${appt.id}-${i}`,   resource: o, request: { method: 'POST', url: 'Observation' } })),
    ...conditions.map((c, i)     => ({ fullUrl: `urn:uuid:cond-${appt.id}-${i}`,         resource: c, request: { method: 'POST', url: 'Condition' } })),
    ...medRequests.map((m, i)    => ({ fullUrl: `urn:uuid:medr-${appt.id}-${i}`,         resource: m, request: { method: 'POST', url: 'MedicationRequest' } })),
    ...serviceReqs.map((s, i)    => ({ fullUrl: `urn:uuid:sreq-${appt.id}-${i}`,         resource: s, request: { method: 'POST', url: 'ServiceRequest' } })),
    ...labObservations.map((o, i) => ({ fullUrl: `urn:uuid:obs-lab-${appt.id}-${i}`,     resource: o, request: { method: 'POST', url: 'Observation' } })),
  ];

  const bundle = { resourceType: 'Bundle', type: 'transaction', entry: entries };
  const res = await fhirClient.post('/', bundle);
  return res.data;
}

// Push Patient + Appointment only (on appointment creation)
async function pushAppointmentBundle(appt) {
  const patientId     = `urn:uuid:patient-appt-${appt.id}`;
  const appointmentId = `urn:uuid:appointment-${appt.id}`;

  const bundle = {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      { fullUrl: patientId,     resource: patientResource(appt),                request: { method: 'POST', url: 'Patient' } },
      { fullUrl: appointmentId, resource: appointmentResource(appt, patientId), request: { method: 'POST', url: 'Appointment' } },
    ],
  };
  const res = await fhirClient.post('/', bundle);
  return res.data;
}

module.exports = { pushEncounterBundle, pushAppointmentBundle };
