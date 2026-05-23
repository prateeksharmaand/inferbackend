import AssessmentPanel from '../components/AssessmentPanel';
import styles from './Assessment.module.css';

export default function Assessment() {
  return (
    <div className={styles.page}>
      <AssessmentPanel standalone fullscreen onClose={null} />
    </div>
  );
}
