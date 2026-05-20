import { useAuth } from '../context/AuthContext';
import styles from './Banner.module.css';

export default function Banner() {
  const { user } = useAuth();
  const max = user?.max_patients ?? 100;
  return (
    <div className={styles.banner}>
      <span>Welcome to Infer Care. Base plan active. Add up to {max} patients.</span>
      <button className={styles.upgrade}>Upgrade Now</button>
    </div>
  );
}
