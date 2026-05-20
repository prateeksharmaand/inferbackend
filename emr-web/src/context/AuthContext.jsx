import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,  setUser]  = useState(null);
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('emr_token');
    const u = localStorage.getItem('emr_user');
    if (t && u) { setToken(t); setUser(JSON.parse(u)); }
    setReady(true);
  }, []);

  const login = (tokenStr, userObj) => {
    localStorage.setItem('emr_token', tokenStr);
    localStorage.setItem('emr_user',  JSON.stringify(userObj));
    setToken(tokenStr);
    setUser(userObj);
  };

  const logout = () => {
    localStorage.removeItem('emr_token');
    localStorage.removeItem('emr_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, ready }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
