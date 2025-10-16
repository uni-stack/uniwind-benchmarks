import { useColorScheme } from 'nativewind'
import type React from 'react'
import { createContext } from 'react'
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
  const { colorScheme } = useColorScheme()
  return (
    <ThemeContext.Provider value={{ theme: colorScheme as 'light' | 'dark' }}>
      <View style={themes[colorScheme as 'light' | 'dark']} className="flex-1">
        {children}
      </View>
    </ThemeContext.Provider>
  )
}
