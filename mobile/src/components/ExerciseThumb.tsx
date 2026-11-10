// Превью упражнения из справочника. Картинка под токеном, поэтому грузится
// через useExerciseMedia (data-URI), а не прямым URL.

import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { useExerciseMedia } from '@/api/hooks';
import type { Exercise, ExerciseShort } from '@/api/types';
import { type Theme, useStyles } from '@/theme';

interface Props {
  exercise: ExerciseShort | Exercise;
  size?: number;
  /** GIF вместо статичной картинки (карточка упражнения) */
  animated?: boolean;
}

export function ExerciseThumb({ exercise, size = 56, animated = false }: Props) {
  const styles = useStyles(makeStyles);
  const available = animated ? 'has_gif' in exercise && exercise.has_gif : exercise.has_image;
  const media = useExerciseMedia(exercise.id, animated ? 'gif' : 'image', available);
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {media.data ? (
        <Image source={{ uri: media.data }} style={StyleSheet.absoluteFill} contentFit="contain" />
      ) : null}
    </View>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  // Картинки датасета на белом фоне: светлая подложка, чтобы не было «дыры» в тёмной теме
  box: {
    borderRadius: th.radius.chip,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
});
