import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/types";

interface AuthState {
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  isAdmin: false,
  isLoading: true,
  setUser: (user) =>
    set((state) =>
      state.user?.id === user?.id ? { user } : { user, profile: null, isAdmin: false },
    ),
  setProfile: (profile) =>
    set((state) => {
      if (profile && profile.id !== state.user?.id) return state;
      return { profile, isAdmin: profile?.role === "admin" };
    }),
  setLoading: (isLoading) => set({ isLoading }),
  logout: () => set({ user: null, profile: null, isAdmin: false, isLoading: false }),
}));
