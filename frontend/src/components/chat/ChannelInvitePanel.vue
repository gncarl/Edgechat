<script setup>
import { Copy, Ellipsis, Ban } from '@lucide/vue';
import { computed, onMounted, reactive, ref } from 'vue';
import api from '../../api.js';
import { t } from '../../i18n.js';

const props = defineProps({
  channelId: { type: Number, required: true }
});

const loading = ref(false);
const error = ref('');
const submitting = ref(false);
const invites = ref([]);
const copiedInviteId = ref(0);

const form = reactive({
  note: '',
  maxUses: 10,
  expiresInDays: null
});

const formValid = computed(() =>
  Number.isInteger(form.maxUses) && form.maxUses >= 1 && form.maxUses <= 1000 &&
  (form.expiresInDays === null || form.expiresInDays === '' ||
    (Number.isInteger(Number(form.expiresInDays)) && Number(form.expiresInDays) >= 1 && Number(form.expiresInDays) <= 365))
);

function inviteLinkUrl(token) {
  return new URL(`/invite/${token}`, window.location.origin).toString();
}

function statusLabel(invite) {
  if (invite.isAvailable) return '有效';
  return invite.deletedAt ? '已作废' : '已用尽或已过期';
}

function statusClass(invite) {
  return invite.isAvailable ? 'channel-invite__status--available' : 'channel-invite__status--disabled';
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function loadInvites() {
  loading.value = true;
  error.value = '';
  try {
    const payload = await api.listChannelInviteLinks(props.channelId);
    invites.value = payload.invites || [];
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    loading.value = false;
  }
}

async function createInvite() {
  submitting.value = true;
  error.value = '';
  try {
    const payload = await api.createChannelInviteLink(props.channelId, {
      note: form.note,
      maxUses: Number(form.maxUses),
      expiresInDays: form.expiresInDays === '' || form.expiresInDays === null ? null : Number(form.expiresInDays)
    });
    invites.value = [payload.invite, ...invites.value];
    form.note = '';
    form.maxUses = 10;
    form.expiresInDays = null;
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    submitting.value = false;
  }
}

async function copyInvite(invite) {
  try {
    await navigator.clipboard.writeText(inviteLinkUrl(invite.token));
    copiedInviteId.value = invite.id;
    window.setTimeout(() => {
      if (copiedInviteId.value === invite.id) {
        copiedInviteId.value = 0;
      }
    }, 1600);
  } catch {
    error.value = '复制失败，请手动复制';
  }
}

async function revokeInvite(invite, event) {
  event?.currentTarget.closest('details')?.removeAttribute('open');
  if (!window.confirm('确定作废这条邀请链接吗？')) {
    return;
  }
  try {
    await api.revokeChannelInviteLink(props.channelId, invite.id);
    invites.value = invites.value.filter((item) => item.id !== invite.id);
  } catch (currentError) {
    error.value = currentError.message;
  }
}

onMounted(loadInvites);
</script>

<template>
  <section class="channel-invite">
    <h3 class="channel-invite__title">邀请链接</h3>
    <p v-if="error" class="channel-invite__error">{{ error }}</p>

    <form class="channel-invite__form" @submit.prevent="createInvite">
      <div class="channel-invite__fields">
        <label class="channel-invite__field channel-invite__field--note">
          <span>备注</span>
          <input v-model.trim="form.note" type="text" placeholder="例如：邀请绘本合作老师" maxlength="60" />
        </label>
        <label class="channel-invite__field">
          <span>可用次数</span>
          <input v-model.number="form.maxUses" type="number" min="1" max="1000" step="1" />
        </label>
        <label class="channel-invite__field">
          <span>有效期（天，留空=永久）</span>
          <input v-model="form.expiresInDays" type="number" min="1" max="365" step="1" placeholder="永久" />
        </label>
      </div>
      <button class="channel-invite__create" type="submit" :disabled="submitting || !formValid">
        {{ submitting ? '生成中…' : '生成邀请链接' }}
      </button>
    </form>

    <p v-if="loading" class="channel-invite__muted">加载中…</p>
    <p v-else-if="!invites.length" class="channel-invite__muted">还没有邀请链接</p>

    <div class="channel-invite__list">
      <div v-for="invite in invites" :key="invite.id" class="channel-invite__card">
        <div class="channel-invite__card-head">
          <strong>{{ invite.note || '未命名邀请' }}</strong>
          <span class="channel-invite__status" :class="statusClass(invite)">{{ statusLabel(invite) }}</span>
        </div>
        <div class="channel-invite__url">{{ inviteLinkUrl(invite.token) }}</div>
        <p class="channel-invite__usage">
          已用 {{ invite.usedCount }} / {{ invite.maxUses }} 次
          <span class="channel-invite__remaining">剩余 {{ invite.remainingUses }} 次</span>
        </p>
        <p class="channel-invite__meta-line">
          <span>{{ invite.expiresAt ? `${formatDate(invite.expiresAt)} 前有效` : '永久有效' }}</span>
          <span v-if="invite.consumerDisplayName"> · 最近使用：{{ invite.consumerDisplayName }}</span>
        </p>
        <footer class="channel-invite__footer">
          <div class="channel-invite__provenance">
            <span>{{ invite.creatorDisplayName }}</span>
            <span aria-hidden="true">·</span>
            <span>{{ formatDate(invite.createdAt) }}</span>
          </div>
          <div class="channel-invite__actions">
            <button
              type="button"
              class="channel-invite__action"
              :title="copiedInviteId === invite.id ? '已复制' : '复制链接'"
              @click="copyInvite(invite)"
            >
              <Copy :size="15" aria-hidden="true" />
              {{ copiedInviteId === invite.id ? '已复制' : '复制' }}
            </button>
            <details v-if="invite.isAvailable" class="channel-invite__menu">
              <summary class="channel-invite__menu-trigger" title="更多操作" aria-label="更多操作">
                <Ellipsis :size="18" aria-hidden="true" />
              </summary>
              <div class="channel-invite__popover">
                <button type="button" @click="revokeInvite(invite, $event)">
                  <Ban :size="15" aria-hidden="true" />
                  作废链接
                </button>
              </div>
            </details>
          </div>
        </footer>
      </div>
    </div>
  </section>
</template>

<style scoped>
.channel-invite {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #eef1f4;
}

.channel-invite__title {
  margin: 0 0 12px;
  font-size: 15px;
  color: #111b21;
}

.channel-invite__error {
  margin: 0 0 10px;
  color: #b42318;
  font-size: 13px;
}

.channel-invite__form {
  display: grid;
  gap: 10px;
  margin-bottom: 16px;
}

.channel-invite__fields {
  display: grid;
  gap: 10px;
}

.channel-invite__field {
  display: grid;
  gap: 4px;
  color: #6b7c93;
  font-size: 12px;
}

.channel-invite__field input {
  width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid #e8ecf0;
  border-radius: 8px;
  background: #f9fafb;
  font-size: 14px;
  color: #111b21;
  box-sizing: border-box;
}

.channel-invite__create {
  min-height: 40px;
  border: 0;
  border-radius: 8px;
  background: var(--site-action-bg, #008069);
  color: var(--site-on-action, #fff);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
}

.channel-invite__create:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.channel-invite__muted {
  margin: 4px 0;
  color: #6b7c93;
  font-size: 13px;
}

.channel-invite__list {
  display: grid;
  gap: 10px;
}

.channel-invite__card {
  padding: 12px 14px;
  border: 1px solid #eef1f4;
  border-radius: 10px;
  background: #fcfcfd;
}

.channel-invite__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 14px;
  color: #111b21;
}

.channel-invite__status {
  flex: none;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
}

.channel-invite__status--available {
  color: #0a7a3d;
  background: #e6f4ea;
}

.channel-invite__status--disabled {
  color: #6b7c93;
  background: #eef1f4;
}

.channel-invite__url {
  margin: 6px 0 4px;
  font-size: 12px;
  color: #6b7c93;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: ltr;
  text-align: left;
}

.channel-invite__usage {
  margin: 0;
  font-size: 13px;
  color: #111b21;
}

.channel-invite__remaining {
  color: #6b7c93;
}

.channel-invite__meta-line {
  margin: 2px 0 0;
  font-size: 12px;
  color: #6b7c93;
}

.channel-invite__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
}

.channel-invite__provenance {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6b7c93;
}

.channel-invite__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.channel-invite__action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid #e8ecf0;
  border-radius: 8px;
  background: #fff;
  padding: 5px 10px;
  font-size: 12px;
  color: #111b21;
  cursor: pointer;
}

.channel-invite__menu {
  position: relative;
}

.channel-invite__menu-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid #e8ecf0;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  list-style: none;
}

.channel-invite__menu-trigger::-webkit-details-marker {
  display: none;
}

.channel-invite__popover {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 20;
  background: #fff;
  border: 1px solid #eef1f4;
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
  padding: 4px;
}

.channel-invite__popover button {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: #b42318;
  cursor: pointer;
  white-space: nowrap;
}

.channel-invite__popover button:hover {
  background: #fef2f2;
}
</style>
