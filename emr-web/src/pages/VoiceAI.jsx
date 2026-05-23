import { useAuth } from '../context/AuthContext';
import ScribePanel from '../components/ScribePanel';
import styles from './VoiceAI.module.css';

const noop = () => {};

export default function VoiceAI() {
  const { user } = useAuth();

  return (
    <div className={styles.page}>
      <ScribePanel
        set={noop}
        setVital={noop}
        onClose={null}
        appt={null}
        pastNotes={[]}
        user={user}
        form={null}
        standalone
        fullscreen
      />
    </div>
  );
}
