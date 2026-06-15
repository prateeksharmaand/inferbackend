import { createContext, useContext, useState, useEffect } from 'react';
import { identifyUser, resetUser, track } from '../lib/mixpanel';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,  setUser]  = useState(null);
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('emr_token');
    const u = localStorage.getItem('emr_user');
    if (t && u) {
      const parsed = JSON.parse(u);
      setToken(t);
      setUser(parsed);
      // Re-identify on every page reload while logged in
      identifyUser(parsed);
    }
    setReady(true);
  }, []);

  const login = (tokenStr, userObj) => {
    localStorage.setItem('emr_token', tokenStr);
    localStorage.setItem('emr_user',  JSON.stringify(userObj));
    setToken(tokenStr);
    setUser(userObj);
    identifyUser(userObj);
    track('login', { clinic_id: userObj.clinic_id, doctor_name: userObj.name });
  };

  const logout = () => {
    localStorage.removeItem('emr_token');
    localStorage.removeItem('emr_user');
    setToken(null);
    setUser(null);
    track('logout');
    resetUser();
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, ready }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
