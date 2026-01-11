'use client';
import { useState, useEffect, useCallback } from 'react';
import { KeychainSDK, Login, KeychainKeyTypes } from 'keychain-sdk';
import HiveClient from '@/lib/hive/hiveclient';
import { HiveAccount } from './useHiveAccount';

// Cookie helper functions
const setCookie = (name: string, value: string, days: number = 30) => {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
};

const getCookie = (name: string): string | null => {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
};

const deleteCookie = (name: string) => {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
};

// Check if Keychain extension is available
const isKeychainAvailable = (): boolean => {
  return typeof window !== 'undefined' && !!window.hive_keychain;
};

export interface HiveKeychainUser {
  username: string;
  isLoggedIn: boolean;
}

// Helper function to fetch and save full account data
const fetchAndSaveAccountData = async (username: string): Promise<void> => {
  try {
    const userData = await HiveClient.database.getAccounts([username]);
    if (userData && userData[0]) {
      const userAccount: HiveAccount = {
        ...userData[0],
      };
      
      // Parse metadata
      if (userAccount.posting_json_metadata) {
        userAccount.metadata = JSON.parse(userAccount.posting_json_metadata);
      } else if (userAccount.json_metadata) {
        userAccount.metadata = JSON.parse(userAccount.json_metadata);
      } else {
        userAccount.metadata = {};
      }
      
      // Save to localStorage for persistence
      localStorage.setItem('hiveuser', JSON.stringify(userAccount));
    }
  } catch (error) {
    console.error('Error fetching account data:', error);
  }
};

export function useHiveKeychain() {
  const [user, setUser] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isKeychainInstalled, setIsKeychainInstalled] = useState(false);

  // Check for existing session on mount
  useEffect(() => {
    const savedUsername = getCookie('hive_username');
    if (savedUsername && isKeychainAvailable()) {
      setUser(savedUsername);
      setIsLoggedIn(true);
      // Ensure account data is in localStorage
      const storedUser = localStorage.getItem('hiveuser');
      if (!storedUser) {
        fetchAndSaveAccountData(savedUsername);
      }
    }
    setIsKeychainInstalled(isKeychainAvailable());
  }, []);

  // Login function
  const login = useCallback(async (username: string): Promise<boolean> => {
    if (!isKeychainAvailable()) {
      throw new Error('Hive Keychain extension is not installed. Please install it from https://hive-keychain.com/');
    }

    try {
      const keychain = new KeychainSDK(window);
      const memo = `Login to Snapie at ${Date.now()}`;
      
      const loginData: Login = {
        username,
        message: memo,
        method: KeychainKeyTypes.posting,
        title: 'Login to Snapie'
      };

      const result = await keychain.login(loginData);

      if (result && result.success) {
        // Save username in cookie (30 days)
        setCookie('hive_username', username, 30);
        setUser(username);
        setIsLoggedIn(true);
        
        // Fetch and save full account data to localStorage
        await fetchAndSaveAccountData(username);
        
        console.log('✅ Logged in as:', username);
        return true;
      } else {
        console.error('❌ Login failed:', result);
        return false;
      }
    } catch (error) {
      console.error('❌ Login error:', error);
      throw error;
    }
  }, []);

  // Logout function
  const logout = useCallback(() => {
    deleteCookie('hive_username');
    localStorage.removeItem('hiveuser');
    setUser(null);
    setIsLoggedIn(false);
    console.log('👋 Logged out');
  }, []);

  // Get Keychain SDK instance
  const getKeychain = useCallback(() => {
    if (!isKeychainAvailable()) {
      throw new Error('Hive Keychain is not available');
    }
    return new KeychainSDK(window);
  }, []);

  return {
    user,
    isLoggedIn,
    isKeychainInstalled,
    login,
    logout,
    getKeychain
  };
}
