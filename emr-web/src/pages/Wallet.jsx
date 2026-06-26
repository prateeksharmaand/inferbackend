import React, { useState } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Wallet() {
  const { wallet, summary, loading, fetchWallet } = useWallet();
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

  const handleDownloadInvoice = (transactionId) => {
    toast.success('Invoice download started');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '16px', fontSize: '32px' }}>💳</div>
          <p style={{ color: 'var(--color-text-2)' }}>Loading wallet...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          💳 Wallet & Credits
        </h1>
        <p style={{ color: 'var(--color-text-2)' }}>Manage your credits and purchase new packs</p>
      </div>

      {/* Balance Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        {/* Current Balance */}
        <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-lg)', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ fontSize: '12px', color: 'var(--color-text-2)', marginBottom: '8px' }}>Current Balance</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#3b82f6', marginBottom: '8px' }}>₹{currentBalance.toFixed(2)}</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-3)' }}>{Math.floor(currentBalance)} credits available</div>
          <button
            onClick={() => navigate('/wallet')}
            style={{ width: '100%', background: '#3b82f6', color: 'white', border: 'none', padding: '12px 16px', borderRadius: '6px', marginTop: '16px', fontWeight: '600', cursor: 'pointer' }}
            onMouseOver={(e) => e.target.style.background = '#2563eb'}
            onMouseOut={(e) => e.target.style.background = '#3b82f6'}
          >
            Recharge Now
          </button>
        </div>

        {/* Lifetime Purchased */}
        <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-lg)', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '12px', color: 'var(--color-text-2)', marginBottom: '8px' }}>Lifetime Purchased</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#10b981', marginBottom: '8px' }}>₹{lifetimePurchased.toFixed(2)}</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-3)' }}>Total credits purchased</div>
        </div>

        {/* Lifetime Used */}
        <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-lg)', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '12px', color: 'var(--color-text-2)', marginBottom: '8px' }}>Lifetime Used</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#f59e0b', marginBottom: '8px' }}>₹{lifetimeUsed.toFixed(2)}</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-3)' }}>Total credits consumed</div>
        </div>
      </div>

      {/* Monthly Usage */}
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '32px', boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>📊 This Month Usage</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div style={{ padding: '16px', background: '#eff6ff', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: '12px', color: 'var(--color-text-2)' }}>SMS</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>₹0.14</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-3)' }}>per message</div>
          </div>
          <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: '12px', color: 'var(--color-text-2)' }}>WhatsApp</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>₹0.66</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-3)' }}>per message</div>
          </div>
          <div style={{ padding: '16px', background: '#faf5ff', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: '12px', color: 'var(--color-text-2)' }}>Prescription</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#a855f7' }}>₹1.00</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-3)' }}>per prescription</div>
          </div>
          <div style={{ padding: '16px', background: '#fffbeb', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: '12px', color: 'var(--color-text-2)' }}>Total This Month</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>₹{monthUsed.toFixed(2)}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-3)' }}>amount used</div>
          </div>
        </div>
      </div>

      {/* Credit Packs */}
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '32px', boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>Available Credit Packs</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
          {packs.map((pack) => (
            <div
              key={pack.id}
              style={{
                border: selectedPack?.id === pack.id ? '2px solid #3b82f6' : '2px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: '24px',
                background: selectedPack?.id === pack.id ? '#eff6ff' : 'var(--color-surface)',
                transition: 'all 0.2s ease'
              }}
            >
              {pack.isPopular && (
                <div style={{ display: 'inline-block', background: '#3b82f6', color: 'white', padding: '4px 12px', borderRadius: '16px', fontSize: '12px', fontWeight: '600', marginBottom: '12px', marginRight: '8px' }}>
                  Popular
                </div>
              )}
              {pack.isBestValue && (
                <div style={{ display: 'inline-block', background: '#10b981', color: 'white', padding: '4px 12px', borderRadius: '16px', fontSize: '12px', fontWeight: '600', marginBottom: '12px' }}>
                  Best Value
                </div>
              )}
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', marginTop: '8px' }}>{pack.name}</h3>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#3b82f6' }}>{Math.floor(pack.credits)}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-2)' }}>credits</div>
              </div>
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px', paddingBottom: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--color-text-2)' }}>Base Price</span>
                  <span style={{ fontWeight: '600' }}>₹{pack.priceInr.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--color-text-2)' }}>GST (18%)</span>
                  <span style={{ fontWeight: '600' }}>₹{pack.gstAmount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold' }}>
                  <span>Total</span>
                  <span style={{ color: '#3b82f6' }}>₹{pack.totalAmount.toFixed(2)}</span>
                </div>
              </div>
              <button
                onClick={() => handleRecharge(pack)}
                style={{
                  width: '100%',
                  background: selectedPack?.id === pack.id ? '#3b82f6' : 'var(--color-bg)',
                  color: selectedPack?.id === pack.id ? 'white' : 'var(--color-text)',
                  border: 'none',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.target.style.background = '#3b82f6';
                  e.target.style.color = 'white';
                }}
                onMouseOut={(e) => {
                  e.target.style.background = selectedPack?.id === pack.id ? '#3b82f6' : 'var(--color-bg)';
                  e.target.style.color = selectedPack?.id === pack.id ? 'white' : 'var(--color-text)';
                }}
              >
                {selectedPack?.id === pack.id ? 'Selected' : 'Select Pack'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction History */}
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>Recent Transactions</h2>
        {summary?.recentTransactions && summary.recentTransactions.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                  <th style={{ textAlign: 'left', padding: '12px', color: 'var(--color-text-2)', fontWeight: '600', fontSize: '12px' }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '12px', color: 'var(--color-text-2)', fontWeight: '600', fontSize: '12px' }}>Service</th>
                  <th style={{ textAlign: 'right', padding: '12px', color: 'var(--color-text-2)', fontWeight: '600', fontSize: '12px' }}>Amount</th>
                  <th style={{ textAlign: 'right', padding: '12px', color: 'var(--color-text-2)', fontWeight: '600', fontSize: '12px' }}>Balance</th>
                  <th style={{ textAlign: 'left', padding: '12px', color: 'var(--color-text-2)', fontWeight: '600', fontSize: '12px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentTransactions.map((txn, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '12px', fontWeight: '600' }}>
                      <span>{txn.type === 'purchase' ? '📥' : '📤'} {txn.type}</span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--color-text-2)', textTransform: 'capitalize' }}>{txn.service || '-'}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>
                      {txn.type === 'purchase' ? '+' : '-'}₹{Math.abs(txn.amount).toFixed(2)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: 'var(--color-text-2)' }}>₹{txn.balanceAfter.toFixed(2)}</td>
                    <td style={{ padding: '12px', color: 'var(--color-text-2)', fontSize: '12px' }}>{new Date(txn.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
            <p style={{ color: 'var(--color-text-2)' }}>No transactions yet</p>
            <p style={{ fontSize: '12px', color: 'var(--color-text-3)', marginTop: '8px' }}>Start by recharging your wallet or using services</p>
          </div>
        )}
      </div>

      {/* FAQ Section */}
      <div style={{ marginTop: '32px', background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>❓ Frequently Asked Questions</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <FAQItem question="What are Infer Credits?" answer="Infer Credits are a virtual currency for premium services: WhatsApp (₹0.66), SMS (₹0.14), and prescriptions (₹1.00). Your subscription covers core features; credits are pay-as-you-go." />
          <FAQItem question="Do credits expire?" answer="No! Credits never expire as long as your subscription is active. If your subscription lapses, credits will also expire." />
          <FAQItem question="How long will credits last?" answer="For 10 patients/day: Starter (200) ≈ 12 days, Professional (500) ≈ 30 days, Enterprise (1000) ≈ 60 days." />
          <FAQItem question="What happens when credits run out?" answer="You'll get a low balance alert at 50 credits. When empty, you won't be able to send messages or create prescriptions." />
        </div>
      </div>
    </div>
  );
}

function FAQItem({ question, answer }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '16px',
          textAlign: 'left',
          fontWeight: '600',
          background: isOpen ? 'var(--color-bg)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
        onMouseOver={(e) => e.target.style.background = 'var(--color-bg)'}
        onMouseOut={(e) => e.target.style.background = isOpen ? 'var(--color-bg)' : 'transparent'}
      >
        <span>{question}</span>
        <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>▼</span>
      </button>
      {isOpen && (
        <div style={{ padding: '16px', background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)', color: 'var(--color-text-2)' }}>
          {answer}
        </div>
      )}
    </div>
  );
}
