import { StyleSheet } from 'react-native-unistyles'

const lightTheme = {
  colors: {
    primary: '#00a8ff',
    gray: '#f0f0f0',
    typography: '#000',
  },
}

const darkTheme = {
  colors: {
    primary: '#273c75',
    gray: '#353b48',
    typography: '#fff',
  },
}

const appThemes = {
  light: lightTheme,
  dark: darkTheme,
}

type AppThemes = typeof appThemes

declare module 'react-native-unistyles' {
  export interface UnistylesThemes extends AppThemes {}
}

StyleSheet.configure({
  settings: {
    adaptiveThemes: true,
  },
  themes: appThemes,
})
