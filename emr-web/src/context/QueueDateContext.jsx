import { createContext, useContext, useState } from 'react';

const QueueDateContext = createContext(null);

export function QueueDateProvider({ children }) {
  const [queueDate, setQueueDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const prevDay = () => setQueueDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
  const nextDay = () => setQueueDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });

  return (
    <QueueDateContext.Provider value={{ queueDate, setQueueDate, prevDay, nextDay }}>
      {children}
    </QueueDateContext.Provider>
  );
}

export function useQueueDate() {
  return useContext(QueueDateContext);
}
