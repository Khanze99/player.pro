// Приглашение в клуб (ТЗ 2.3/3.4): админ отправляет инвайт на телефон/почту
// с преднастроенной ролью. Человек входит обычным OTP — инвайт применяется сам.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import { useCreateInvite, useMyTeams } from '@/api/hooks';
import type { GlobalRole, TeamRole } from '@/api/types';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { CloseIcon } from '@/components/Icons';
import { OptionChips } from '@/components/OptionChips';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

type InviteRole = 'player' | 'coach' | 'medic' | 'admin';

const ROLES: readonly InviteRole[] = ['player', 'coach', 'medic', 'admin'];

const ROLE_MAP: Record<InviteRole, { global_role: GlobalRole; team_role: TeamRole | null }> = {
  player: { global_role: 'player', team_role: 'athlete' },
  coach: { global_role: 'staff', team_role: 'coach' },
  medic: { global_role: 'staff', team_role: 'medic' },
  admin: { global_role: 'admin', team_role: null },
};

export default function Invite() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const teams = useMyTeams();
  const createInvite = useCreateInvite();

  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<InviteRole>('player');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needsTeam = role !== 'admin';
  const activeTeamId = teamId ?? teams.data?.[0]?.id ?? null;
  const noTeams = needsTeam && teams.data != null && teams.data.length === 0;
  const canSend = identifier.trim().length >= 3 && (!needsTeam || activeTeamId != null);

  const submit = () => {
    setError(null);
    const { global_role, team_role } = ROLE_MAP[role];
    createInvite.mutate(
      {
        identifier: identifier.trim(),
        name: name.trim() || null,
        global_role,
        team_id: needsTeam ? activeTeamId : null,
        team_role: needsTeam ? team_role : null,
      },
      {
        onSuccess: () => {
          toast(t('invite.sent'));
          setIdentifier('');
          setName('');
        },
        onError: (e) => setError(e instanceof ApiError ? e.detail : t('common.retry')),
      },
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ScreenTitle>{t('invite.title')}</ScreenTitle>
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              style={styles.close}
            >
              <CloseIcon color={th.textMuted} />
            </Pressable>
          </View>

          <Field
            label={t('invite.identifierLabel')}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            keyboardType="email-address"
            autoFocus
          />
          <Field
            label={t('invite.nameLabel')}
            value={name}
            onChangeText={setName}
            placeholder={t('invite.namePlaceholder')}
          />

          <View style={styles.section}>
            <MicroLabel>{t('invite.roleLabel')}</MicroLabel>
            <OptionChips
              options={ROLES}
              value={role}
              onSelect={(v) => v && setRole(v)}
              labelFor={(v) => t(`invite.roles.${v}`)}
            />
          </View>

          {needsTeam && (teams.data?.length ?? 0) > 1 && (
            <View style={styles.section}>
              <MicroLabel>{t('invite.teamLabel')}</MicroLabel>
              <OptionChips
                options={teams.data?.map((team) => team.id) ?? []}
                value={activeTeamId}
                onSelect={(v) => v && setTeamId(v)}
                labelFor={(id) => teams.data?.find((team) => team.id === id)?.name ?? ''}
              />
            </View>
          )}

          {noTeams ? <Text style={styles.error}>{t('invite.noTeams')}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
        <View style={styles.footer}>
          <Button
            title={t('invite.send')}
            onPress={submit}
            disabled={!canSend}
            loading={createInvite.isPending}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.screen, gap: spacing.l },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.s,
  },
  close: { padding: spacing.xs },
  section: { gap: spacing.s },
  error: { fontFamily: th.font.medium, fontSize: 13, color: th.risk },
  footer: { padding: spacing.screen },
});
