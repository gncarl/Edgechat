import { ApiError } from '../errors.js';

export const MAX_CHANNEL_INVITE_USES = 1000;

// 将 JS Date 转为 SQLite 可直接与 CURRENT_TIMESTAMP 比较的 UTC 文本格式
function toSqliteTimestamp(date) {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

// 将 SQLite UTC 文本格式转回 ISO，便于前端 new Date() 解析
function toIso(value) {
  if (!value) return null;
  return String(value).replace(' ', 'T') + 'Z';
}

function toInvite(row) {
  const maxUses = Number(row.max_uses);
  const usedCount = Number(row.used_count);
  return {
    id: Number(row.id),
    token: row.token,
    note: row.note || '',
    channelId: Number(row.channel_id),
    maxUses,
    usedCount,
    remainingUses: Math.max(0, maxUses - usedCount),
    createdAt: row.created_at,
    expiresAt: toIso(row.expires_at),
    consumedAt: row.consumed_at || null,
    deletedAt: row.deleted_at || null,
    creatorDisplayName: row.creator_display_name || '',
    consumerDisplayName: row.consumer_display_name || '',
    isAvailable: row.is_available === 1
  };
}

export async function listChannelInvites(db, channelId) {
  const { results } = await db.prepare(
    `SELECT
       ci.id,
       ci.token,
       ci.note,
       ci.channel_id,
       ci.max_uses,
       ci.used_count,
       ci.created_at,
       ci.expires_at,
       ci.consumed_at,
       ci.deleted_at,
       creator.display_name AS creator_display_name,
       consumer.display_name AS consumer_display_name,
       (ci.deleted_at IS NULL
         AND ci.used_count < ci.max_uses
         AND (ci.expires_at IS NULL OR ci.expires_at > CURRENT_TIMESTAMP)
       ) AS is_available
     FROM channel_invites ci
     LEFT JOIN users creator ON creator.id = ci.created_by
     LEFT JOIN users consumer ON consumer.id = ci.consumed_by_user_id
     WHERE ci.channel_id = ?
     ORDER BY ci.created_at DESC
     LIMIT 100`
  )
    .bind(channelId)
    .all();

  return results.map(toInvite);
}

export async function createChannelInvite(db, invite) {
  let expiresAt = null;
  if (invite.expiresInDays && Number.isInteger(invite.expiresInDays)) {
    expiresAt = toSqliteTimestamp(
      new Date(Date.now() + invite.expiresInDays * 24 * 60 * 60 * 1000)
    );
  }

  const result = await db.prepare(
    `INSERT INTO channel_invites (channel_id, token, note, max_uses, expires_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(invite.channelId, invite.token, invite.note, invite.maxUses, expiresAt, invite.createdBy)
    .run();

  return {
    id: Number(result.meta.last_row_id),
    token: invite.token,
    note: invite.note,
    channelId: Number(invite.channelId),
    maxUses: invite.maxUses,
    usedCount: 0,
    remainingUses: invite.maxUses,
    createdAt: new Date().toISOString().replace('T', ' ').replace('Z', ''),
    expiresAt: toIso(expiresAt),
    consumedAt: null,
    deletedAt: null,
    creatorDisplayName: invite.creatorDisplayName || '',
    consumerDisplayName: '',
    isAvailable: true
  };
}

export async function revokeChannelInvite(db, inviteId, channelId) {
  await db.prepare(
    `UPDATE channel_invites
     SET deleted_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND channel_id = ?
       AND deleted_at IS NULL`
  )
    .bind(inviteId, channelId)
    .run();
}

export async function getChannelInviteByToken(db, token) {
  const row = await db.prepare(
    `SELECT
       ci.id,
       ci.channel_id,
       ci.token,
       ci.note,
       ci.max_uses,
       ci.used_count,
       ci.created_at,
       ci.expires_at,
       ci.deleted_at,
       c.name AS channel_name,
       c.description AS channel_description,
       c.kind AS channel_kind,
       owner.display_name AS owner_display_name,
       (ci.deleted_at IS NULL
         AND ci.used_count < ci.max_uses
         AND (ci.expires_at IS NULL OR ci.expires_at > CURRENT_TIMESTAMP)
       ) AS is_available
     FROM channel_invites ci
     JOIN channels c ON c.id = ci.channel_id AND c.deleted_at IS NULL
     LEFT JOIN users owner ON owner.id = c.created_by
     WHERE ci.token = ?
     LIMIT 1`
  )
    .bind(token)
    .first();

  if (!row || row.is_available !== 1) {
    return null;
  }

  return {
    id: Number(row.id),
    channelId: Number(row.channel_id),
    token: row.token,
    note: row.note || '',
    channelName: row.channel_name,
    channelDescription: row.channel_description || '',
    channelKind: row.channel_kind,
    ownerDisplayName: row.owner_display_name || '',
    maxUses: Number(row.max_uses),
    usedCount: Number(row.used_count),
    remainingUses: Math.max(0, Number(row.max_uses) - Number(row.used_count)),
    createdAt: row.created_at,
    expiresAt: toIso(row.expires_at)
  };
}

export async function joinChannelWithInvite(db, inviteId, userId) {
  try {
    await db.prepare(
      `INSERT INTO channel_invite_uses (invite_id, user_id)
       VALUES (?, ?)`
    )
      .bind(inviteId, userId)
      .run();
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes('CHANNEL_INVITE_UNAVAILABLE')) {
      throw new ApiError('邀请链接已失效', 400);
    }
    if (message.includes('ALREADY_CHANNEL_MEMBER')) {
      throw new ApiError('你已经在该群组中了', 400);
    }
    throw error;
  }
}
