<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../api.js';
import store from '../store.js';
import { useI18n } from '../i18n.js';
import LanguageSwitch from '../components/ui/LanguageSwitch.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const token = computed(() => String(route.params.token || '').trim());
const loading = ref(true);
const joining = ref(false);
const error = ref('');
const invite = ref(null);

const session = computed(() => store.session);
const isLoggedIn = computed(() => Boolean(session.value?.token || session.value?.userId));

function formatExpiry(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function loadInvite() {
  loading.value = true;
  error.value = '';
  try {
    const payload = await api.channelInviteLink(token.value);
    invite.value = payload.invite;
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    loading.value = false;
  }
}

async function join() {
  joining.value = true;
  error.value = '';
  try {
    const payload = await api.joinChannelByInvite(token.value);
    // 加入成功，回到聊天首页（频道列表会自动包含新频道）
    await router.push('/');
    window.location.reload();
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    joining.value = false;
  }
}

function goLogin() {
  router.push({ name: 'login', query: { redirect: route.fullPath } });
}

onMounted(loadInvite);
</script>

<template>
  <div class="invite-page">
    <LanguageSwitch class="invite-language-switch" />
    <div class="invite-container">
      <p v-if="loading" class="invite-info">{{ t('auth.validatingInvite') }}</p>

      <p v-else-if="error" class="invite-error">{{ error }}</p>

      <template v-else-if="invite">
        <div class="invite-card">
          <div class="invite-card__channel">
            <div class="invite-card__avatar">{{ (invite.channelName || '?')[0] }}</div>
            <div class="invite-card__heading">
              <h1 class="invite-card__name">{{ invite.channelName }}</h1>
              <p class="invite-card__desc">{{ invite.channelDescription || t('group.groupConversation') }}</p>
            </div>
          </div>

          <div class="invite-card__meta">
            <div class="invite-card__row">
              <span class="invite-card__label">群主</span>
              <span class="invite-card__value">{{ invite.ownerDisplayName || '—' }}</span>
            </div>
            <div class="invite-card__row">
              <span class="invite-card__label">邀请备注</span>
              <span class="invite-card__value">{{ invite.note || '—' }}</span>
            </div>
            <div class="invite-card__row">
              <span class="invite-card__label">剩余名额</span>
              <span class="invite-card__value">{{ invite.remainingUses }} / {{ invite.maxUses }}</span>
            </div>
            <div class="invite-card__row">
              <span class="invite-card__label">有效期</span>
              <span class="invite-card__value">{{ formatExpiry(invite.expiresAt) ? `${formatExpiry(invite.expiresAt)} 前有效` : '永久有效' }}</span>
            </div>
          </div>

          <p v-if="error" class="invite-error invite-error--inline">{{ error }}</p>

          <button v-if="isLoggedIn" class="invite-btn" :disabled="joining" @click="join">
            {{ joining ? t('common.creating') : '加入群组' }}
          </button>
          <button v-else class="invite-btn" @click="goLogin">
            登录后加入
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.invite-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background-color: var(--auth-canvas, #f5f5f5);
  position: relative;
  overflow: hidden;
}

.invite-page::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  background: var(--auth-tide, linear-gradient(to bottom, transparent 0%, #e1ecf5 25%, #e6eff6 100%));
  pointer-events: none;
}

.invite-language-switch {
  position: absolute;
  top: max(16px, env(safe-area-inset-top));
  right: max(16px, env(safe-area-inset-right));
  z-index: 2;
  color: var(--auth-ink, #2c4a6e);
}

.invite-container {
  width: 100%;
  max-width: 420px;
  position: relative;
  z-index: 1;
}

.invite-info {
  font-size: 14px;
  color: var(--auth-muted, #6b8aab);
  text-align: center;
}

.invite-error {
  font-size: 14px;
  color: #d9534f;
  text-align: center;
  margin: 0;
}

.invite-error--inline {
  margin-bottom: 16px;
}

.invite-card {
  background: #fff;
  border-radius: 16px;
  padding: 28px 24px 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
}

.invite-card__channel {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}

.invite-card__avatar {
  width: 56px;
  height: 56px;
  flex: none;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 700;
  color: #fff;
  background: var(--site-action-bg, #008069);
}

.invite-card__heading {
  min-width: 0;
}

.invite-card__name {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
  color: #111b21;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invite-card__desc {
  margin: 0;
  font-size: 13px;
  color: #6b7c93;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invite-card__meta {
  display: grid;
  gap: 10px;
  padding: 16px 0;
  border-top: 1px solid #eef1f4;
  border-bottom: 1px solid #eef1f4;
  margin-bottom: 20px;
}

.invite-card__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.invite-card__label {
  font-size: 13px;
  color: #6b7c93;
  flex: none;
}

.invite-card__value {
  font-size: 14px;
  color: #111b21;
  text-align: right;
  overflow-wrap: anywhere;
}

.invite-btn {
  width: 100%;
  min-height: 48px;
  border: 0;
  border-radius: 10px;
  background: var(--site-action-bg, #008069);
  color: var(--site-on-action, #fff);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
}

.invite-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
