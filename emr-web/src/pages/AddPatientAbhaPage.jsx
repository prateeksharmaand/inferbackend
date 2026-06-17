import { useNavigate } from 'react-router-dom';
import AddPatientAbhaFlow from '../components/AddPatientAbhaFlow';

export default function AddPatientAbhaPage() {
  const navigate = useNavigate();
  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto' }}>
      <AddPatientAbhaFlow
        fullPage
        onClose={() => navigate(-1)}
        onSuccess={(patient) => {
          if (patient?.id) navigate(`/queue?newPatient=${patient.id}`);
          else navigate(-1);
        }}
      />
    </div>
  );
}
