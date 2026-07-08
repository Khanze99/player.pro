import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, font, gradients, radius, spacing } from '../theme';

interface Props {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export function Button({ title, onPress, disabled, loading }: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.wrap,
        inactive && styles.disabled,
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
      ]}
    >
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.text}>{title}</Text>}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.control,
    shadowColor: colors.brand,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  gradient: {
    borderRadius: radius.control,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  disabled: { opacity: 0.4, shadowOpacity: 0 },
  text: { fontFamily: font.semibold, fontSize: 17, color: '#FFFFFF', letterSpacing: 0.2 },
});
