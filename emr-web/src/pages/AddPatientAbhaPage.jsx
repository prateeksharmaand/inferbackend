import { useNavigate } from 'react-router-dom';
import AddPatientAbhaFlow from '../components/AddPatientAbhaFlow';

export default function AddPatientAbhaPage() {
  const navigate = useNavigate();
  return (
    <AddPatientAbhaFlow
      fullPage
      onClose={() => navigate(-1)}
      onSuccess={(patient) => {
        if (patient?.id) navigate(`/queue?newPatient=${patient.id}`);
        else navigate(-1);
      }}
    />
  );
}
