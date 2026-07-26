import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, shadow } from '../theme';

export default function Button({ title, onPress, variant = 'primary', disabled, loading, style }) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';

  const label = (
    <View style={styles.inner}>
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text style={[styles.title, !isPrimary && !isDanger && styles.titleGhost]}>{title}</Text>
      )}
    </View>
  );

  return (
    <Pressable
      onPress={() => {
        if (disabled || loading) return;
        onPress?.();
      }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.wrap,
        isPrimary && shadow.glow(colors.primary),
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {isPrimary ? (
        <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.grad}>
          {label}
        </LinearGradient>
      ) : isDanger ? (
        <View style={styles.danger}>{label}</View>
      ) : (
        <View style={styles.ghost}>{label}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: 'hidden' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.4 },
  grad: { paddingVertical: 15, paddingHorizontal: 22 },
  ghost: {
    paddingVertical: 15,
    paddingHorizontal: 22,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  danger: {
    paddingVertical: 15,
    paddingHorizontal: 22,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,90,95,0.4)',
    backgroundColor: 'rgba(255,90,95,0.12)',
  },
  inner: { alignItems: 'center', justifyContent: 'center', minHeight: 20 },
  title: { color: colors.white, fontSize: 15, fontWeight: '800', letterSpacing: 0.8 },
  titleGhost: { color: colors.text },
});
