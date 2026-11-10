// Подтверждение действия. react-native-web не реализует Alert.alert (пустая
// функция без колбэков), поэтому на вебе штатный window.confirm, как в event/[id].tsx.

import { Alert, Platform } from 'react-native';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export function confirmAction({ title, message, confirmLabel, cancelLabel, destructive, onConfirm }: ConfirmOptions) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(message)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
