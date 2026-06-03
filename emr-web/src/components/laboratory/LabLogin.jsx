/**
 * Lab Staff Login Page
 * Email + Password authentication for lab portal access
 */

import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export function LabLogin() {
  const navigate = useNavigate();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!email || !password) {
        setError('Please enter email and password');
        return;
      }

      // Call login endpoint
      const response = await axios.post('/api/v1/auth/lab/login', {
        email,
        password
      });

      const { token, user } = response.data;

      // Store in localStorage
      localStorage.setItem('auth_token', token);
      localStorage.setItem('lab_id', user.lab_id);
      localStorage.setItem('lab_role', user.lab_role);
      localStorage.setItem('user_email', user.email);
      localStorage.setItem('facility_name', user.facility_name);

      if (rememberMe) {
        localStorage.setItem('remember_email', email);
      }

      // Redirect to lab portal
      navigate('/lab-portal', {
        state: { message: `Welcome ${user.lab_role}!` }
      });
    } catch (err) {
      const errorMsg =
        err.response?.data?.error || 'Login failed. Please try again.';
      setError(errorMsg);
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load remembered email
  React.useEffect(() => {
    const rememberEmail = localStorage.getItem('remember_email');
    if (rememberEmail) {
      setEmail(rememberEmail);
      setRememberMe(true);
    }
  }, []);

  return (
    <div className="lab-login-container">
      <div className="lab-login-box">
        {/* Header */}
        <div className="login-header">
          <div className="login-logo">🏥</div>
          <h1>Lab Portal</h1>
          <p>Clinical Laboratory Management System</p>
        </div>

        {/* Error Alert */}
        {error && <div className="alert alert-error">{error}</div>}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="login-form">
          {/* Email Field */}
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={loading}
              autoComplete="email"
              required
              className="form-input"
            />
            <small className="form-hint">Your lab account email</small>
          </div>

          {/* Password Field */}
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-group">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                autoComplete="current-password"
                required
                className="form-input"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Remember Me */}
          <div className="form-group checkbox">
            <input
              id="remember"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={loading}
            />
            <label htmlFor="remember">Remember my email</label>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={loading}
            className="btn-login"
          >
            {loading ? '⏳ Logging in...' : '🔓 Login'}
          </button>
        </form>

        {/* Footer */}
        <div className="login-footer">
          <p className="login-support">
            Don't have an account?{' '}
            <a href="/contact-admin" className="link">
              Contact your administrator
            </a>
          </p>
          <p className="login-version">
            Lab Management System v1.0
          </p>
        </div>
      </div>

      {/* Sidebar Info */}
      <div className="login-info">
        <div className="info-card">
          <h3>🏥 For Lab Staff</h3>
          <p>Login with your lab account credentials to access the lab portal and upload test results.</p>
        </div>

        <div className="info-card">
          <h3>📤 Upload Results</h3>
          <p>Upload lab results in multiple formats: JSON, HL7, FHIR, PDF, or CSV.</p>
        </div>

        <div className="info-card">
          <h3>⚡ Real-Time</h3>
          <p>Results are visible to doctors within seconds of upload.</p>
        </div>

        <div className="info-card">
          <h3>🔐 Secure</h3>
          <p>All data is encrypted and compliant with ISO 15189 standards.</p>
        </div>
      </div>

      <style jsx>{`
        .lab-login-container {
          display: flex;
          height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }

        .lab-login-box {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 40px;
          background: white;
        }

        .login-header {
          text-align: center;
          margin-bottom: 40px;
          width: 100%;
        }

        .login-logo {
          font-size: 60px;
          margin-bottom: 20px;
        }

        .login-header h1 {
          margin: 0;
          font-size: 32px;
          color: #333;
          font-weight: bold;
        }

        .login-header p {
          margin: 8px 0 0 0;
          color: #666;
          font-size: 14px;
        }

        .alert {
          width: 100%;
          padding: 12px 16px;
          border-radius: 6px;
          margin-bottom: 20px;
          font-size: 14px;
        }

        .alert-error {
          background-color: #fee;
          color: #c33;
          border: 1px solid #fcc;
        }

        .login-form {
          width: 100%;
          max-width: 380px;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #333;
          font-size: 14px;
        }

        .form-input {
          width: 100%;
          padding: 12px 14px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
          transition: all 0.3s;
          box-sizing: border-box;
        }

        .form-input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .form-input:disabled {
          background-color: #f5f5f5;
          cursor: not-allowed;
          opacity: 0.6;
        }

        .form-hint {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          color: #999;
        }

        .password-input-group {
          position: relative;
          display: flex;
          align-items: center;
        }

        .password-toggle {
          position: absolute;
          right: 12px;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 18px;
          padding: 6px;
          color: #666;
          transition: all 0.2s;
        }

        .password-toggle:hover:not(:disabled) {
          color: #333;
        }

        .password-toggle:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .form-group.checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 24px;
        }

        .form-group.checkbox input {
          width: 18px;
          height: 18px;
          cursor: pointer;
          accent-color: #667eea;
        }

        .form-group.checkbox label {
          margin: 0;
          font-weight: 400;
          cursor: pointer;
        }

        .btn-login {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.3s;
        }

        .btn-login:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(102, 126, 234, 0.3);
        }

        .btn-login:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }

        .login-footer {
          margin-top: 30px;
          text-align: center;
          width: 100%;
          border-top: 1px solid #eee;
          padding-top: 20px;
        }

        .login-support {
          margin: 0 0 10px 0;
          font-size: 13px;
          color: #666;
        }

        .link {
          color: #667eea;
          text-decoration: none;
          font-weight: 600;
          transition: color 0.3s;
        }

        .link:hover {
          color: #764ba2;
          text-decoration: underline;
        }

        .login-version {
          margin: 10px 0 0 0;
          font-size: 12px;
          color: #999;
        }

        .login-info {
          flex: 1;
          padding: 60px 40px;
          color: white;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 30px;
        }

        .info-card {
          background: rgba(255, 255, 255, 0.1);
          padding: 24px;
          border-radius: 8px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .info-card h3 {
          margin: 0 0 8px 0;
          font-size: 18px;
          font-weight: bold;
        }

        .info-card p {
          margin: 0;
          font-size: 14px;
          opacity: 0.9;
          line-height: 1.5;
        }

        /* Responsive Design */
        @media (max-width: 1024px) {
          .lab-login-container {
            flex-direction: column;
            height: auto;
          }

          .lab-login-box {
            padding: 30px 20px;
            min-height: 100vh;
            justify-content: center;
          }

          .login-info {
            padding: 40px 20px;
            gap: 20px;
          }

          .info-card {
            padding: 16px;
          }

          .info-card h3 {
            font-size: 16px;
          }

          .info-card p {
            font-size: 13px;
          }
        }

        @media (max-width: 640px) {
          .lab-login-box {
            padding: 20px;
          }

          .login-header h1 {
            font-size: 24px;
          }

          .login-header p {
            font-size: 13px;
          }

          .login-logo {
            font-size: 48px;
          }

          .login-form {
            max-width: 100%;
          }

          .login-info {
            padding: 30px 20px;
          }

          .info-card {
            padding: 12px;
          }

          .info-card h3 {
            font-size: 14px;
          }

          .info-card p {
            font-size: 12px;
          }
        }
      `}</style>
    </div>
  );
}

export default LabLogin;
