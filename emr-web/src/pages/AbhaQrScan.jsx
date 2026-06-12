import { useState, useRef, useEffect } from 'react';
import { Camera, X, Upload, ChevronRight, AlertCircle, CheckCircle } from 'lucide-react';
import jsQR from 'jsqr';
import { api } from '../api/client';
import toast from 'react-hot-toast';
import styles from './AbhaQrScan.module.css';

const decodeAbhaQr = (text) => {
  try {
    // Try JSON format first
    const json = JSON.parse(text);
    if (json.abhaNumber || json.abhaAddress) {
      return {
        abhaNumber: json.abhaNumber || json.abha_number || '',
        abhaAddress: json.abhaAddress || json.abha_address || '',
        name: json.name || json.firstName + (json.lastName ? ' ' + json.lastName : '') || '',
        gender: json.gender || '',
        dob: json.dob || json.dateOfBirth || '',
        phoneNumber: json.mobile || json.phone || '',
        address: json.address || null,
      };
    }
  } catch (e) {
    // Not JSON, try pipe-delimited format: abha_number|abha_address|name|gender|dob|mobile
    const parts = text.split('|').map(s => s.trim());
    if (parts.length >= 2 && (parts[0].includes('-') || parts[1].includes('@'))) {
      return {
        abhaNumber: parts[0] || '',
        abhaAddress: parts[1] || '',
        name: parts[2] || '',
        gender: parts[3] || '',
        dob: parts[4] || '',
        phoneNumber: parts[5] || '',
        address: null,
      };
    }
  }
  return null;
};

export default function AbhaQrScan() {
  const [mode, setMode] = useState('choice'); // choice | camera | upload | verify | success | error
  const [scannedData, setScannedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [editedData, setEditedData] = useState(null);
  const [registrationResult, setRegistrationResult] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setMode('camera');
      scanQrCode();
    } catch (err) {
      toast.error('Camera access denied: ' + err.message);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const scanQrCode = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');

    const scan = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);

        if (code) {
          const qrData = decodeAbhaQr(code.data);
          if (qrData) {
            stopCamera();
            setScannedData(qrData);
            setEditedData({ ...qrData });
            setMode('verify');
            return;
          }
        }
      }

      if (mode === 'camera') {
        requestAnimationFrame(scan);
      }
    };

    scan();
  };

  useEffect(() => {
    if (mode === 'camera') {
      const interval = setInterval(scanQrCode, 300);
      return () => clearInterval(interval);
    }
    return () => stopCamera();
  }, [mode]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const code = jsQR(imageData.data, img.width, img.height);

        if (code) {
          const qrData = decodeAbhaQr(code.data);
          if (qrData) {
            setScannedData(qrData);
            setEditedData({ ...qrData });
            setMode('verify');
            return;
          }
        }

        setErrorMsg('No valid ABHA QR code found in image');
        setMode('error');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRegister = async () => {
    if (!editedData) return;
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await api.post('/patients/register-abha', editedData);
      setRegistrationResult(res);
      setMode('success');
      toast.success('Patient registered successfully!');
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setErrorMsg(msg);
      setMode('error');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMode('choice');
    setScannedData(null);
    setEditedData(null);
    setErrorMsg('');
    setRegistrationResult(null);
    stopCamera();
  };

  return (
    <div className={styles.container}>
      {mode === 'choice' && (
        <div className={styles.choiceScreen}>
          <h2>Register Patient via ABHA QR</h2>
          <p>Choose a registration method:</p>
          <div className={styles.buttonGroup}>
            <button className={styles.primaryBtn} onClick={startCamera}>
              <Camera size={20} /> Scan with Camera
            </button>
            <button className={styles.secondaryBtn} onClick={() => fileInputRef.current?.click()}>
              <Upload size={20} /> Upload QR Image
            </button>
            <button className={styles.cancelBtn} onClick={reset}>Cancel</button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {mode === 'camera' && (
        <div className={styles.cameraScreen}>
          <div className={styles.cameraContainer}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className={styles.video}
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div className={styles.scanOverlay}>
              <div className={styles.scanBox} />
            </div>
          </div>
          <div className={styles.cameraHint}>
            <p>Position ABHA QR code in the frame</p>
          </div>
          <button className={styles.cancelBtn} onClick={reset}>Cancel</button>
        </div>
      )}

      {mode === 'verify' && editedData && (
        <div className={styles.verifyScreen}>
          <h2>Verify Patient Details</h2>
          <div className={styles.formGroup}>
            <label>Name</label>
            <input
              type="text"
              value={editedData.name}
              onChange={(e) => setEditedData({ ...editedData, name: e.target.value })}
            />
          </div>
          <div className={styles.twoCol}>
            <div className={styles.formGroup}>
              <label>ABHA Number</label>
              <input
                type="text"
                value={editedData.abhaNumber}
                onChange={(e) => setEditedData({ ...editedData, abhaNumber: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label>ABHA Address</label>
              <input
                type="text"
                value={editedData.abhaAddress}
                onChange={(e) => setEditedData({ ...editedData, abhaAddress: e.target.value })}
              />
            </div>
          </div>
          <div className={styles.twoCol}>
            <div className={styles.formGroup}>
              <label>Gender</label>
              <select
                value={editedData.gender || ''}
                onChange={(e) => setEditedData({ ...editedData, gender: e.target.value })}
              >
                <option value="">Select</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="O">Other</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Date of Birth</label>
              <input
                type="date"
                value={editedData.dob}
                onChange={(e) => setEditedData({ ...editedData, dob: e.target.value })}
              />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label>Mobile Number</label>
            <input
              type="tel"
              value={editedData.phoneNumber}
              onChange={(e) => setEditedData({ ...editedData, phoneNumber: e.target.value })}
            />
          </div>
          <div className={styles.buttonGroup}>
            <button
              className={styles.primaryBtn}
              onClick={handleRegister}
              disabled={loading}
            >
              {loading ? 'Registering...' : 'Confirm & Register'}
            </button>
            <button className={styles.secondaryBtn} onClick={reset} disabled={loading}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'success' && registrationResult && (
        <div className={styles.successScreen}>
          <CheckCircle size={48} className={styles.icon} />
          <h2>Registration Successful!</h2>
          <div className={styles.successInfo}>
            <p><strong>Patient ID:</strong> {registrationResult.patientId}</p>
            <p><strong>Name:</strong> {registrationResult.patient?.name}</p>
            <p><strong>ABHA:</strong> {registrationResult.patient?.abha_address}</p>
            {registrationResult.careContextId && (
              <p><strong>Care Context Created:</strong> Yes</p>
            )}
          </div>
          <button className={styles.primaryBtn} onClick={reset}>
            Register Another Patient
          </button>
        </div>
      )}

      {mode === 'error' && (
        <div className={styles.errorScreen}>
          <AlertCircle size={48} className={styles.icon} />
          <h2>Registration Failed</h2>
          <p>{errorMsg}</p>
          <button className={styles.primaryBtn} onClick={reset}>
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
