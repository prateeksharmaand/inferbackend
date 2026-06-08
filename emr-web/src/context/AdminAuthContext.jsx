import { createContext, useContext, useState, useEffect } from 'react';

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    const data  = localStorage.getItem('admin_user');
    if (token && data) setAdmin(JSON.parse(data));
    setReady(true);
  }, []);

  function login(token, user) {
    localStorage.setItem('admin_token', token);
    localStorage.setItem('admin_user', JSON.stringify(user));
    setAdmin(user);
  }

  function logout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    setAdmin(null);
  }

  return (
    <AdminAuthContext.Provider value={{ admin, ready, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export const useAdminAuth = () => useContext(AdminAuthContext);
