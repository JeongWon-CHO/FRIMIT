import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';

/** 탭 화면의 제목 줄. 오른쪽에 알약이나 버튼 하나가 붙을 수 있다. */
export function TitleRow({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.row}>
      <AppText variant="screenTitle" font="display">
        {title}
      </AppText>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
});
