import { X } from 'lucide-react';
import styles from './ServiceTypeSelector.module.css';

const SERVICE_TYPES = [
  { id: 'consultation', label: 'Consultation', icon: '👨‍⚕️', color: '#3b82f6', desc: 'Doctor consultation' },
  { id: 'lab', label: 'Lab Test', icon: '🧪', color: '#8b5cf6', desc: 'Laboratory tests' },
  { id: 'vaccination', label: 'Vaccination', icon: '💉', color: '#10b981', desc: 'Vaccination service' },
  { id: 'report_collection', label: 'Report Collection', icon: '📋', color: '#f59e0b', desc: 'Collect lab reports' },
  { id: 'pharmacy', label: 'Pharmacy', icon: '💊', color: '#ef4444', desc: 'Medication pickup' },
  { id: 'registration', label: 'Registration', icon: '📝', color: '#6b7280', desc: 'Patient registration' },
  { id: 'procedure', label: 'Procedure', icon: '🏥', color: '#06b6d4', desc: 'Medical procedure' },
  { id: 'other', label: 'Other', icon: '❓', color: '#64748b', desc: 'Other service' },
];

export default function ServiceTypeSelector({ onSelect, onCancel, selectedPatientName = '' }) {
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>What is the patient here for?</h2>
          {selectedPatientName && <p className={styles.subtitle}>{selectedPatientName}</p>}
          <button className={styles.close} onClick={onCancel}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.grid}>
          {SERVICE_TYPES.map(service => (
            <button
              key={service.id}
              className={styles.option}
              onClick={() => onSelect(service.id)}
              style={{ 
                borderColor: service.color,
                borderLeftColor: service.color,
                borderLeftWidth: '4px'
              }}
            >
              <div className={styles.icon}>{service.icon}</div>
              <div className={styles.content}>
                <div className={styles.label}>{service.label}</div>
                <div className={styles.desc}>{service.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
