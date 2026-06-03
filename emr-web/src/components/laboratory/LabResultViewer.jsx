/**
 * Lab Result Viewer - Doctor Dashboard
 * Real-time result updates via WebSocket
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
});

async function apiFetch(url, options = {}) {
  const res = await fetch(url, { headers: authHeaders(), ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function LabResultViewer({ patientId: patientIdProp }) {
  const { patientId: patientIdParam } = useParams();
  const patientId = patientIdProp || patientIdParam;
  const [results, setResults] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [filter, setFilter] = useState('all');
  const pollRef = useRef(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    fetchResults();
    fetchAnomalies();
    // Poll every 15 seconds for new results
    pollRef.current = setInterval(() => {
      fetchResults(true);
      fetchAnomalies();
    }, 15000);
    setIsConnected(true);
    return () => clearInterval(pollRef.current);
  }, [patientId]);

  const fetchResults = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await apiFetch(
        `/api/v1/doctors/patients/${patientId}/lab-results?limit=50&sort=newest`
      );
      const newResults = data.results || [];
      // Notify if new critical results appeared
      if (silent && newResults.length > prevCountRef.current) {
        const newCritical = newResults.slice(0, newResults.length - prevCountRef.current)
          .filter(r => r.is_critical_value);
        if (newCritical.length > 0) playAlertSound();
      }
      prevCountRef.current = newResults.length;
      setResults(newResults);
    } catch (error) {
      console.error('Error fetching results:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnomalies = async () => {
    try {
      const data = await apiFetch(
        `/api/v1/doctors/patients/${patientId}/lab-anomalies?days=7&limit=10`
      );
      setAnomalies(data.anomalies || []);
    } catch (error) {
      console.error('Error fetching anomalies:', error);
    }
  };

  const playAlertSound = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch {}
  };

  const acknowledgeResult = async (resultId) => {
    try {
      await apiFetch(`/api/v1/doctors/lab-results/${resultId}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({ notes: 'Reviewed by doctor' }),
      });
      setResults(results.map(r => r.id === resultId ? { ...r, needs_immediate_attention: false } : r));
    } catch (error) {
      console.error('Error acknowledging result:', error);
    }
  };

  const filteredResults = results.filter((r) => {
    if (filter === 'critical') return r.is_critical_value;
    if (filter === 'pending') return r.needs_immediate_attention;
    return true;
  });

  const criticalResults = results.filter((r) => r.is_critical_value);

  return (
    <div className="lab-result-viewer">
      {/* Connection Status */}
      <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
        <span className="status-dot"></span>
        {isConnected ? '🔴 Live Updates Active' : '⚪ Offline'}
      </div>

      {/* Critical Values Banner */}
      {criticalResults.length > 0 && (
        <div className="critical-banner">
          <h3>🚨 CRITICAL VALUES DETECTED</h3>
          <p>{criticalResults.length} critical value(s) require immediate attention</p>
          {criticalResults.map((r) => (
            <div key={r.id} className="critical-item">
              <strong>{r.test_name}:</strong> {r.result_value} {r.result_unit}
              <button
                className="btn-small"
                onClick={() => acknowledgeResult(r.id)}
              >
                ✓ Acknowledge
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="filters">
        <button
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All Results ({results.length})
        </button>
        <button
          className={`filter-btn ${filter === 'critical' ? 'active' : ''}`}
          onClick={() => setFilter('critical')}
        >
          Critical ({criticalResults.length})
        </button>
        <button
          className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
          onClick={() => setFilter('pending')}
        >
          Pending Review ({results.filter((r) => r.needs_immediate_attention).length})
        </button>
        <button className="btn-refresh" onClick={fetchResults}>
          🔄 Refresh
        </button>
      </div>

      {/* Results Table */}
      {loading ? (
        <div className="loading">Loading results...</div>
      ) : filteredResults.length === 0 ? (
        <div className="no-results">No results found</div>
      ) : (
        <table className="results-table">
          <thead>
            <tr>
              <th>Test</th>
              <th>Result</th>
              <th>Range</th>
              <th>Status</th>
              <th>Time</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredResults.map((result) => (
              <tr
                key={result.id}
                className={`result-row ${result.is_critical_value ? 'critical' : ''} ${
                  result.needs_immediate_attention ? 'pending' : ''
                }`}
              >
                <td className="test-name">
                  <div>{result.test_name}</div>
                  <small className="test-code">{result.test_code}</small>
                </td>

                <td className="result-value">
                  <strong>{result.result_value}</strong>
                  <br />
                  <small>{result.result_unit}</small>
                </td>

                <td className="reference-range">
                  {result.reference_range_low}-{result.reference_range_high}
                </td>

                <td className="status">
                  {result.is_critical_value ? (
                    <span className="badge critical">CRITICAL</span>
                  ) : result.result_value < result.reference_range_low ||
                    result.result_value > result.reference_range_high ? (
                    <span className="badge warning">OUT OF RANGE</span>
                  ) : (
                    <span className="badge normal">NORMAL</span>
                  )}
                </td>

                <td className="timestamp">
                  {new Date(result.result_timestamp).toLocaleString()}
                </td>

                <td className="actions">
                  {result.needs_immediate_attention ? (
                    <button
                      className="btn-acknowledge"
                      onClick={() => acknowledgeResult(result.id)}
                    >
                      ✓ Acknowledge
                    </button>
                  ) : (
                    <span className="text-muted">Reviewed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Anomalies Section */}
      {anomalies.length > 0 && (
        <div className="anomalies-section">
          <h3>⚠️ Detected Anomalies (This Week)</h3>
          <div className="anomalies-list">
            {anomalies.map((anom) => (
              <div
                key={anom.id}
                className={`anomaly-card anomaly-${anom.severity.toLowerCase()}`}
              >
                <div className="anomaly-header">
                  <strong>{anom.anomaly_type}</strong>
                  <span className={`severity-badge ${anom.severity.toLowerCase()}`}>
                    {anom.severity}
                  </span>
                </div>

                <div className="anomaly-test">
                  <em>{anom.test_name}: {anom.result_value}</em>
                </div>

                <div className="anomaly-context">
                  <p>{anom.clinical_context}</p>
                </div>

                {anom.recommended_action && (
                  <div className="anomaly-action">
                    <strong>Recommended Action:</strong> {anom.recommended_action}
                  </div>
                )}

                <div className="anomaly-time">
                  {new Date(anom.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .lab-result-viewer {
          max-width: 1400px;
          margin: 0 auto;
          padding: 20px;
        }

        .connection-status {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 15px;
          border-radius: 4px;
          margin-bottom: 20px;
          font-weight: bold;
        }

        .connection-status.connected {
          background-color: #d4edda;
          color: #155724;
        }

        .connection-status.disconnected {
          background-color: #f8d7da;
          color: #721c24;
        }

        .status-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: currentColor;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        .critical-banner {
          background-color: #fff3cd;
          border: 2px solid #ffc107;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 20px;
        }

        .critical-banner h3 {
          margin: 0 0 10px 0;
          color: #856404;
        }

        .critical-banner p {
          margin: 0 0 10px 0;
          color: #856404;
        }

        .critical-item {
          background-color: white;
          padding: 10px;
          margin: 10px 0;
          border-left: 4px solid #dc3545;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .btn-small {
          padding: 5px 10px;
          background-color: #dc3545;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        }

        .btn-small:hover {
          background-color: #c82333;
        }

        .filters {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .filter-btn {
          padding: 8px 15px;
          background-color: white;
          border: 1px solid #ddd;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.3s;
        }

        .filter-btn:hover {
          background-color: #f0f0f0;
        }

        .filter-btn.active {
          background-color: #007bff;
          color: white;
          border-color: #007bff;
        }

        .btn-refresh {
          padding: 8px 15px;
          background-color: #28a745;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .btn-refresh:hover {
          background-color: #218838;
        }

        .loading,
        .no-results {
          padding: 40px;
          text-align: center;
          color: #666;
          font-size: 16px;
        }

        .results-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
          background: white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .results-table thead {
          background-color: #f8f9fa;
        }

        .results-table th {
          padding: 15px;
          text-align: left;
          font-weight: bold;
          border-bottom: 2px solid #ddd;
          color: #333;
        }

        .results-table td {
          padding: 12px 15px;
          border-bottom: 1px solid #ddd;
        }

        .result-row {
          transition: background-color 0.3s;
        }

        .result-row:hover {
          background-color: #f9f9f9;
        }

        .result-row.critical {
          background-color: #fff3cd;
          border-left: 4px solid #dc3545;
        }

        .result-row.pending {
          background-color: #fff8e1;
        }

        .test-name strong {
          font-size: 16px;
          color: #333;
        }

        .test-code {
          color: #999;
          display: block;
          margin-top: 3px;
        }

        .result-value {
          font-size: 18px;
          font-weight: bold;
          color: #007bff;
        }

        .result-value small {
          color: #666;
          font-size: 12px;
          font-weight: normal;
        }

        .reference-range {
          color: #666;
          font-size: 14px;
        }

        .badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 3px;
          font-size: 12px;
          font-weight: bold;
        }

        .badge.critical {
          background-color: #dc3545;
          color: white;
        }

        .badge.warning {
          background-color: #ffc107;
          color: #333;
        }

        .badge.normal {
          background-color: #28a745;
          color: white;
        }

        .timestamp {
          font-size: 12px;
          color: #666;
        }

        .btn-acknowledge {
          padding: 6px 12px;
          background-color: #28a745;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        }

        .btn-acknowledge:hover {
          background-color: #218838;
        }

        .text-muted {
          color: #999;
          font-size: 12px;
        }

        .anomalies-section {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 2px solid #ddd;
        }

        .anomalies-section h3 {
          margin-top: 0;
          color: #333;
        }

        .anomalies-list {
          display: grid;
          gap: 15px;
        }

        .anomaly-card {
          border-left: 4px solid;
          border-radius: 4px;
          padding: 15px;
          background-color: #f9f9f9;
        }

        .anomaly-card.anomaly-critical {
          border-color: #dc3545;
          background-color: #fff5f5;
        }

        .anomaly-card.anomaly-high {
          border-color: #ffc107;
          background-color: #fffef5;
        }

        .anomaly-card.anomaly-medium {
          border-color: #17a2b8;
          background-color: #f5fbfc;
        }

        .anomaly-card.anomaly-low {
          border-color: #28a745;
          background-color: #f5faf5;
        }

        .anomaly-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .severity-badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: bold;
          color: white;
        }

        .severity-badge.critical {
          background-color: #dc3545;
        }

        .severity-badge.high {
          background-color: #ffc107;
          color: #333;
        }

        .severity-badge.medium {
          background-color: #17a2b8;
        }

        .severity-badge.low {
          background-color: #28a745;
        }

        .anomaly-test {
          color: #666;
          font-size: 14px;
          margin-bottom: 10px;
        }

        .anomaly-context {
          margin-bottom: 10px;
        }

        .anomaly-context p {
          margin: 0;
          color: #333;
        }

        .anomaly-action {
          background-color: white;
          padding: 10px;
          border-radius: 3px;
          margin-bottom: 10px;
          font-size: 13px;
        }

        .anomaly-time {
          font-size: 12px;
          color: #999;
        }

        @media (max-width: 768px) {
          .results-table {
            font-size: 12px;
          }

          .results-table td,
          .results-table th {
            padding: 8px;
          }

          .critical-item {
            flex-direction: column;
            align-items: flex-start;
          }

          .btn-small {
            align-self: flex-end;
            margin-top: 10px;
          }
        }
      `}</style>
    </div>
  );
}

export default LabResultViewer;
