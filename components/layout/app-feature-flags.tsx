'use client'

import { createContext, useContext } from 'react'

interface AppFeatureFlags {
  practiceLibrary: boolean
}

const AppFeatureFlagsContext = createContext<AppFeatureFlags>({
  practiceLibrary: false,
})

export function AppFeatureFlagsProvider({
  practiceLibrary,
  children,
}: AppFeatureFlags & { children: React.ReactNode }) {
  return (
    <AppFeatureFlagsContext.Provider value={{ practiceLibrary }}>
      {children}
    </AppFeatureFlagsContext.Provider>
  )
}

/** UI visibility only; every practice route and mutation still authorizes on the server. */
export function useAppFeatureFlags(): AppFeatureFlags {
  return useContext(AppFeatureFlagsContext)
}
