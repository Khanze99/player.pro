// Текст юридического документа нативным экраном: тот же текст, что на
// player-pro.ru/terms и /privacy (src/legal/content.generated.ts, `make legal`).
// Открывается с экрана согласий и из профиля; работает без сети. Только ru:
// юридический текст не локализуется (docs/plan-legal-texts.md).
// НЕ путать с app/privacy.tsx: там игрок управляет тем, кому открыты его данные.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { CloseIcon } from '@/components/Icons';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { ScreenTitle } from '@/components/Typography';
import { isLegalDoc, LEGAL_URLS, resolveLegalLink } from '@/legal';
import { LEGAL_CONTENT } from '@/legal/content.generated';
import type { LegalSpan } from '@/legal/types';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

export default function LegalDocScreen() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const { doc } = useLocalSearchParams<{ doc: string }>();

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!isLegalDoc(doc)) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Text style={styles.body}>{t('legalDocs.openError')}</Text>
        </View>
      </Screen>
    );
  }
  const content = LEGAL_CONTENT[doc];

  const openLink = (href: string) => {
    const target = resolveLegalLink(href);
    if (target.kind === 'route') router.push(target.href);
    else Linking.openURL(target.url).catch(() => toast(t('legalDocs.openError')));
  };

  const renderSpans = (spans: LegalSpan[]) =>
    spans.map((s, i) =>
      s.href ? (
        <Text key={i} style={styles.link} accessibilityRole="link" onPress={() => openLink(s.href!)}>
          {s.text}
        </Text>
      ) : (
        <Text key={i} style={s.bold ? styles.bold : undefined}>
          {s.text}
        </Text>
      ),
    );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <ScreenTitle style={styles.title}>{content.title}</ScreenTitle>
          <Pressable
            onPress={close}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={styles.close}
          >
            <CloseIcon color={th.textMuted} />
          </Pressable>
        </View>
        <Text style={styles.meta}>{content.meta}</Text>

        {content.blocks.map((block, i) => {
          if (block.type === 'h') {
            return (
              <Text key={i} style={styles.heading} accessibilityRole="header">
                {renderSpans(block.spans)}
              </Text>
            );
          }
          if (block.type === 'p') {
            return (
              <Text key={i} style={styles.body}>
                {renderSpans(block.spans)}
              </Text>
            );
          }
          return (
            <View key={i} style={styles.list}>
              {block.items.map((item, j) => (
                <View key={j} style={styles.listItem}>
                  <Text style={styles.body}>•</Text>
                  <Text style={[styles.body, styles.listText]}>{renderSpans(item)}</Text>
                </View>
              ))}
            </View>
          );
        })}

        <Text style={styles.footer}>
          {t('legalDocs.alsoOnSite')}{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => openLink(LEGAL_URLS[doc])}>
            {LEGAL_URLS[doc].replace('https://', '')}
          </Text>
        </Text>
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (th: Theme) =>
  StyleSheet.create({
    content: { padding: spacing.screen, gap: spacing.m, paddingBottom: 40 },
    header: { flexDirection: 'row', alignItems: 'center' },
    title: { flexShrink: 1 },
    close: { padding: spacing.xs, marginLeft: 'auto' },
    meta: { fontFamily: th.font.regular, fontSize: 12, color: th.textMuted },
    heading: { fontFamily: th.font.semibold, fontSize: 15, color: th.text, marginTop: spacing.m },
    body: { fontFamily: th.font.regular, fontSize: 14, color: th.textMuted, lineHeight: 21 },
    bold: { fontFamily: th.font.semibold, color: th.text },
    link: { color: th.brand, textDecorationLine: 'underline' },
    list: { gap: spacing.s },
    listItem: { flexDirection: 'row', gap: spacing.s },
    listText: { flex: 1 },
    footer: { fontFamily: th.font.regular, fontSize: 12, color: th.textMuted, marginTop: spacing.l },
  });
