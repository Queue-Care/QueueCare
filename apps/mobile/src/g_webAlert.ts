import { Alert, Platform } from 'react-native';

// react-native-web's Alert.alert does nothing, so in a browser the app's
// messages and confirmations use the browser's own dialogs instead.
if (Platform.OS === 'web') {
  const browser = globalThis as unknown as {
    alert(text: string): void;
    confirm(text: string): boolean;
  };
  Alert.alert = (title, message, buttons) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const cancel = buttons?.find(button => button.style === 'cancel');
    const actions = buttons?.filter(button => button !== cancel) ?? [];
    if (!cancel || !actions.length) {
      browser.alert(text);
      (actions[0] ?? cancel)?.onPress?.();
      return;
    }
    // One question per action: OK chooses it, Cancel moves on to the next.
    const chosen = actions.find(action =>
      browser.confirm(actions.length > 1 ? `${text}\n\n${action.text}?` : text),
    );
    (chosen ?? cancel).onPress?.();
  };
}
