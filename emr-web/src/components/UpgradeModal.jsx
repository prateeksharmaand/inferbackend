import { useState } from 'react';
import { X, Zap, Check, ArrowRight, AlertTriangle } from 'lucide-react';
import { api } from '../api/client';
import { useSubscription } from '../context/SubscriptionContext';
import styles from './UpgradeModal.module.css';

const CYCLES = [
  { key: 'monthly', label: '1 Month',  priceKey: 'price_monthly' },
  { key: 'yearly',  label: '1 Year',   priceKey: 'price_yearly',  badge: 'Save 17%' },
  { key: '2year',   label: '2 Years',  priceKey: 'price_2year',   badge: 'Save 33%' },
  { key: '3year',   label: '3 Years',  priceKey: 'price_3year',   badge: 'Save 40%' },
];

const PRO_FEATURES = [
  'Unlimited users & devices',
  'Unlimited patients',
  'Unlimited appointments',
  'Unlimited prescriptions',
  'Unlimited data storage',
  'AI DocAssist (Chat, Docs, Patients)',
  'Medical Scribe with Groq Whisper',
  'Vitals trend graphs on prescriptions',
  'QR code on prescriptions',
  'Lab report upload from queue',
  'Advanced analytics',
];

function loadRazorpay() {
  return new Promise(resolve => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload  = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function UpgradeModal({ onClose, triggerResource, limitMessage }) {
  const { sub, refresh } = useSubscription();
  const [cycle,    setCycle]    = useState('yearly');
  const [seats,    setSeats]    = useState(1);
  const [paying,   setPaying]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  const proPlan   = null; // fetched inline from sub context or via prop if available
  const cycleInfo = CYCLES.find(c => c.key === cycle);

  // We read pro plan prices from the plans API
  const [proPrices, setProPrices] = useState(null);
  useState(() => {
    api.get('/subscription/plans').then(plans => {
      const pro = plans.find(p => p.key === 'pro');
      if (pro) setProPrices(pro);
    }).catch(() => {});
  });

  const unitPrice  = proPrices ? Math.round(proPrices[cycleInfo?.priceKey || 'price_yearly'] / 100) : 400;
  const totalPaise = proPrices ? (proPrices[cycleInfo?.priceKey || 'price_yearly'] * seats) : 0;
  const totalRs    = Math.round(totalPaise / 100);

  const pay = async () => {
    setError('');
    setPaying(true);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) throw new Error('Could not load payment gateway. Please check your internet connection.');

      const order = await api.post('/subscription/create-order', {
        plan_key: 'pro',
        billing_cycle: cycle,
        seat_count: seats,
      });

      const options = {
        key:         order.key_id,
        amount:      order.amount,
        currency:    order.currency,
        name:        'Infer EMR',
        description: `${order.plan_name} — ${cycleInfo.label}`,
        order_id:    order.order_id,
        handler: async (response) => {
          try {
            await api.post('/subscription/verify-payment', {
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
              plan_key:            'pro',
              billing_cycle:       cycle,
              seat_count:          seats,
            });
            await refresh();
            setSuccess(true);
          } catch (e) {
            setError('Payment verified but activation failed. Contact support.');
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => setPaying(false),
        },
        prefill: {},
        theme: { color: '#7c3aed' },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (r) => {
        setError(`Payment failed: ${r.error.description}`);
        setPaying(false);
      });
      rzp.open();
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
      setPaying(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <Zap size={18} className={styles.zapIcon} />
            <div>
              <div className={styles.headerTitle}>Upgrade to Infer Pro</div>
              <div className={styles.headerSub}>Unlock unlimited access for your clinic</div>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>

        {/* Limit warning */}
        {limitMessage && (
          <div className={styles.limitBanner}>
            <AlertTriangle size={14} />
            {limitMessage}
          </div>
        )}

        {success ? (
          <div className={styles.successBox}>
            <div className={styles.successIcon}>🎉</div>
            <h3>You're now on Infer Pro!</h3>
            <p>All limits have been removed. Enjoy unlimited access.</p>
            <button className={styles.doneBtn} onClick={onClose}>Continue</button>
          </div>
        ) : (
          <div className={styles.body}>
            {/* Left: features */}
            <div className={styles.features}>
              <div className={styles.featuresTitle}>What you get with Pro</div>
              <ul className={styles.featureList}>
                {PRO_FEATURES.map((f, i) => (
                  <li key={i} className={styles.featureItem}>
                    <Check size={13} className={styles.checkIcon} strokeWidth={2.5} />
                    {f}
                  </li>
                ))}
              </ul>
              <div className={styles.currentPlan}>
                <div className={styles.currentPlanLabel}>Current plan</div>
                <div className={styles.currentPlanName}>{sub?.display_name || 'Base Plan'}</div>
                <div className={styles.usageRow}>
                  <span>Patients:</span>
                  <span>{sub?.max_patients} limit</span>
                </div>
                <div className={styles.usageRow}>
                  <span>Appointments:</span>
                  <span>{sub?.max_appointments} limit</span>
                </div>
                <div className={styles.usageRow}>
                  <span>Prescriptions:</span>
                  <span>{sub?.max_prescriptions} limit</span>
                </div>
              </div>
            </div>

            {/* Right: checkout */}
            <div className={styles.checkout}>
              <div className={styles.checkoutTitle}>Choose your plan</div>

              {/* Billing cycle */}
              <div className={styles.cycles}>
                {CYCLES.map(c => (
                  <button
                    key={c.key}
                    className={`${styles.cycleBtn} ${cycle === c.key ? styles.cycleBtnActive : ''}`}
                    onClick={() => setCycle(c.key)}
                  >
                    {c.label}
                    {c.badge && <span className={styles.cycleBadge}>{c.badge}</span>}
                  </button>
                ))}
              </div>

              {/* Seats */}
              <div className={styles.seatsRow}>
                <span className={styles.seatsLabel}>Seats</span>
                <div className={styles.seatsControl}>
                  <button className={styles.seatsBtn} onClick={() => setSeats(s => Math.max(1, s - 1))}>−</button>
                  <span className={styles.seatsNum}>{seats}</span>
                  <button className={styles.seatsBtn} onClick={() => setSeats(s => s + 1)}>+</button>
                </div>
                <span className={styles.seatsHint}>1 seat = 1 daily login slot</span>
              </div>

              {/* Price */}
              <div className={styles.priceBox}>
                <div className={styles.priceMain}>
                  ₹{unitPrice.toLocaleString('en-IN')}
                  <span className={styles.pricePer}>/seat/{cycle === 'monthly' ? 'month' : 'month (billed ' + cycleInfo.label.toLowerCase() + ')'}</span>
                </div>
                {seats > 1 && (
                  <div className={styles.priceTotal}>
                    Total: ₹{totalRs.toLocaleString('en-IN')} for {seats} seats
                  </div>
                )}
              </div>

              {error && <div className={styles.errorMsg}><AlertTriangle size={13} /> {error}</div>}

              <button
                className={styles.payBtn}
                onClick={pay}
                disabled={paying || !proPrices}
              >
                {paying
                  ? 'Opening payment…'
                  : <>Pay ₹{totalRs.toLocaleString('en-IN')} <ArrowRight size={14} /></>
                }
              </button>

              <p className={styles.payNote}>
                Secured by Razorpay · GST applicable · Auto-activates on payment
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
