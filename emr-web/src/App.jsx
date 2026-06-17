import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { trackPage } from './lib/mixpanel';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { QueueDateProvider } from './context/QueueDateContext';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Queue from './pages/Queue';
import QueueSetup from './pages/QueueSetup';
import Patients from './pages/Patients';
import AbhaQrScan from './pages/AbhaQrScan';
import WriteRx from './pages/WriteRx';
import Settings from './pages/Settings';
import VoiceAI    from './pages/VoiceAI';
import Assessment from './pages/Assessment';
import Inbound    from './pages/Inbound';
import Analytics  from './pages/Analytics';
import AbdmDashboard from './pages/AbdmDashboard';
import Payments   from './pages/Payments';
import LabLogin from './components/laboratory/LabLogin';
import LabPortal from './components/laboratory/LabPortal';
import LabResultViewer from './components/laboratory/LabResultViewer';
import AdminDashboard from './components/laboratory/AdminDashboard';
import RxPublicView from './pages/RxPublicView';

// Super Admin Portal
import AdminLogin        from './pages/admin/AdminLogin';
import AdminLayout       from './pages/admin/AdminLayout';
import SuperAdminDash    from './pages/admin/AdminDashboard';
import AdminClinics      from './pages/admin/AdminClinics';
import AdminSubscriptions from './pages/admin/AdminSubscriptions';
import AdminAudit        from './pages/admin/AdminAudit';
import AdminClinicDetail from './pages/admin/AdminClinicDetail';

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

function AdminProtected({ children }) {
  const { admin, ready } = useAdminAuth();
  if (!ready) return null;
  return admin ? children : <Navigate to="/admin/login" replace />;
}

function PageTracker() {
  const location = useLocation();
  useEffect(() => {
    const name = location.pathname.replace(/\/\d+/g, '/:id').replace(/^\//, '') || 'home';
    trackPage(name, { path: location.pathname });
  }, [location.pathname]);
  return null;
}

export default function App() {
  return (
    <QueueDateProvider>
    <AuthProvider>
    <SubscriptionProvider>
    <AdminAuthProvider>
      <Toaster />
      <BrowserRouter basename="/opd">
        <PageTracker />
        <Routes>
          {/* Clinic Routes */}
          <Route path="/login"          element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/" element={<Protected><Layout /></Protected>}>
            <Route index element={<Navigate to="/queue" replace />} />
            <Route path="queue"              element={<Queue />} />
            <Route path="queue/setup"        element={<QueueSetup />} />
            <Route path="patients"           element={<Patients />} />
            <Route path="abha-qr-scan"       element={<AbhaQrScan />} />
            <Route path="rx/:appointmentId"  element={<WriteRx />} />
            <Route path="voice"              element={<VoiceAI />} />
            <Route path="assessment"         element={<Assessment />} />
            <Route path="settings"           element={<Settings />} />
            <Route path="inbound"            element={<Inbound />} />
            <Route path="analytics"          element={<Analytics />} />
            <Route path="abdm"               element={<AbdmDashboard />} />
            <Route path="payments"           element={<Payments />} />

            {/* Doctor: View patient lab results (inside clinic layout) */}
            <Route path="patients/:patientId/lab-results" element={<LabResultViewer />} />
            {/* Admin: Manage laboratories (inside clinic layout) */}
            <Route path="admin/laboratories" element={<AdminDashboard />} />
          </Route>

          {/* Public prescription view — no auth required */}
          <Route path="/rx-view/:apptId" element={<RxPublicView />} />

          {/* Lab Routes (standalone, no clinic layout) */}
          <Route path="/lab-login" element={<LabLogin />} />
          <Route path="/lab-portal" element={<LabProtected><LabPortal /></LabProtected>} />

          {/* Super Admin Portal */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminProtected><AdminLayout /></AdminProtected>}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard"       element={<SuperAdminDash />} />
            <Route path="clinics"         element={<AdminClinics />} />
            <Route path="clinics/:id"     element={<AdminClinicDetail />} />
            <Route path="subscriptions"   element={<AdminSubscriptions />} />
            <Route path="audit"           element={<AdminAudit />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AdminAuthProvider>
    </SubscriptionProvider>
    </AuthProvider>
    </QueueDateProvider>
  );
}
