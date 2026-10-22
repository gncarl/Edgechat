import {
  createChannelInvite,
  getChannelInviteByToken,
  joinChannelWithInvite,
  listChannelInvites,
  MAX_CHANNEL_INVITE_USES,
  revokeChannelInvite
} from '../data/channel-invites.js';
import { authorizeChannelManagement } from '../room-access.js';
import { errorResponse, parseJsonRequest, randomToken } from '../utils.js';

// 公开路由：任何人通过邀请链接预览频道信息（不需要登录）
export function registerChannelInvitePublicRoutes(app) {
  app.get('/api/invite-links/:token', async (c) => {
    const token = String(c.req.param('token') || '').trim();
    if (!token) {
      return errorResponse('邀请链接不存在', 404);
    }

    const invite = await getChannelInviteByToken(c.env.DB, token);
    if (!invite) {
      return errorResponse('邀请链接已失效', 404);
    }

    return c.json({
      invite: {
        channelId: invite.channelId,
        channelName: invite.channelName,
        channelDescription: invite.channelDescription,
        ownerDisplayName: invite.ownerDisplayName,
        note: invite.note,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        maxUses: invite.maxUses,
        usedCount: invite.usedCount,
        remainingUses: invite.remainingUses
      }
    });
  });
}

// 鉴权路由：需要登录（群主管理 + 用户加入）
export function registerChannelInviteRoutes(app) {
  app.get('/api/channels/:channelId/invite-links', async (c) => {
    const session = c.get('session');
    const channelId = Number(c.req.param('channelId'));
    const management = await authorizeChannelManagement(c.env.DB, session, channelId);
    if (!management.ok) {
      return errorResponse('只有群主可以查看邀请链接', 403);
    }

    const invites = await listChannelInvites(c.env.DB, channelId);
    return c.json({ invites });
  });

  app.post('/api/channels/:channelId/invite-links', async (c) => {
    const session = c.get('session');
    const channelId = Number(c.req.param('channelId'));
    const management = await authorizeChannelManagement(c.env.DB, session, channelId);
    if (!management.ok) {
      return errorResponse('只有群主可以生成邀请链接', 403);
    }

    const payload = await parseJsonRequest(c.req.raw);
    const note = String(payload.note || '').trim();
    const maxUses = Number(payload.maxUses ?? 1);
    const expiresInDays = payload.expiresInDays === undefined || payload.expiresInDays === null || payload.expiresInDays === ''
      ? null
      : Number(payload.expiresInDays);

    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > MAX_CHANNEL_INVITE_USES) {
      return errorResponse(`可使用次数必须是 1 到 ${MAX_CHANNEL_INVITE_USES} 之间的整数`);
    }
    if (expiresInDays !== null && (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365)) {
      return errorResponse('有效期天数必须是 1 到 365 之间的整数');
    }

    const token = randomToken(24);
    const invite = await createChannelInvite(c.env.DB, {
      channelId,
      token,
      note,
      maxUses,
      expiresInDays,
      createdBy: session.userId,
      creatorDisplayName: session.displayName
    });

    return c.json({ invite });
  });

  app.delete('/api/channels/:channelId/invite-links/:inviteId', async (c) => {
    const session = c.get('session');
    const channelId = Number(c.req.param('channelId'));
    const inviteId = Number(c.req.param('inviteId'));
    const management = await authorizeChannelManagement(c.env.DB, session, channelId);
    if (!management.ok) {
      return errorResponse('只有群主可以作废邀请链接', 403);
    }
    if (!Number.isFinite(inviteId)) {
      return errorResponse('邀请链接不存在', 404);
    }

    await revokeChannelInvite(c.env.DB, inviteId, channelId);
    return c.json({ ok: true });
  });

  app.post('/api/invite-links/:token/join', async (c) => {
    const session = c.get('session');
    const token = String(c.req.param('token') || '').trim();
    if (!token) {
      return errorResponse('邀请链接不存在', 404);
    }

    const invite = await getChannelInviteByToken(c.env.DB, token);
    if (!invite) {
      return errorResponse('邀请链接已失效', 404);
    }

    await joinChannelWithInvite(c.env.DB, invite.id, session.userId);

    return c.json({
      ok: true,
      channel: {
        id: invite.channelId,
        name: invite.channelName,
        kind: invite.channelKind
      }
    });
  });
}
