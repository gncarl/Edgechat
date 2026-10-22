-- 2026-10-22-channel-invite-links.sql
-- 私有频道邀请链接功能
-- 说明：channel_invites / channel_invite_uses 两张表与三个触发器
--       （validate_channel_invite_use / consume_channel_invite_use / join_channel_by_invite）
--       由 D1 控制台按部署文档手动创建，本文件负责补齐 note 字段与索引。

ALTER TABLE channel_invites ADD COLUMN note TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_channel_invites_active
  ON channel_invites(created_at DESC, deleted_at, consumed_at);

CREATE INDEX IF NOT EXISTS idx_channel_invites_token
  ON channel_invites(token);
