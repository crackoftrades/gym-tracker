import { Pressable, StyleSheet, Text, View } from 'react-native';
import Tag from './Tag';
import { categoryColor, colors, radius, splitColor } from '../theme';

// A tappable exercise row: name + muscle/equipment tags, optional right slot.
export default function ExerciseRow({ exercise, onPress, right, subtitle }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {exercise.name}
        </Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        <View style={styles.tags}>
          <Tag label={exercise.category} color={categoryColor[exercise.category] || colors.textDim} solid />
          {!!exercise.split_day && (
            <View style={{ marginLeft: 6 }}>
              <Tag label={exercise.split_day} color={splitColor[exercise.split_day] || colors.textDim} />
            </View>
          )}
          {!!exercise.equipment && (
            <View style={{ marginLeft: 6 }}>
              <Tag label={exercise.equipment} color={colors.textDim} />
            </View>
          )}
        </View>
      </View>
      {right !== undefined ? right : <Text style={styles.chevron}>›</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  pressed: { opacity: 0.8, borderColor: colors.borderLight },
  name: { color: colors.text, fontSize: 16, fontWeight: '800' },
  subtitle: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  tags: { flexDirection: 'row', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' },
  chevron: { color: colors.textFaint, fontSize: 26, fontWeight: '300', marginLeft: 8 },
});
