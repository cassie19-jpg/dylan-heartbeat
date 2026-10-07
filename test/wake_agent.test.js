const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const notion = require('../notion_mcp');
const { runAgent } = require('../wake_agent');
const { selectPushText } = require('../wake_up');
const { parseChatCompletionResponse } = require('../upstream_response');
const root = '11111111111111111111111111111111';
const child = '22222222222222222222222222222222';
process.env.NOTION_ROOM_PAGE = root;
process.env.NOTION_CENTER_PAGE = '';
const fetchCall = { id: 'call1', type: 'function', function: { name: 'notion_0', arguments: JSON.stringify({ id: root }) } };
const createCall = { id: 'call2', type: 'function', function: { name: 'notion_1', arguments: JSON.stringify({ parent: { page_id: root }, pages: [{ properties: { title: '小屋日记' }, content: '今天写了一小段文字。' }] }) } };
const answer = message => ({ choices: [{ message: { role: 'assistant', ...message } }] });
function mockSession({ failCreate = false, verify = true } = {}) {
  const calls = [];
  let closed = false;
  return {
    calls,
    get closed() { return closed; },
    tools: ['notion-fetch', 'notion-create-pages'].map(name => ({ name, description: name, inputSchema: { type: 'object' } })),
    client: { callTool: async call => {
      calls.push(call);
      if (call.name === 'notion-create-pages') {
        if (failCreate) throw new Error('timeout');
        return { content: [{ type: 'text', text: JSON.stringify({ pages: [{ id: child, url: `https://www.notion.so/${child}` }] }) }] };
      }
      return { content: [{ type: 'text', text: call.arguments.id === child && verify ? '今天写了一小段文字。' : '页面内容' }] };
    } },
    close: async () => { closed = true; }
  };
}
test('读取→创建→系统读回核验→静默，assistant/tool 历史完整', async () => {
  const session = mockSession();
  const logs = [];
  let step = 0;
  const result = await runAgent({ body: { messages: [] }, connect: async () => session, log: e => logs.push(e), request: async body => {
    step++;
    if (step === 1) return answer({ tool_calls: [fetchCall] });
    if (step === 2) {
      assert.equal(body.messages.at(-1).role, 'tool');
      return answer({ reasoning_content: '继续写作', tool_calls: [createCall] });
    }
    assert.equal(JSON.parse(body.messages.at(-1).content).verification, 'verified');
    assert.equal(body.messages.at(-2).reasoning_content, '继续写作');
    return answer({ content: '[NO_ACTION]' });
  } });
  assert.equal(result.choices[0].message.content, '[NO_ACTION]');
  assert.equal(session.calls.length, 3);
  assert(session.closed);
  assert(logs.some(e => e.verification === 'verified'));
});
test('创建超时后禁用工具，避免再次创建', async () => {
  const session = mockSession({ failCreate: true });
  let step = 0;
  await runAgent({ body: { messages: [] }, connect: async () => session, log: () => {}, request: async body => {
    step++;
    if (step === 1) return answer({ tool_calls: [fetchCall] });
    if (step === 2) return answer({ tool_calls: [createCall] });
    assert.equal(body.tool_choice, 'none');
    assert.equal(JSON.parse(body.messages.at(-1).content).verification, 'unknown');
    return answer({ content: '[NO_ACTION]' });
  } });
  assert.equal(session.calls.filter(c => c.name === 'notion-create-pages').length, 1);
});
test('创建返回成功但正文未核验，准确记录 unverified', async () => {
  const session = mockSession({ verify: false });
  let step = 0;
  await runAgent({ body: { messages: [] }, connect: async () => session, log: () => {}, request: async body => {
    if (++step === 1) return answer({ tool_calls: [fetchCall] });
    if (step === 2) return answer({ tool_calls: [createCall] });
    assert.equal(body.tool_choice, 'none');
    assert.equal(JSON.parse(body.messages.at(-1).content).verification, 'unverified');
    return answer({ content: '[NO_ACTION]' });
  } });
});
test('访问范围和创建位置校验，拒绝无父页面、模板和批量创建', () => {
  const allowed = new Set([root]);
  assert.throws(() => notion.validateCall('notion-fetch', { id: child }, allowed));
  assert.throws(() => notion.validateCall('notion-search', {}, allowed));
  assert.throws(() => notion.validateCall('notion-create-pages', { pages: [] }, allowed));
  const args = JSON.parse(createCall.function.arguments);
  assert.doesNotThrow(() => notion.validateCall('notion-create-pages', args, allowed));
  assert.throws(() => notion.validateCall('notion-create-pages', { ...args, pages: [args.pages[0], args.pages[0]] }, allowed));
  assert.throws(() => notion.validateCall('notion-create-pages', { ...args, pages: [{ ...args.pages[0], template: { page_id: child } }] }, allowed));
});
test('自主行动只推送显式 BARK 块，旧模式保持原行为', () => {
  assert.match(selectPushText('已写好日记', true), /^\[NO_ACTION\]/);
  assert.match(selectPushText('[BARK][/BARK]', true), /^\[NO_ACTION\]/);
  assert.equal(selectPushText('总结\n[BARK]想你了[/BARK]', true), '[BARK]想你了[/BARK]');
  assert.equal(selectPushText('想你了', false), '想你了');
});
test('SSE 工具参数分片正确拼接，并保留 reasoning_content', () => {
  const text = [
    { choices: [{ delta: { reasoning_content: '想', tool_calls: [{ index: 0, id: 'call1', function: { name: 'notion_0', arguments: '{"id":' } }] } }] },
    { choices: [{ delta: { reasoning_content: '一下', tool_calls: [{ index: 0, function: { arguments: '"abc"}' } }] } }] },
    { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
  ].map(p => 'data: ' + JSON.stringify(p)).join('\n');
  const message = parseChatCompletionResponse(text).choices[0].message;
  assert.equal(message.reasoning_content, '想一下');
  assert.equal(message.tool_calls[0].function.arguments, '{"id":"abc"}');
});
test('授权持久化加密，重启可读，回调拒绝错误 state 和重放', async () => {
  const oldData = process.env.DATA_DIR;
  const oldKey = process.env.MCP_CREDENTIAL_KEY;
  const oldUrl = process.env.HEARTBEAT_PUBLIC_URL;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-oauth-'));
  process.env.DATA_DIR = dir;
  process.env.MCP_CREDENTIAL_KEY = 'ab'.repeat(32);
  process.env.HEARTBEAT_PUBLIC_URL = 'https://heartbeat.example';
  try {
    const p = notion.provider(true);
    await p.saveTokens({ access_token: 'secret-access', refresh_token: 'secret-refresh', token_type: 'Bearer' });
    await p.saveTokens({ access_token: 'new-access', token_type: 'Bearer' });
    assert.equal(notion.provider().tokens().refresh_token, 'secret-refresh');
    const bytes = fs.readFileSync(path.join(dir, 'notion-oauth.enc'), 'utf8');
    assert(!bytes.includes('secret-refresh'));
    assert.equal(fs.statSync(path.join(dir, 'notion-oauth.enc')).mode & 0o777, 0o600);
    const state = p.state();
    await assert.rejects(notion.finishAuthorization('code', 'wrong'));
    assert.equal(notion.readState().pending.state, state);
    notion.patchState({ pending: { state, expires: 0 } });
    await assert.rejects(notion.finishAuthorization('code', state));
    notion.patchState({ pending: undefined });
    await assert.rejects(notion.finishAuthorization('code', state));
    process.env.MCP_CREDENTIAL_KEY = 'cd'.repeat(32);
    assert.throws(() => notion.readState());
  } finally {
    for (const [name, value] of [['DATA_DIR', oldData], ['MCP_CREDENTIAL_KEY', oldKey], ['HEARTBEAT_PUBLIC_URL', oldUrl]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('长页面工具结果保留完整 JSON，并明确标记节选', () => {
  const { boundedToolOutput } = require('../wake_agent');
  const output = { result: { content: [{ type: 'text', text: '长'.repeat(50000) }] }, verification: 'not_applicable' };
  const bounded = boundedToolOutput(output);
  const parsed = JSON.parse(bounded.content);
  assert.equal(parsed.truncated, true);
  assert.equal(parsed.result_excerpt.length, 6000);
  assert(bounded.content.length < 8000);
  assert.equal(parsed.verification, 'not_applicable');
});

test('GLM 5.3 后台使用轻量推理，截断明确报错且关闭会话', async () => {
  const session = mockSession();
  await assert.rejects(runAgent({ body: { model: 'glm-5.3', messages: [] }, connect: async () => session, log: () => {}, request: async body => {
    assert.equal(body.reasoning_effort, 'low');
    assert.equal(body.thinking.type, 'enabled');
    assert.equal(body.max_tokens, 8192);
    return { choices: [{ finish_reason: 'length', message: { role: 'assistant', content: '' } }] };
  } }), /token 上限/);
  assert(session.closed);
});
