import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Queue from './pages/Queue';
import QueueSetup from './pages/QueueSetup';
import Patients from './pages/Patients';
import WriteRx from './pages/WriteRx';
import Settings from './pages/Settings';

function Protected({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename="/opd">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Layout /></Protected>}>
            <Route index element={<Navigate to="/queue" replace />} />
            <Route path="queue"              element={<Queue />} />
            <Route path="queue/setup"        element={<QueueSetup />} />
            <Route path="patients"           element={<Patients />} />
            <Route path="rx/:appointmentId"  element={<WriteRx />} />
            <Route path="settings"           element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
