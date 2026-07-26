import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius } from '../theme';

// A selectable filter pill. `accent` tints the active state.
export default function Chip({ label, active, onPress, accent = colors.primary }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active && { backgroundColor: accent + '22', borderColor: accent },
      ]}
    >
      <Text style={[styles.text, active && { color: accent }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginRight: 8,
    marginBottom: 8,
  },
  text: { color: colors.textDim, fontSize: 13, fontWeight: '700' },
});
