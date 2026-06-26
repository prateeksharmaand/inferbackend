# Infer Credits - UI Integration Guide

Add wallet/credits display in all key places of the Infer EMR interface.

---

## 📍 Placement Map

```
┌──────────────────────────────────────────────────────────────┐
│  [Logo]  [Search/Patients] ... [Support] [💳 234.50] [👤 Dr]│  ← #1: Top Right
├──────────────────────────────────────────────────────────────┤
│ [Queue] [Patients] [Analytics]                               │
├──────────────────────────────────────────────────────────────┤
│ [↕]                                                          │
│ [Queue]  ┌─────────────────────────────────────┐            │
│ [Payments]│ YOUR CREDITS                      │            │
│ [Analytics] │ 234.50 Credits            │  ← #2: Sidebar│
│ [Settings]│ [Recharge Now]                    │            │
│           └─────────────────────────────────────┘            │
│                                                              │
│           ┌─────────────────────────────────────┐            │
│           │ Morning OPD                        │            │
│           │ [Send SMS] [Send WA] [Rx]  [Cost]│  ← #3: Action Row
│           │ Balance: 234.50 → 233.84          │            │
│           └─────────────────────────────────────┘            │
│                                                              │
│           ┌─────────────────────────────────────┐            │
│           │ Patient: Priya                     │            │
│           │ [Resume] [Complete] [Rx] [Cost]  │  ← #4: Patient
│           │ Balance: 234.50                    │            │
│           └─────────────────────────────────────┘            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## #1: Top Right Navigation Bar

### Location
Next to user profile, showing balance at a glance.

### React Component

```jsx
// src/components/CreditsBadge.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export const CreditsBadge = () => {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWalletBalance();
  }, []);

  const fetchWalletBalance = async () => {
    try {
      const response = await fetch('/api/wallet', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      setBalance(data.wallet.currentBalance);
    } catch (error) {
      console.error('Error fetching wallet:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecharge = () => {
    window.location.href = '/wallet/recharge';
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
         onClick={handleRecharge}>
      <div className="text-right">
        <div className="text-sm font-semibold text-gray-900">
          {loading ? '...' : `₹${balance.toFixed(2)}`}
        </div>
        <div className="text-xs text-gray-500">
          {loading ? 'Loading' : `${Math.floor(balance)} credits`}
        </div>
      </div>
      <div className="text-2xl">💳</div>
    </div>
  );
};

// Usage in Navigation.jsx
import { CreditsBadge } from './CreditsBadge';

export const Navigation = () => {
  return (
    <nav className="flex justify-between items-center p-4 bg-white border-b">
      <div className="flex-1">
        {/* Logo and menu items */}
      </div>
      <div className="flex items-center gap-4">
        <CreditsBadge />
        <UserProfile />
      </div>
    </nav>
  );
};
```

### Expected Output
```
┌─────────────────────┬──────────┐
│  Search Patients    │ ₹234.50  │👤
│                     │ 234 cred │
└─────────────────────┴──────────┘
```

---

## #2: Sidebar Widget

### Location
Left sidebar, below main menu items, always visible.

### React Component

```jsx
// src/components/CreditsWidget.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export const CreditsWidget = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [lowBalance, setLowBalance] = useState(false);

  useEffect(() => {
    fetchSummary();
    // Refresh every 30 seconds
    const interval = setInterval(fetchSummary, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchSummary = async () => {
    try {
      const response = await fetch('/api/wallet/summary', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      setSummary(data.summary);
      setLowBalance(data.summary.currentBalance < 100);
    } catch (error) {
      console.error('Error fetching wallet summary:', error);
    }
  };

  if (!summary) return <div className="p-4 text-gray-400">Loading...</div>;

  return (
    <div className={`
      m-3 p-4 rounded-lg border-2
      ${lowBalance 
        ? 'bg-red-50 border-red-200' 
        : 'bg-blue-50 border-blue-200'
      }
    `}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold text-gray-700">YOUR CREDITS</div>
        <div className="text-2xl">💳</div>
      </div>

      <div className="text-3xl font-bold text-gray-900 mb-1">
        {summary.currentBalance.toFixed(2)}
      </div>
      <div className="text-xs text-gray-600 mb-3">
        {Math.floor(summary.currentBalance)} credits available
      </div>

      {lowBalance && (
        <div className="text-xs bg-red-100 text-red-700 p-2 rounded mb-3 border border-red-200">
          ⚠️ Low balance! Only {Math.floor(summary.currentBalance)} credits left.
        </div>
      )}

      <div className="space-y-2 mb-3 text-xs text-gray-600">
        <div className="flex justify-between">
          <span>This month:</span>
          <span className="font-semibold">₹{summary.monthCreditsUsed.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Days remaining:</span>
          <span className="font-semibold">
            {summary.daysRemaining > 0 ? `~${summary.daysRemaining}` : '∞'}
          </span>
        </div>
      </div>

      <button
        onClick={() => window.location.href = '/wallet/recharge'}
        className={`
          w-full py-2 px-3 rounded font-semibold text-white text-sm
          ${lowBalance 
            ? 'bg-red-600 hover:bg-red-700' 
            : 'bg-blue-600 hover:bg-blue-700'
          }
        `}
      >
        {lowBalance ? 'Recharge Now!' : 'Recharge'}
      </button>

      <button
        onClick={() => window.location.href = '/wallet'}
        className="w-full mt-2 py-2 px-3 rounded font-semibold text-gray-700 text-sm border border-gray-300 hover:bg-gray-100"
      >
        View Details
      </button>
    </div>
  );
};

// Usage in Sidebar.jsx
import { CreditsWidget } from './CreditsWidget';

export const Sidebar = () => {
  return (
    <div className="w-60 bg-gray-900 text-white h-screen flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold">Infer Care</h1>
      </div>

      {/* Menu Items */}
      <nav className="flex-1 overflow-y-auto">
        <MenuItem icon="📋" label="Queue" href="/queue" />
        <MenuItem icon="👥" label="Patients" href="/patients" />
        <MenuItem icon="💰" label="Payments" href="/payments" />
        <MenuItem icon="📊" label="Analytics" href="/analytics" />
      </nav>

      {/* Credits Widget */}
      <div className="border-t border-gray-700">
        <CreditsWidget />
      </div>

      {/* Settings */}
      <div className="p-4 border-t border-gray-700">
        <MenuItem icon="⚙️" label="Settings" href="/settings" />
      </div>
    </div>
  );
};
```

### Expected Output
```
┌──────────────────┐
│ YOUR CREDITS     │
│                  │
│ 234.50           │
│ 234 credits      │
│                  │
│ This month:      │
│ ₹50.00           │
│ Days left: ~71   │
│                  │
│ [Recharge Now]   │
│ [View Details]   │
└──────────────────┘
```

---

## #3: Action Row Credit Preview

### Location
Above patient queue, showing cost of actions.

### React Component

```jsx
// src/components/ActionRow.jsx
import React, { useState } from 'react';
import { useWallet } from '../hooks/useWallet';

export const ActionRow = ({ patientId }) => {
  const { wallet, checkBalance } = useWallet();
  const [costs, setCosts] = useState({
    sms: null,
    whatsapp: null,
    prescription: null
  });

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    const pricingResponse = await fetch('/api/wallet/packs');
    const data = await pricingResponse.json();
    // Extract pricing from packs data
  };

  const handleSendSMS = async () => {
    const hasBalance = await checkBalance('sms', 1);
    if (!hasBalance.hasBalance) {
      showInsufficientCreditsDialog(hasBalance);
      return;
    }
    // Proceed with SMS
  };

  const handleSendWhatsApp = async () => {
    const hasBalance = await checkBalance('whatsapp', 1);
    if (!hasBalance.hasBalance) {
      showInsufficientCreditsDialog(hasBalance);
      return;
    }
    // Proceed with WhatsApp
  };

  return (
    <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
      
      {/* SMS Button */}
      <button 
        onClick={handleSendSMS}
        className="flex items-center gap-2 px-3 py-2 bg-white border rounded hover:bg-gray-100"
      >
        <span>📱 SMS</span>
        <span className="text-xs text-gray-600">0.14</span>
      </button>

      {/* WhatsApp Button */}
      <button 
        onClick={handleSendWhatsApp}
        className="flex items-center gap-2 px-3 py-2 bg-white border rounded hover:bg-gray-100"
      >
        <span>💬 WhatsApp</span>
        <span className="text-xs text-gray-600">0.66</span>
      </button>

      {/* Prescription Button */}
      <button 
        onClick={handleCreatePrescription}
        className="flex items-center gap-2 px-3 py-2 bg-white border rounded hover:bg-gray-100"
      >
        <span>💊 Rx</span>
        <span className="text-xs text-gray-600">1.00</span>
      </button>

      {/* Balance Display */}
      <div className="ml-auto flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded">
        <span className="text-sm font-semibold text-gray-700">
          Balance: ₹{wallet?.currentBalance.toFixed(2)}
        </span>
        {wallet?.currentBalance < 100 && (
          <button 
            onClick={() => window.location.href = '/wallet/recharge'}
            className="ml-2 px-2 py-1 bg-red-600 text-white text-xs rounded font-semibold"
          >
            Recharge
          </button>
        )}
      </div>
    </div>
  );
};
```

### Expected Output
```
┌────────────────────────────────────────────────┐
│ [📱 SMS 0.14] [💬 WA 0.66] [💊 Rx 1.00]    │
│                                 Balance: ₹234.50 │
└────────────────────────────────────────────────┘
```

---

## #4: Patient Action Button With Cost

### Location
Inside patient card, next to action buttons.

### React Component

```jsx
// src/components/PatientActions.jsx
import React from 'react';
import { useWallet } from '../hooks/useWallet';

export const PatientActions = ({ patient }) => {
  const { wallet, deductCredits } = useWallet();
  const [showCostPreview, setShowCostPreview] = useState(null);

  const handleSendWhatsApp = async () => {
    const preview = {
      service: 'WhatsApp',
      cost: 0.66,
      before: wallet.currentBalance,
      after: wallet.currentBalance - 0.66
    };

    // Show preview dialog
    const confirmed = await showConfirmDialog(preview);
    
    if (confirmed) {
      // Send message and deduct credits
      await deductCredits('whatsapp', 1);
    }
  };

  const showConfirmDialog = (preview) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-sm">
        <h3 className="text-lg font-bold mb-4">Send WhatsApp Message</h3>
        
        <div className="space-y-3 mb-6 p-3 bg-blue-50 rounded border border-blue-200">
          <div className="flex justify-between text-sm">
            <span className="text-gray-700">Service:</span>
            <span className="font-semibold">{preview.service}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-700">Cost:</span>
            <span className="font-semibold text-blue-600">-{preview.cost} credits (₹{preview.cost})</span>
          </div>
          <div className="border-t border-blue-200 pt-3 mt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-700">Current Balance:</span>
              <span className="font-semibold">{preview.before.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm mt-2">
              <span className="text-gray-700">After Send:</span>
              <span className="font-semibold text-green-600">{preview.after.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {wallet.currentBalance < preview.cost && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            ⚠️ Insufficient credits! You need {preview.cost} but only have {wallet.currentBalance}.
          </div>
        )}

        <div className="flex gap-3">
          <button 
            onClick={() => setShowCostPreview(null)}
            className="flex-1 px-4 py-2 border rounded font-semibold hover:bg-gray-100"
          >
            Cancel
          </button>
          <button 
            onClick={handleSendWhatsApp}
            disabled={wallet.currentBalance < preview.cost}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            Send Message
          </button>
          {wallet.currentBalance < preview.cost && (
            <button 
              onClick={() => window.location.href = '/wallet/recharge'}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded font-semibold hover:bg-red-700"
            >
              Recharge
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex gap-2">
      <button 
        onClick={() => setShowCostPreview('sms')}
        className="px-3 py-1 bg-gray-100 rounded text-sm hover:bg-gray-200"
      >
        SMS <span className="text-gray-500">(0.14)</span>
      </button>
      <button 
        onClick={() => setShowCostPreview('whatsapp')}
        className="px-3 py-1 bg-gray-100 rounded text-sm hover:bg-gray-200"
      >
        WhatsApp <span className="text-gray-500">(0.66)</span>
      </button>
      <button 
        onClick={() => setShowCostPreview('prescription')}
        className="px-3 py-1 bg-gray-100 rounded text-sm hover:bg-gray-200"
      >
        Rx <span className="text-gray-500">(1.00)</span>
      </button>
      {wallet.currentBalance < 100 && (
        <span className="ml-auto text-xs text-red-600 font-semibold">
          Low: ₹{wallet.currentBalance.toFixed(2)}
        </span>
      )}
    </div>
  );
};
```

### Expected Output
```
┌─────────────────────────────────────┐
│ Patient: Priya                      │
│ [SMS 0.14] [WA 0.66] [Rx 1.00]    │
│                   Low: ₹45.50       │
└─────────────────────────────────────┘
```

---

## #5: Custom Hook for Wallet Operations

### React Hook

```jsx
// src/hooks/useWallet.js
import { useState, useEffect } from 'react';

export const useWallet = () => {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchWallet();
  }, []);

  const fetchWallet = async () => {
    try {
      const response = await fetch('/api/wallet', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setWallet(data.wallet);
    } catch (error) {
      console.error('Error fetching wallet:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkBalance = async (serviceType, quantity = 1) => {
    try {
      const response = await fetch('/api/wallet/check-balance', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ serviceType, quantity })
      });
      const data = await response.json();
      return {
        hasBalance: data.hasBalance,
        currentBalance: data.currentBalance,
        requiredCredits: data.requiredCredits
      };
    } catch (error) {
      console.error('Error checking balance:', error);
      return { hasBalance: false };
    }
  };

  const deductCredits = async (serviceType, quantity, referenceId) => {
    try {
      const response = await fetch('/api/wallet/deduct', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          serviceType,
          quantity,
          referenceId: referenceId || `${serviceType}_${Date.now()}`
        })
      });

      if (response.status === 402) {
        throw new Error('Insufficient credits');
      }

      const data = await response.json();
      await fetchWallet(); // Refresh balance
      return data;
    } catch (error) {
      console.error('Error deducting credits:', error);
      throw error;
    }
  };

  return {
    wallet,
    loading,
    fetchWallet,
    checkBalance,
    deductCredits
  };
};
```

---

## 🎨 Tailwind CSS Styling

Add these to your `tailwind.config.js` for consistent styling:

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        'credits-blue': '#3B82F6',
        'credits-red': '#EF4444',
        'credits-green': '#10B981',
      }
    }
  }
}
```

---

## ✅ Implementation Checklist

- [ ] Add `CreditsBadge` to Navigation bar
- [ ] Add `CreditsWidget` to Sidebar
- [ ] Add `ActionRow` to Queue screen
- [ ] Add `PatientActions` to patient cards
- [ ] Create `useWallet` hook
- [ ] Test SMS deduction
- [ ] Test WhatsApp deduction
- [ ] Test Prescription deduction
- [ ] Test insufficient credits flow
- [ ] Test Recharge button flow
- [ ] Add real-time balance refresh (WebSocket optional)

---

## 🚀 Deployment Steps

1. **Install dependencies** (if needed)
   ```bash
   npm install axios
   ```

2. **Add wallet service** (Optional - for better organization)
   ```bash
   src/services/walletService.js
   ```

3. **Import components** in your main app
   ```jsx
   import { CreditsBadge } from './components/CreditsBadge';
   import { CreditsWidget } from './components/CreditsWidget';
   ```

4. **Test each placement** according to UI Testing Guide

---

**Ready to implement!** Which component would you like to add first? 🎯
