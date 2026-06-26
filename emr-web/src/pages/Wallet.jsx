import React, { useState } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import styles from './Wallet.module.css';

export default function Wallet() {
  const { wallet, summary, loading } = useWallet();
  const navigate = useNavigate();
  const [selectedPack, setSelectedPack] = useState(null);
  const [packs] = useState([
    { id: 1, name: 'Starter Pack', credits: 200, priceInr: 200.00, gstAmount: 36.00, totalAmount: 236.00, isPopular: false, isBestValue: false },
    { id: 2, name: 'Professional Pack', credits: 500, priceInr: 500.00, gstAmount: 90.00, totalAmount: 590.00, isPopular: true, isBestValue: true },
    { id: 3, name: 'Enterprise Pack', credits: 1000, priceInr: 1000.00, gstAmount: 180.00, totalAmount: 1180.00, isPopular: false, isBestValue: false }
  ]);

  const currentBalance = parseFloat(wallet?.currentBalance || 0);
  const lifetimePurchased = parseFloat(wallet?.lifetimePurchased || 0);
  const lifetimeUsed = parseFloat(wallet?.lifetimeUsed || 0);
  const monthUsed = parseFloat(summary?.monthCreditsUsed || 0);

  const handleRecharge = (pack) => {
    setSelectedPack(pack);
    toast.success(`Selected ${pack.name}`);
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>💳 Wallet & Credits</h1>
        </div>
        <div className={styles.content}>
          <div className={styles.contentInner} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '16px' }}>💳</div>
              <p style={{ color: 'var(--color-text-2)' }}>Loading wallet...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>💳 Wallet & Credits</h1>
          <p className={styles.subtitle}>Manage your credits and purchase new packs</p>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className={styles.content}>
        <div className={styles.contentInner}>
          {/* Balance Cards */}
          <div className={styles.cards}>
            {/* Current Balance */}
            <div className={styles.card} style={{ borderLeftWidth: '4px', borderLeftColor: '#3b82f6' }}>
              <div className={styles.cardLabel}>Current Balance</div>
              <div className={styles.cardValue} style={{ color: '#3b82f6' }}>₹{currentBalance.toFixed(2)}</div>
              <div className={styles.cardSubtext}>{Math.floor(currentBalance)} credits available</div>
              <button
                onClick={() => navigate('/wallet')}
                className={`${styles.button} ${styles.buttonPrimary}`}
                style={{ marginTop: '16px' }}
              >
                Recharge Now
              </button>
            </div>

            {/* Lifetime Purchased */}
            <div className={styles.card} style={{ borderLeftWidth: '4px', borderLeftColor: '#10b981' }}>
              <div className={styles.cardLabel}>Lifetime Purchased</div>
              <div className={styles.cardValue} style={{ color: '#10b981' }}>₹{lifetimePurchased.toFixed(2)}</div>
              <div className={styles.cardSubtext}>Total credits purchased</div>
            </div>

            {/* Lifetime Used */}
            <div className={styles.card} style={{ borderLeftWidth: '4px', borderLeftColor: '#f59e0b' }}>
              <div className={styles.cardLabel}>Lifetime Used</div>
              <div className={styles.cardValue} style={{ color: '#f59e0b' }}>₹{lifetimeUsed.toFixed(2)}</div>
              <div className={styles.cardSubtext}>Total credits consumed</div>
            </div>
          </div>

          {/* Monthly Usage */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>📊 This Month Usage</h2>
            <div className={styles.grid}>
              <div className={styles.gridItem} style={{ background: '#eff6ff' }}>
                <div className={styles.cardLabel}>SMS</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#3b82f6' }}>₹0.14</div>
                <div className={styles.cardSubtext}>per message</div>
              </div>
              <div className={styles.gridItem} style={{ background: '#f0fdf4' }}>
                <div className={styles.cardLabel}>WhatsApp</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#10b981' }}>₹0.66</div>
                <div className={styles.cardSubtext}>per message</div>
              </div>
              <div className={styles.gridItem} style={{ background: '#faf5ff' }}>
                <div className={styles.cardLabel}>Prescription</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#a855f7' }}>₹1.00</div>
                <div className={styles.cardSubtext}>per prescription</div>
              </div>
              <div className={styles.gridItem} style={{ background: '#fffbeb' }}>
                <div className={styles.cardLabel}>Total This Month</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#f59e0b' }}>₹{monthUsed.toFixed(2)}</div>
                <div className={styles.cardSubtext}>amount used</div>
              </div>
            </div>
          </div>

          {/* Credit Packs */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Available Credit Packs</h2>
            <div className={styles.cards}>
              {packs.map((pack) => (
                <div
                  key={pack.id}
                  className={styles.card}
                  style={{
                    borderColor: selectedPack?.id === pack.id ? '#3b82f6' : 'var(--color-border)',
                    background: selectedPack?.id === pack.id ? '#eff6ff' : '#fff'
                  }}
                >
                  {pack.isPopular && (
                    <div style={{ display: 'inline-block', background: '#3b82f6', color: 'white', padding: '4px 12px', borderRadius: '16px', fontSize: '11px', fontWeight: '600', marginBottom: '12px', marginRight: '8px' }}>
                      Popular
                    </div>
                  )}
                  {pack.isBestValue && (
                    <div style={{ display: 'inline-block', background: '#10b981', color: 'white', padding: '4px 12px', borderRadius: '16px', fontSize: '11px', fontWeight: '600', marginBottom: '12px' }}>
                      Best Value
                    </div>
                  )}
                  <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px', marginTop: '8px' }}>{pack.name}</h3>
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: '#3b82f6' }}>{Math.floor(pack.credits)}</div>
                    <div className={styles.cardSubtext}>credits</div>
                  </div>
                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px', paddingBottom: '12px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                      <span>Base Price</span>
                      <span style={{ fontWeight: '600' }}>₹{pack.priceInr.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                      <span>GST (18%)</span>
                      <span style={{ fontWeight: '600' }}>₹{pack.gstAmount.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '700' }}>
                      <span>Total</span>
                      <span style={{ color: '#3b82f6' }}>₹{pack.totalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRecharge(pack)}
                    className={styles.button}
                    style={{
                      background: selectedPack?.id === pack.id ? '#3b82f6' : 'var(--color-bg)',
                      color: selectedPack?.id === pack.id ? 'white' : 'var(--color-text)',
                      marginTop: '12px'
                    }}
                    onMouseOver={(e) => {
                      if (selectedPack?.id !== pack.id) {
                        e.target.style.background = 'var(--color-primary)';
                        e.target.style.color = 'white';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (selectedPack?.id !== pack.id) {
                        e.target.style.background = 'var(--color-bg)';
                        e.target.style.color = 'var(--color-text)';
                      }
                    }}
                  >
                    {selectedPack?.id === pack.id ? 'Selected' : 'Select Pack'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Transaction History */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Recent Transactions</h2>
            {summary?.recentTransactions && summary.recentTransactions.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Type</th>
                      <th className={styles.th}>Service</th>
                      <th className={styles.th} style={{ textAlign: 'right' }}>Amount</th>
                      <th className={styles.th} style={{ textAlign: 'right' }}>Balance</th>
                      <th className={styles.th}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recentTransactions.map((txn, idx) => (
                      <tr key={idx}>
                        <td className={styles.td}>
                          <span>{txn.type === 'purchase' ? '📥' : '📤'} {txn.type}</span>
                        </td>
                        <td className={styles.td} style={{ textTransform: 'capitalize' }}>{txn.service || '-'}</td>
                        <td className={styles.td} style={{ textAlign: 'right', fontWeight: '600' }}>
                          {txn.type === 'purchase' ? '+' : '-'}₹{Math.abs(txn.amount).toFixed(2)}
                        </td>
                        <td className={styles.td} style={{ textAlign: 'right' }}>₹{txn.balanceAfter.toFixed(2)}</td>
                        <td className={styles.td}>{new Date(txn.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyEmoji}>📋</div>
                <p className={styles.emptyText}>No transactions yet</p>
                <p className={styles.emptySubtext}>Start by recharging your wallet or using services</p>
              </div>
            )}
          </div>

          {/* FAQ Section */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>❓ Frequently Asked Questions</h2>
            <FAQItem styles={styles} question="What are Infer Credits?" answer="Infer Credits are a virtual currency for premium services: WhatsApp (₹0.66), SMS (₹0.14), and prescriptions (₹1.00). Your subscription covers core features; credits are pay-as-you-go." />
            <FAQItem styles={styles} question="Do credits expire?" answer="No! Credits never expire as long as your subscription is active. If your subscription lapses, credits will also expire." />
            <FAQItem styles={styles} question="How long will credits last?" answer="For 10 patients/day: Starter (200) ≈ 12 days, Professional (500) ≈ 30 days, Enterprise (1000) ≈ 60 days." />
            <FAQItem styles={styles} question="What happens when credits run out?" answer="You'll get a low balance alert at 50 credits. When empty, you won't be able to send messages or create prescriptions." />
          </div>
        </div>
      </div>
    </div>
  );
}

function FAQItem({ styles, question, answer }) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className={styles.faqItem}>
      <button
        className={styles.faqButton}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{question}</span>
        <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}>▼</span>
      </button>
      {isOpen && (
        <div className={styles.faqContent}>
          {answer}
        </div>
      )}
    </div>
  );
}
