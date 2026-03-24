import type React from 'react'
import { createContext } from 'react'
import { useColorScheme } from 'react-native'
import { View } from 'react-native'
import { themes } from './themes'

interface ThemeProviderProps {
  children: React.ReactNode
}

export const ThemeContext = createContext<{
  theme: 'light' | 'dark'
}>({
  theme: 'light',
})

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const colorScheme = useColorScheme()
  const scheme = (colorScheme ?? 'light') as 'light' | 'dark'
  return (
    <ThemeContext.Provider value={{ theme: scheme }}>
      <View style={themes[scheme]} className="flex-1">
        {children}
      </View>
    </ThemeContext.Provider>
  )
}
