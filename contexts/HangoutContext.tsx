'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';

interface HangoutContextType {
  activeRoom: string | null;
  openRoom: (roomName: string) => void;
  closeRoom: () => void;
}

const HangoutContext = createContext<HangoutContextType | undefined>(undefined);

export function HangoutContextProvider({ children }: { children: ReactNode }) {
  const [activeRoom, setActiveRoom] = useState<string | null>(null);

  return (
    <HangoutContext.Provider value={{
      activeRoom,
      openRoom: setActiveRoom,
      closeRoom: () => setActiveRoom(null),
    }}>
      {children}
    </HangoutContext.Provider>
  );
}

export function useHangout() {
  const context = useContext(HangoutContext);
  if (context === undefined) {
    throw new Error('useHangout must be used within a HangoutContextProvider');
  }
  return context;
}
