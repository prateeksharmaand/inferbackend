/**
 * PatientActions - Patient Card Component
 * Shows action buttons with credit costs and confirmation dialog
 */

import React, { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useNavigate } from 'react-router-dom';

const COSTS = {
  sms: 0.14,
  whatsapp: 0.66,
  prescription: 1.00
};

const SERVICE_NAMES = {
  sms: 'SMS',
  whatsapp: 'WhatsApp Message',
  prescription: 'Prescription'
};

const SERVICE_ICONS = {
  sms: '📱',
  whatsapp: '💬',
  prescription: '💊'
};

export const PatientActions = ({ patientId, onAction = () => {} }) => {
  const { wallet, checkBalance, deductCredits } = useWallet();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleActionClick = async (serviceType) => {
    try {
      setLoading(true);
      const balanceCheck = await checkBalance(serviceType, 1);

      if (!balanceCheck.hasBalance) {
        setDialog({
          type: 'insufficient',
          service: serviceType,
          required: balanceCheck.requiredCredits,
          current: balanceCheck.currentBalance,
          cost: COSTS[serviceType]
        });
        return;
      }

      setDialog({
        type: 'confirm',
        service: serviceType,
        cost: COSTS[serviceType],
        beforeBalance: balanceCheck.currentBalance,
        afterBalance: balanceCheck.currentBalance - COSTS[serviceType]
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!dialog) return;

    try {
      setLoading(true);
      await deductCredits(
        dialog.service,
        1,
        `patient_${patientId}_${dialog.service}_${Date.now()}`,
        { patient_id: patientId }
      );

      // Call the callback
      onAction({
        service: dialog.service,
        patientId,
        success: true
      });

      // Close dialog
      setDialog(null);
    } catch (error) {
      setDialog({
        type: 'error',
        service: dialog.service,
        error: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const closeDialog = () => setDialog(null);

  if (!wallet) return null;

  const balance = parseFloat(wallet.currentBalance || 0);

  return (
    <>
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* SMS Button */}
        <button
          onClick={() => handleActionClick('sms')}
          disabled={loading || balance < COSTS.sms}
          className={`
            flex items-center gap-1 px-3 py-2 rounded text-sm font-medium
            transition-colors duration-200
            ${
              balance < COSTS.sms
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
            }
          `}
          title={balance < COSTS.sms ? `Need ${COSTS.sms} credits` : 'Send SMS'}
        >
          <span>{SERVICE_ICONS.sms}</span>
          <span>SMS</span>
          <span className="text-xs text-gray-600">({COSTS.sms})</span>
        </button>

        {/* WhatsApp Button */}
        <button
          onClick={() => handleActionClick('whatsapp')}
          disabled={loading || balance < COSTS.whatsapp}
          className={`
            flex items-center gap-1 px-3 py-2 rounded text-sm font-medium
            transition-colors duration-200
            ${
              balance < COSTS.whatsapp
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
            }
          `}
          title={balance < COSTS.whatsapp ? `Need ${COSTS.whatsapp} credits` : 'Send WhatsApp'}
        >
          <span>{SERVICE_ICONS.whatsapp}</span>
          <span>WhatsApp</span>
          <span className="text-xs text-gray-600">({COSTS.whatsapp})</span>
        </button>

        {/* Prescription Button */}
        <button
          onClick={() => handleActionClick('prescription')}
          disabled={loading || balance < COSTS.prescription}
          className={`
            flex items-center gap-1 px-3 py-2 rounded text-sm font-medium
            transition-colors duration-200
            ${
              balance < COSTS.prescription
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
            }
          `}
          title={balance < COSTS.prescription ? `Need ${COSTS.prescription} credits` : 'Create Prescription'}
        >
          <span>{SERVICE_ICONS.prescription}</span>
          <span>Rx</span>
          <span className="text-xs text-gray-600">({COSTS.prescription})</span>
        </button>

        {/* Balance Display */}
        <div className="ml-auto flex items-center gap-2">
          <span className={`
            text-sm font-semibold px-3 py-2 rounded
            ${
              balance < 100
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-green-50 text-green-700 border border-green-200'
            }
          `}>
            Balance: ₹{balance.toFixed(2)}
          </span>
          {balance < 50 && (
            <button
              onClick={() => navigate('/wallet/recharge')}
              className="px-3 py-2 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700"
            >
              Recharge
            </button>
          )}
        </div>
      </div>

      {/* Dialog */}
      {dialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            {/* Confirm Dialog */}
            {dialog.type === 'confirm' && (
              <>
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900">
                    Send {SERVICE_NAMES[dialog.service]}?
                  </h3>
                </div>

                <div className="p-6 space-y-4">
                  {/* Cost Summary */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">Service:</span>
                      <span className="font-semibold">
                        {SERVICE_ICONS[dialog.service]} {SERVICE_NAMES[dialog.service]}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">Cost:</span>
                      <span className="font-semibold text-blue-600">
                        -{dialog.cost} credits (₹{dialog.cost})
                      </span>
                    </div>
                    <div className="border-t border-blue-300 pt-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700">Current Balance:</span>
                        <span className="font-semibold">{dialog.beforeBalance.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700">After Action:</span>
                        <span className="font-semibold text-green-600">
                          {dialog.afterBalance.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={closeDialog}
                      disabled={loading}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmAction}
                      disabled={loading}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
                    >
                      {loading ? 'Processing...' : 'Send'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Insufficient Credits Dialog */}
            {dialog.type === 'insufficient' && (
              <>
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-red-700">
                    Insufficient Credits ❌
                  </h3>
                </div>

                <div className="p-6 space-y-4">
                  {/* Cost Summary */}
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
                    <div className="text-sm text-red-800">
                      You don't have enough credits to send {SERVICE_NAMES[dialog.service]}.
                    </div>
                    <div className="flex justify-between text-sm mt-3">
                      <span className="text-red-700">You need:</span>
                      <span className="font-bold text-red-700">{dialog.required} credits</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-red-700">You have:</span>
                      <span className="font-bold text-red-700">{dialog.current.toFixed(2)} credits</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-red-700">Shortfall:</span>
                      <span className="font-bold text-red-700">
                        {(dialog.required - dialog.current).toFixed(2)} credits
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={closeDialog}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Later
                    </button>
                    <button
                      onClick={() => {
                        closeDialog();
                        navigate('/wallet/recharge');
                      }}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded font-semibold hover:bg-red-700"
                    >
                      Recharge Now
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Error Dialog */}
            {dialog.type === 'error' && (
              <>
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-red-700">
                    Error ❌
                  </h3>
                </div>

                <div className="p-6 space-y-4">
                  <div className="text-red-700 text-sm">
                    {dialog.error}
                  </div>
                  <button
                    onClick={closeDialog}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded font-semibold hover:bg-red-700"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};
