import { useFonts } from 'expo-font';
import { fonts } from './tokens';

export function useHomeFonts() {
  const [loaded] = useFonts({
    'Home-Fraunces': require('../../assets/fonts/Fraunces-SemiBold.ttf'),
    'Home-Plex': require('../../assets/fonts/IBMPlexSans-Regular.ttf'),
    'Home-Plex-SemiBold': require('../../assets/fonts/IBMPlexSans-SemiBold.ttf'),
    'Home-Plex-Bold': require('../../assets/fonts/IBMPlexSans-Bold.ttf'),
  });
  return {
    display: loaded ? 'Home-Fraunces' : fonts.display,
    body: loaded ? 'Home-Plex' : fonts.body,
    semibold: loaded ? 'Home-Plex-SemiBold' : fonts.body,
    bold: loaded ? 'Home-Plex-Bold' : fonts.body,
  };
}
