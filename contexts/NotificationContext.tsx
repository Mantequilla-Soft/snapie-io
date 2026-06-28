'use client';

import { createContext, useContext } from 'react';
import { useHiveUser } from '@/contexts/UserContext';
import { useHiveNotifications } from '@/hooks/useHiveNotifications';

interface NotificationContextValue {
  unreadCount: number;
}

const NotificationContext = createContext<NotificationContextValue>({ unreadCount: 0 });

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { hiveUser } = useHiveUser();
  const username = hiveUser?.name ?? null;
  const { unreadCount } = useHiveNotifications(username, { limit: 1, poll: true });

  return (
    <NotificationContext.Provider value={{ unreadCount }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  return useContext(NotificationContext);
}
