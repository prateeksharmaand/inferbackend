import React, { useState } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useNavigate } from 'react-router-dom';
import { CreditCard, TrendingUp, Download, ArrowUpRight, ArrowDownLeft, ChevronDown, HelpCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Wallet() {
  const { wallet, summary, loading, fetchWallet } = useWallet();
  const navigate = useNavigate();
  const [selectedPack, setSelectedPack] = useState(null);
  const [packs, setPacks] = useState([
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
    // TODO: Integrate with Razorpay payment gateway
  };

  const handleDownloadInvoice = (transactionId) => {
    toast.success('Invoice download started');
    // TODO: Implement invoice download
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="mb-4 text-2xl">💳</div>
          <p className="text-gray-600">Loading wallet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-10 h-10" />
            Wallet & Credits
          </h1>
          <p className="text-gray-600 mt-2">Manage your credits and purchase new packs</p>
        </div>

        {/* Balance Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Current Balance */}
          <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-blue-600">
            <div className="text-sm text-gray-600 mb-2">Current Balance</div>
            <div className="text-4xl font-bold text-blue-600 mb-2">₹{currentBalance.toFixed(2)}</div>
            <div className="text-xs text-gray-500">
              {Math.floor(currentBalance)} credits available
            </div>
            <button
              onClick={() => window.location.href = '/opd/wallet/recharge'}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-semibold transition-colors"
            >
              Recharge Now
            </button>
          </div>

          {/* Lifetime Purchased */}
          <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-green-600">
            <div className="text-sm text-gray-600 mb-2">Lifetime Purchased</div>
            <div className="text-4xl font-bold text-green-600 mb-2">₹{lifetimePurchased.toFixed(2)}</div>
            <div className="text-xs text-gray-500">
              Total credits purchased
            </div>
          </div>

          {/* Lifetime Used */}
          <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-orange-600">
            <div className="text-sm text-gray-600 mb-2">Lifetime Used</div>
            <div className="text-4xl font-bold text-orange-600 mb-2">₹{lifetimeUsed.toFixed(2)}</div>
            <div className="text-xs text-gray-500">
              Total credits consumed
            </div>
          </div>
        </div>

        {/* Monthly Usage */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              This Month Usage
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
              <div className="text-sm text-gray-600">SMS</div>
              <div className="text-2xl font-bold text-blue-600">₹0.14</div>
              <div className="text-xs text-gray-500">per message</div>
            </div>
            <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg">
              <div className="text-sm text-gray-600">WhatsApp</div>
              <div className="text-2xl font-bold text-green-600">₹0.66</div>
              <div className="text-xs text-gray-500">per message</div>
            </div>
            <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
              <div className="text-sm text-gray-600">Prescription</div>
              <div className="text-2xl font-bold text-purple-600">₹1.00</div>
              <div className="text-xs text-gray-500">per prescription</div>
            </div>
            <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg">
              <div className="text-sm text-gray-600">Total This Month</div>
              <div className="text-2xl font-bold text-orange-600">₹{monthUsed.toFixed(2)}</div>
              <div className="text-xs text-gray-500">amount used</div>
            </div>
          </div>
        </div>

        {/* Credit Packs */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Available Credit Packs</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {packs.map((pack) => (
              <div
                key={pack.id}
                className={`rounded-lg border-2 p-6 transition-all ${
                  selectedPack?.id === pack.id
                    ? 'border-blue-600 bg-blue-50 shadow-lg'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {pack.isPopular && (
                  <div className="mb-3 inline-block bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                    Popular
                  </div>
                )}
                {pack.isBestValue && (
                  <div className="mb-3 inline-block bg-green-600 text-white px-3 py-1 rounded-full text-xs font-semibold ml-2">
                    Best Value
                  </div>
                )}
                <h3 className="text-lg font-bold text-gray-900 mb-2">{pack.name}</h3>
                <div className="mb-4">
                  <div className="text-3xl font-bold text-blue-600 mb-1">{Math.floor(pack.credits)}</div>
                  <div className="text-sm text-gray-600">credits</div>
                </div>
                <div className="border-t border-gray-200 py-4 mb-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">Base Price</span>
                    <span className="font-semibold">₹{pack.priceInr.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">GST (18%)</span>
                    <span className="font-semibold">₹{pack.gstAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold">
                    <span className="text-gray-900">Total</span>
                    <span className="text-blue-600">₹{pack.totalAmount.toFixed(2)}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleRecharge(pack)}
                  className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors ${
                    selectedPack?.id === pack.id
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                  }`}
                >
                  {selectedPack?.id === pack.id ? 'Selected' : 'Select Pack'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Transaction History */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Recent Transactions</h2>
          {summary?.recentTransactions && summary.recentTransactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b-2 border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Type</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Service</th>
                    <th className="text-right py-3 px-4 text-gray-600 font-semibold">Amount</th>
                    <th className="text-right py-3 px-4 text-gray-600 font-semibold">Balance After</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Date</th>
                    <th className="text-center py-3 px-4 text-gray-600 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentTransactions.map((txn, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1">
                          {txn.type === 'purchase' ? (
                            <ArrowDownLeft className="w-4 h-4 text-green-600" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4 text-orange-600" />
                          )}
                          <span className="font-semibold text-gray-900 capitalize">{txn.type}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-600 capitalize">{txn.service || '-'}</td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900">
                        {txn.type === 'purchase' ? '+' : '-'}₹{Math.abs(txn.amount).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-600">₹{txn.balanceAfter.toFixed(2)}</td>
                      <td className="py-3 px-4 text-gray-600 text-sm">
                        {new Date(txn.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleDownloadInvoice(txn.id)}
                          className="text-blue-600 hover:text-blue-800 font-semibold text-sm"
                        >
                          <Download className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📋</div>
              <p className="text-gray-600">No transactions yet</p>
              <p className="text-sm text-gray-500 mt-2">Start by recharging your wallet or using services</p>
            </div>
          )}
        </div>
      </div>

      {/* FAQ & Help Section */}
      <div className="bg-white rounded-lg shadow-lg p-6 mt-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <HelpCircle className="w-6 h-6" />
          Frequently Asked Questions
        </h2>

        <div className="space-y-4">
          {/* FAQ 1 */}
          <FAQItem
            question="What are Infer Credits?"
            answer="Infer Credits are a virtual currency used for premium services like WhatsApp messaging (₹0.66), SMS (₹0.14), and prescription creation (₹1.00). Your subscription covers core services like patient records and appointments, while credits are pay-as-you-go for these additional services."
          />

          {/* FAQ 2 */}
          <FAQItem
            question="Why am I charged for messaging when I already have a subscription?"
            answer="Your subscription covers core EMR features (patient records, appointments, encounters). Messaging and prescriptions are premium services with separate pay-as-you-go pricing. This allows us to maintain high quality while keeping costs transparent and fair. We also subsidize part of your messaging costs—₹0.66 vs industry standard ₹0.84!"
          />

          {/* FAQ 3 */}
          <FAQItem
            question="Do credits expire?"
            answer="No! Credits never expire as long as your subscription is active. If your subscription lapses, your credits will also expire. This gives you flexibility to use them at your own pace."
          />

          {/* FAQ 4 */}
          <FAQItem
            question="How long will my credits last?"
            answer="It depends on your usage. For a clinic with 10 patients/day:\n• 200 credits (Starter) ≈ 12 days\n• 500 credits (Professional) ≈ 30 days\n• 1000 credits (Enterprise) ≈ 60 days"
          />

          {/* FAQ 5 */}
          <FAQItem
            question="What happens when I run out of credits?"
            answer="You'll get a low balance alert at 50 credits. When credits run out, you won't be able to send messages or create prescriptions. Simply recharge to continue using these services."
          />

          {/* FAQ 6 */}
          <FAQItem
            question="How do I purchase credits?"
            answer="Click 'Recharge Now' above, select a pack (Starter/Professional/Enterprise), and make payment via card, UPI, or net banking. Credits are added instantly after successful payment, and you can download an invoice for your records."
          />
        </div>
      </div>
    </div>
  );
}

function FAQItem({ question, answer }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 text-left font-semibold text-gray-900 hover:bg-gray-50 transition-colors flex items-center justify-between"
      >
        <span>{question}</span>
        <ChevronDown
          className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <p className="text-gray-700 whitespace-pre-line">{answer}</p>
        </div>
      )}
    </div>
  );
}
