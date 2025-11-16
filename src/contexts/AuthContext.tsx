/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session, User } from '@supabase/supabase-js';
import { perfLogger, measureAsync } from '@/lib/performanceLogger';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  roles?: string[];
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  setUser: (user: User | null) => void;
  signOut: () => Promise<void>;
  isLoading: boolean;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user profile with roles (with caching)
  const loadProfile = async (userId: string) => {
    try {
      // Check cache first (localStorage for profile data)
      const cacheKey = `profile_${userId}`;
      const cached = localStorage.getItem(cacheKey);
      const now = Date.now();

      if (cached) {
        const { data: cachedData, timestamp } = JSON.parse(cached);
        // Use cache if less than 5 minutes old
        if (now - timestamp < 5 * 60 * 1000) {
          setProfile(cachedData);
          return;
        }
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          name,
          banned,
          user_roles (role)
        `)
        .eq('id', userId)
        .single();

      if (profileData) {
        // Check if user is banned
        if (profileData.banned) {
          console.warn('User is banned, signing out');
          await supabase.auth.signOut();
          setUser(null);
          setProfile(null);
          setSession(null);
          return;
        }

        const profile = {
          id: profileData.id,
          email: profileData.email,
          name: profileData.name,
          roles: profileData.user_roles?.map((r: any) => r.role) || []
        };

        // Cache the profile
        localStorage.setItem(cacheKey, JSON.stringify({
          data: profile,
          timestamp: now
        }));

        setProfile(profile);
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  };

  useEffect(() => {
    let mounted = true;

    perfLogger.start('auth-initialization');

    // Check for existing session FIRST
    measureAsync('auth-getSession', () => supabase.auth.getSession()).then(async ({ data: { session } }) => {
      if (!mounted) return;
      
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        await measureAsync('auth-loadProfile', () => loadProfile(session.user.id));
      }

      setIsLoading(false);
      perfLogger.end('auth-initialization');
    });

    // Set up auth state listener for future changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;
        
        perfLogger.start('auth-stateChange');
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          await measureAsync('auth-loadProfile-onChange', () => loadProfile(session.user.id));
        } else {
          setProfile(null);
        }

        setIsLoading(false);
        perfLogger.end('auth-stateChange');
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Sign out error:', error);
      }
    } catch (err) {
      console.error('Sign out unexpected error:', err);
    } finally {
      // Clear local state and cached profile
      try {
        if (profile?.id) {
          localStorage.removeItem(`profile_${profile.id}`);
        }
      } catch (e) {
        // ignore localStorage failures
      }
      setUser(null);
      setProfile(null);
      setSession(null);
    }
  };

  const hasRole = (role: string): boolean => {
    if (!profile?.roles) return false;
    return profile.roles.includes(role);
  };

  return (
    <AuthContext.Provider value={{ user, profile, session, setUser, signOut, isLoading, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};