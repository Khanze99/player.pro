// Установка PIN: два ввода подряд (дизайн-ТЗ 5.1). Последний шаг онбординга.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { savePin, session } from '@/auth/session';
import { PinPad } from '@/components/PinPad';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';

export default function PinSetup() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const changingPin = session((s) => s.status) === 'active'; // смена PIN из профиля

  const onComplete = async (pin: string) => {
    if (first === null) {
      setFirst(pin);
      setError(null);
      return;
    }
    if (pin !== first) {
      setFirst(null);
      setError(t('auth.pinMismatch'));
      setShakeKey((k) => k + 1);
      return;
    }
    await savePin(pin);
    toast(t('common.saved'));
    if (changingPin) {
      router.back();
    } else {
      session.getState().setStatus('active');
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <PinPad
        title={first === null ? t('auth.pinSetupTitle') : t('auth.pinSetupRepeat')}
        error={error}
        shakeKey={shakeKey}
        onComplete={(pin) => void onComplete(pin)}
      />
    </Screen>
  );
}
