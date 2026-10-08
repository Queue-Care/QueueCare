import React from 'react';
import { Text as NativeText, type TextProps } from 'react-native';
import { translateText, useLanguage } from './g_language';

// A drop-in replacement for React Native's Text on patient screens. In English it
// renders exactly what it is given. In Sinhala or Tamil each piece of text is
// looked up, and anything without a translation (names, dates, codes) is kept.
export function Text({ children, ...props }: TextProps) {
  const language = useLanguage();
  return (
    <NativeText {...props}>
      {language === 'en'
        ? children
        : React.Children.map(children, child =>
            typeof child === 'string' ? translateText(language, child) : child,
          )}
    </NativeText>
  );
}
