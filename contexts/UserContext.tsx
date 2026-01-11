'use client';
import { HiveAccount } from "@/hooks/useHiveAccount";
import { createContext, useContext, useEffect, useState } from "react";

export interface HiveUserContextProps {
  hiveUser: HiveAccount | null;
  setHiveUser: (user: HiveAccount | null) => void;
  isLoading: boolean | undefined;
  refreshUser: () => void;
}

const HiveUserContext = createContext<HiveUserContextProps | undefined>(
  undefined,
);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<HiveAccount | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>();

  const refreshUser = () => {
    try {
      const userData = localStorage.getItem("hiveuser");
      if (userData) {
        setUser(JSON.parse(userData));
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
      localStorage.removeItem("hiveuser");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  // Wrapped setUser that also saves to localStorage
  const setHiveUserWithPersistence = (newUser: HiveAccount | null) => {
    setUser(newUser);
    try {
      if (newUser) {
        localStorage.setItem("hiveuser", JSON.stringify(newUser));
      } else {
        localStorage.removeItem("hiveuser");
      }
    } catch (error) {
      console.error('Error saving user to localStorage:', error);
    }
  };

  return (
    <HiveUserContext.Provider
      value={{
        hiveUser: user,
        setHiveUser: setHiveUserWithPersistence,
        isLoading,
        refreshUser
      }}
    >
      {children}
    </HiveUserContext.Provider>
  );
};

export const useHiveUser: () => HiveUserContextProps = () => {
  const context = useContext(HiveUserContext);
  if (!context) {
    throw new Error("useHiveUser must be used within a UserProvider");
  }
  return context;
};
