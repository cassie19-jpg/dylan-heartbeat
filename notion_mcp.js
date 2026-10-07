const fs = require('fs');
const crypto = require('crypto');
const { runtimeFile, ensureDataDir } = require('./runtime_paths');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { auth } = require('@modelcontextprotocol/sdk/client/auth.js');

const ENDPOINT = 'https://mcp.notion.com/mcp';
const enabled = () => /^(true|1|yes)$/i.test(process.env.NOTION_MCP_ENABLED || '');
function pageId(value) {
  const text = String(value || '').split('?')[0];
  const match = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32}/i);
  return match ? match[0].replace(/-/g, '').toLowerCase() : '';
}
function targets() {
  return { center: pageId(process.env.NOTION_CENTER_PAGE), room: pageId(process.env.NOTION_ROOM_PAGE) };
}
function key() {
  const value = process.env.MCP_CREDENTIAL_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('MCP_CREDENTIAL_KEY 必须是 64 位十六进制随机密钥');
  return Buffer.from(value, 'hex');
}
function readState() {
  const secret = key();
  const file = runtimeFile('notion-oauth.enc');
  if (!fs.existsSync(file)) return {};
  const { iv, tag, data } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cipher = crypto.createDecipheriv('aes-256-gcm', secret, Buffer.from(iv, 'hex'));
  cipher.setAuthTag(Buffer.from(tag, 'hex'));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(data, 'base64')), cipher.final()]).toString());
}
function patchState(patch) {
  ensureDataDir();
  const state = { ...readState(), ...patch };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(state)), cipher.final()]);
  const file = runtimeFile('notion-oauth.enc');
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: data.toString('base64') }), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function redirectUrl() {
  const url = new URL(process.env.HEARTBEAT_PUBLIC_URL || '');
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('HEARTBEAT_PUBLIC_URL 必须是服务自己的 HTTPS 地址');
  return new URL('/admin/notion/callback', url.origin).toString();
}
function provider(interactive = false) {
  let authorizationUrl;
  return {
    get authorizationUrl() { return authorizationUrl; },
    get redirectUrl() { return redirectUrl(); },
    get clientMetadata() { return { client_name: 'Heartbeat Notion', redirect_uris: [redirectUrl()], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }; },
    clientInformation: () => readState().client,
    saveClientInformation: client => patchState({ client }),
    tokens: () => readState().tokens,
    saveTokens: tokens => patchState({ tokens: { ...tokens, refresh_token: tokens.refresh_token || readState().tokens?.refresh_token }, authorizedAt: new Date().toISOString() }),
    discoveryState: () => readState().discovery,
    saveDiscoveryState: discovery => patchState({ discovery }),
    state: () => {
      if (!interactive) throw new Error('Notion 需要重新授权，请打开管理页');
      const state = crypto.randomBytes(32).toString('hex');
      patchState({ pending: { state, expires: Date.now() + 10 * 60_000 } });
      return state;
    },
    saveCodeVerifier: verifier => patchState({ verifier }),
    codeVerifier: () => readState().verifier,
    redirectToAuthorization: url => {
      if (!interactive) throw new Error('Notion 未授权或授权已失效');
      authorizationUrl = url.toString();
    },
    invalidateCredentials: scope => {
      const patch = {};
      if (scope === 'all' || scope === 'tokens') patch.tokens = undefined;
      if (scope === 'all' || scope === 'client') patch.client = undefined;
      if (scope === 'all' || scope === 'verifier') patch.verifier = undefined;
      if (scope === 'all' || scope === 'discovery') patch.discovery = undefined;
      patchState(patch);
    }
  };
}
const timedFetch = (url, options = {}) => fetch(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) });
async function beginAuthorization() {
  if (!enabled()) throw new Error('请先启用 NOTION_MCP_ENABLED');
  const p = provider(true);
  // 后台进程有 token 时不重复刷新，避免 refresh token 轮换冲突。
  if (readState().tokens?.access_token) return '/admin/notion';
  await auth(p, { serverUrl: ENDPOINT, fetchFn: timedFetch });
  if (!p.authorizationUrl) throw new Error('未得到 Notion 授权链接');
  return p.authorizationUrl;
}
async function finishAuthorization(code, state) {
  const pending = readState().pending;
  if (!pending || pending.expires < Date.now() || typeof state !== 'string' || state !== pending.state || typeof code !== 'string' || !code) throw new Error('授权回调无效或过期，请重新连接');
  patchState({ pending: undefined });
  await auth(provider(false), { serverUrl: ENDPOINT, authorizationCode: code, fetchFn: timedFetch });
  patchState({ verifier: undefined });
}
function status() {
  if (!enabled()) return { enabled: false, authorized: false, targets: targets() };
  const state = readState();
  return { enabled: true, authorized: Boolean(state.tokens?.access_token), authorizedAt: state.authorizedAt, targets: targets() };
}
function resultText(result) {
  return JSON.stringify(result.structuredContent || result.content || result);
}
function assertSuccess(result) {
  if (result.isError) throw new Error('Notion 工具返回错误，请查看行动记录');
  return result;
}
function extractCreatedIds(result) {
  const data = result.structuredContent;
  const ids = [];
  function scan(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(scan);
    if (value.id || value.url) { const id = pageId(value.id || value.url); if (id) ids.push(id); }
    Object.values(value).forEach(scan);
  }
  scan(data);
  for (const block of result.content || []) {
    if (block.type !== 'text') continue;
    try { scan(JSON.parse(block.text)); } catch {
      for (const match of block.text.matchAll(/https:\/\/(?:www\.)?notion\.(?:so|site)\/[^\s"<>]+/g)) { const id = pageId(match[0]); if (id) ids.push(id); }
    }
  }
  return [...new Set(ids)];
}
async function connectNotion() {
  if (!status().authorized) throw new Error('Notion 尚未授权');
  const client = new Client({ name: 'heartbeat', version: '2.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), { authProvider: provider(false), fetch: timedFetch });
  try {
    await client.connect(transport);
    const tools = [];
    let cursor;
    do { const result = await client.listTools(cursor ? { cursor } : {}); tools.push(...result.tools); cursor = result.nextCursor; } while (cursor);
    const fetchTool = tools.find(t => t.name === 'notion-fetch');
    const createTool = tools.find(t => t.name === 'notion-create-pages');
    if (!fetchTool || !createTool) throw new Error('当前 Notion 连接没有 fetch/create-pages 工具');
    return { client, tools: [fetchTool, createTool], close: () => client.close() };
  } catch (error) { await client.close().catch(() => {}); throw error; }
}

// 只接受管理员列出的根页面和本次调用实际创建的页面，拒绝工作区搜索/任意页面访问。
function validateCall(name, args, allowed) {
  if (name === 'notion-fetch') {
    if (typeof args.id !== 'string' || Object.keys(args).some(k => k !== 'id') || !allowed.has(pageId(args.id))) throw new Error('只能读取配置的页面或本次新建的页面');
    args.id = pageId(args.id);
  } else if (name === 'notion-create-pages') {
    if (Object.keys(args).some(k => !['parent', 'pages'].includes(k))) throw new Error('不支持的创建参数');
    if (!args.parent || typeof args.parent.page_id !== 'string' || Object.keys(args.parent).some(k => k !== 'page_id') || !allowed.has(pageId(args.parent.page_id))) throw new Error('创建位置不在允许范围');
    args.parent.page_id = pageId(args.parent.page_id);
    if (!Array.isArray(args.pages) || args.pages.length !== 1) throw new Error('一次只能创建一篇');
    const page = args.pages[0];
    if (!page || Object.keys(page).some(k => !['properties', 'content'].includes(k)) || typeof page.properties?.title !== 'string' || Object.keys(page.properties).some(k => k !== 'title') || !page.properties.title.trim() || typeof page.content !== 'string' || !page.content.trim() || page.content.length > 20000) throw new Error('创建需要标题和正文（最多 20000 字符）');
    if (/程程\s*[&＆]\s*小D/i.test(JSON.stringify(args))) throw new Error('禁止访问或引用程程 & 小D');
  } else throw new Error('未开放此工具');
}
module.exports = { enabled, targets, pageId, provider, readState, patchState, beginAuthorization, finishAuthorization, status, connectNotion, resultText, assertSuccess, extractCreatedIds, validateCall };
