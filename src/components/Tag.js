import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

// Small colored label used for category / split / equipment tags.
export default function Tag({ label, color = colors.textDim, solid }) {
  return (
    <View
      style={[
        styles.tag,
        { borderColor: color + '55', backgroundColor: solid ? color + '22' : 'transparent' },
      ]}
    >
      <Text style={[styles.text, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
});
