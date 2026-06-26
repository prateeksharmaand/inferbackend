# Infer Credits - Implementation Steps

## 📦 Components Created

✅ **useWallet.js** - Custom React hook for wallet operations  
✅ **CreditsBadge.jsx** - Top navigation bar component  
✅ **CreditsWidget.jsx** - Sidebar component  
✅ **PatientActions.jsx** - Patient card actions component  

---

## 🚀 Integration Steps

### Step 1: Copy Files to Your React App

Place the files in your `src` directory:

```
src/
├── hooks/
│   └── useWallet.js           (new)
└── components/
    ├── CreditsBadge.jsx       (new)
    ├── CreditsWidget.jsx      (new)
    └── PatientActions.jsx     (new)
```

### Step 2: Add to Navigation/Header

In your `Navigation.jsx` or `Header.jsx`:

```jsx
import { CreditsBadge } from '../components/CreditsBadge';

export const Navigation = () => {
  return (
    <nav className="flex justify-between items-center p-4">
      <div className="flex-1">
        {/* Your existing nav items */}
      </div>
      <div className="flex items-center gap-4">
        <CreditsBadge />  {/* ← ADD THIS */}
        {/* Your existing user profile */}
      </div>
    </nav>
  );
};
```

### Step 3: Add to Sidebar

In your `Sidebar.jsx`:

```jsx
import { CreditsWidget } from '../components/CreditsWidget';

export const Sidebar = () => {
  return (
    <div className="w-60 bg-gray-900 text-white h-screen flex flex-col">
      {/* Your existing sidebar content */}

      {/* Credits Widget - Add before Settings */}
      <div className="border-t border-gray-700">
        <CreditsWidget />  {/* ← ADD THIS */}
      </div>

      {/* Settings and other items */}
    </div>
  );
};
```

### Step 4: Add to Patient Card/List

In your `PatientCard.jsx` or patient list component:

```jsx
import { PatientActions } from '../components/PatientActions';

export const PatientCard = ({ patient }) => {
  return (
    <div className="border rounded-lg p-4">
      <h3 className="text-lg font-bold">{patient.name}</h3>
      <p className="text-gray-600">{patient.phone}</p>

      {/* Add this component */}
      <div className="mt-4 pt-4 border-t">
        <PatientActions 
          patientId={patient.id}
          onAction={(result) => {
            if (result.success) {
              console.log(`${result.service} sent successfully`);
              // Refresh patient data or show success message
            }
          }}
        />
      </div>
    </div>
  );
};
```

### Step 5: Environment Configuration

Make sure your `.env` file has:

```env
REACT_APP_API_URL=https://api.inferapp.online/api
```

Or if running locally:

```env
REACT_APP_API_URL=http://localhost:3000/api
```

---

## 🎯 Component Features

### CreditsBadge (Top Nav)
- ✅ Shows current balance
- ✅ Color changes on low balance (red)
- ✅ Clickable → navigates to wallet
- ✅ Auto-refreshes every 30 seconds
- ✅ Shows credits count

**Props**: None (uses context/hook)

**Size**: Small badge (fits in header)

---

### CreditsWidget (Sidebar)
- ✅ Shows detailed balance
- ✅ Monthly usage stats
- ✅ Days remaining estimate
- ✅ Low balance alert (yellow)
- ✅ Critical balance alert (red)
- ✅ "Recharge Now" button
- ✅ "View Details" button

**Props**: None (uses context/hook)

**Size**: Sidebar width (~250px)

---

### PatientActions (Patient Card)
- ✅ SMS button (0.14 credits)
- ✅ WhatsApp button (0.66 credits)
- ✅ Prescription button (1.00 credit)
- ✅ Shows current balance
- ✅ Disables buttons if insufficient credits
- ✅ Confirmation dialog before action
- ✅ Cost preview before deduction
- ✅ Insufficient credits dialog with recharge link
- ✅ Error handling

**Props**:
```jsx
<PatientActions 
  patientId="uuid"                    // Required
  onAction={(result) => {...}}        // Optional callback
/>
```

**Result object**:
```js
{
  service: 'sms' | 'whatsapp' | 'prescription',
  patientId: 'uuid',
  success: true | false
}
```

---

## 🔧 Customization

### Change Colors

Edit the Tailwind classes in each component:

```jsx
// CreditsBadge
'bg-blue-50'    → 'bg-purple-50'   // Change to any color
'border-blue-200' → 'border-purple-200'
```

### Change Costs

In `PatientActions.jsx`:

```js
const COSTS = {
  sms: 0.14,        // ← Change this
  whatsapp: 0.66,   // ← Change this
  prescription: 1.00 // ← Change this
};
```

### Auto-Refresh Interval

In `useWallet.js`:

```js
const interval = setInterval(() => {
  fetchWallet();
  fetchSummary();
}, 30000);  // ← Change milliseconds (30000 = 30 seconds)
```

---

## 🧪 Testing

### Test 1: Display Components
- [ ] CreditsBadge shows in top nav
- [ ] CreditsWidget shows in sidebar
- [ ] PatientActions shows in patient card

### Test 2: Balance Display
- [ ] Balance updates in real-time
- [ ] Low balance alert appears (< 100)
- [ ] Critical alert appears (< 50)

### Test 3: Send SMS
- [ ] Click SMS button
- [ ] See confirmation dialog
- [ ] Click "Send"
- [ ] Balance decreases by 0.14
- [ ] Dialog closes

### Test 4: Send WhatsApp
- [ ] Click WhatsApp button
- [ ] See confirmation dialog
- [ ] Click "Send"
- [ ] Balance decreases by 0.66
- [ ] Dialog closes

### Test 5: Create Prescription
- [ ] Click Rx button
- [ ] See confirmation dialog
- [ ] Click "Send"
- [ ] Balance decreases by 1.00
- [ ] Dialog closes

### Test 6: Insufficient Credits
- [ ] Use balance until < 0.14
- [ ] Try to send SMS
- [ ] See "Insufficient Credits" dialog
- [ ] Click "Recharge Now"
- [ ] Navigate to wallet/recharge

### Test 7: Navigation
- [ ] Click CreditsBadge → goes to /wallet
- [ ] Click "Recharge Now" → goes to /wallet/recharge
- [ ] Click "View Details" → goes to /wallet

---

## 🐛 Troubleshooting

### Components not showing

**Issue**: Components don't appear in UI

**Fix**:
1. Check imports are correct
2. Verify React Router is set up (for navigation)
3. Check browser console for errors

### Balance not updating

**Issue**: Balance shows old value

**Fix**:
1. Check API_BASE URL in .env
2. Check token in localStorage
3. Check API endpoint `/api/wallet` is working
4. Clear browser cache

### Buttons disabled

**Issue**: All buttons are disabled/grayed out

**Fix**:
1. Check wallet is loading (`!loading` check)
2. Check balance is fetched properly
3. Try refreshing page

### Dialog not closing

**Issue**: Dialog stays open after action

**Fix**:
1. Check `onAction` callback is provided
2. Check API deduct endpoint is responding
3. Try manual refresh (F5)

---

## 📋 Checklist Before Production

- [ ] Files copied to `src/` directory
- [ ] CreditsBadge added to Navigation
- [ ] CreditsWidget added to Sidebar
- [ ] PatientActions added to patient component
- [ ] `.env` configured with API_BASE
- [ ] All 4 tests pass
- [ ] Low balance alerts work
- [ ] Navigation links work
- [ ] API endpoints respond
- [ ] No console errors

---

## 🎨 Styling Notes

All components use **Tailwind CSS**. Make sure your project has:

```json
{
  "devDependencies": {
    "tailwindcss": "^3.0.0"
  }
}
```

Key Tailwind classes used:
- Colors: `blue`, `red`, `yellow`, `green`, `purple`, `gray`
- Responsive: `flex`, `gap`, `p-`, `m-`, `text-`
- Interactive: `hover:`, `active:`, `disabled:`, `cursor-pointer`

---

## 🔗 API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/wallet` | GET | Get wallet details |
| `/wallet/summary` | GET | Get stats (monthly usage, days left) |
| `/wallet/check-balance` | POST | Check if balance sufficient |
| `/wallet/deduct` | POST | Deduct credits |

All endpoints require: `Authorization: Bearer {token}`

---

## 💾 State Management

The components use:
- **React Hooks** (`useState`, `useEffect`, `useCallback`)
- **Custom Hook** (`useWallet`) for API calls
- **React Router** (`useNavigate`) for navigation
- **localStorage** for JWT token

No Redux or additional state management needed!

---

## 🚀 Ready to Deploy

After following all steps:

1. Start your React dev server
2. Test components in browser
3. Run test checklist
4. Deploy to production

**Questions?** Check troubleshooting section above.

---

**Version**: 1.0  
**Last Updated**: 2026-06-26  
**Status**: Ready for Implementation
