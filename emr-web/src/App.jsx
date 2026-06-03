import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { QueueDateProvider } from './context/QueueDateContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Queue from './pages/Queue';
import QueueSetup from './pages/QueueSetup';
import Patients from './pages/Patients';
import WriteRx from './pages/WriteRx';
import Settings from './pages/Settings';
import VoiceAI    from './pages/VoiceAI';
import Assessment from './pages/Assessment';
import Inbound    from './pages/Inbound';
import Analytics  from './pages/Analytics';
import LabLogin from './components/laboratory/LabLogin';
import LabPortal from './components/laboratory/LabPortal';
import LabResultViewer from './components/laboratory/LabResultViewer';
import AdminDashboard from './components/laboratory/AdminDashboard';

function Protected({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? children : <Navigate to="/login" replace />;
}

function LabProtected({ children }) {
  const token = localStorage.getItem('auth_token');
  const labId = localStorage.getItem('lab_id');
  if (!token || !labId) return <Navigate to="/lab-login" replace />;
  return children;
}

export default function App() {
  return (
    <QueueDateProvider>
    <AuthProvider>
      <BrowserRouter basename="/opd">
        <Routes>
          {/* Clinic Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Layout /></Protected>}>
            <Route index element={<Navigate to="/queue" replace />} />
            <Route path="queue"              element={<Queue />} />
            <Route path="queue/setup"        element={<QueueSetup />} />
            <Route path="patients"           element={<Patients />} />
            <Route path="rx/:appointmentId"  element={<WriteRx />} />
            <Route path="voice"              element={<VoiceAI />} />
            <Route path="assessment"         element={<Assessment />} />
            <Route path="settings"           element={<Settings />} />
            <Route path="inbound"            element={<Inbound />} />
            <Route path="analytics"          element={<Analytics />} />

            {/* Doctor: View patient lab results (inside clinic layout) */}
            <Route path="patients/:patientId/lab-results" element={<LabResultViewer />} />
            {/* Admin: Manage laboratories (inside clinic layout) */}
            <Route path="admin/laboratories" element={<AdminDashboard />} />
          </Route>

          {/* Lab Routes (standalone, no clinic layout) */}
          <Route path="/lab-login" element={<LabLogin />} />
          <Route path="/lab-portal" element={<LabProtected><LabPortal /></LabProtected>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </QueueDateProvider>
  );
}
