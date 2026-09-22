const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/contexts/AuthContext.tsx'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const session = { user: { id: 'user-1' }, access_token: 'test', refresh_token: 'test' };

function mount({ cachedRead, liveRead = deferred(), ownerRead } = {}) {
  const state = [];
  const refs = [];
  let index = 0;
  let refIndex = 0;
  let rendered = false;
  let listener;
  let signOutCalls = 0;
  const effects = [];
  const React = {
    createContext: () => ({ Provider: 'provider' }),
    createElement: (_type, props) => props,
    useState: (initial) => {
      const i = index++;
      if (!rendered) state[i] = initial;
      return [state[i], (value) => { state[i] = typeof value === 'function' ? value(state[i]) : value; }];
    },
    useRef: (value) => { const i = refIndex++; return refs[i] ||= { current: value }; },
    useCallback: (fn) => fn,
    useEffect: (fn) => { if (!rendered) effects.push(fn); },
  };
  const storage = {
    getItem: (key) => {
      if (key === 'test-auth') return cachedRead ? cachedRead.promise : Promise.resolve(null);
      if (key === '@aquapin_auth_last_user_id') return ownerRead ? ownerRead.promise : Promise.resolve('user-1');
      return Promise.resolve(null);
    },
    setItem: async () => {},
    getAllKeys: async () => [],
  };
  const modules = {
    react: React,
    '@react-native-async-storage/async-storage': storage,
    'react-native': { Linking: { getInitialURL: async () => null, addEventListener: () => ({ remove() {} }) } },
    '../lib/supabase': {
      supabase: { auth: {
        getSession: () => liveRead.promise,
        onAuthStateChange: (fn) => { listener = fn; return { data: { subscription: { unsubscribe() {} } } }; },
        signOut: async () => { signOutCalls++; },
      } },
      getSupabaseConfigError: () => null,
      isSupabaseConfigured: () => true,
      SUPABASE_AUTH_STORAGE_KEY: 'test-auth',
    },
    '../db': { clearLocalDatabase: async () => {}, LOCAL_DB_STORAGE_PREFIX: '@aquapin_db:' },
    '../db/syncQueue': { clearSyncRuntimeState: async () => {}, getSyncQueueSnapshot: async () => ({ pending: 0 }) },
    '../config': { CONFIG: { auth: {} } },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (id) => {
    assert.ok(id in modules, `Unexpected import: ${id}`);
    return modules[id];
  }, console, setTimeout });
  function render() {
    index = 0; refIndex = 0;
    const result = exports.AuthProvider({ children: null });
    rendered = true;
    return result.value;
  }
  render(); effects.forEach((fn) => fn());
  return { emit: (event, value) => listener(event, value), read: render, liveRead, signOutCalls: () => signOutCalls };
}

test('late startup null cannot replace a successful login', async () => {
  const app = mount();
  await flush();
  app.emit('SIGNED_IN', session);
  await flush();
  assert.equal(app.read().user.id, 'user-1');
  app.liveRead.resolve({ data: { session: null }, error: null });
  await flush();
  assert.equal(app.read().user.id, 'user-1');
});

test('late startup token error cannot sign out a new login', async () => {
  const app = mount();
  await flush();
  app.emit('SIGNED_IN', session);
  await flush();
  app.liveRead.resolve({ data: { session: null }, error: { code: 'invalid_refresh_token' } });
  await flush();
  assert.equal(app.read().user.id, 'user-1');
  assert.equal(app.signOutCalls(), 0);
});

test('late initial event cannot replace a live sign-in', async () => {
  const app = mount();
  app.emit('SIGNED_IN', session);
  await flush();
  app.emit('INITIAL_SESSION', null);
  await flush();
  assert.equal(app.read().user.id, 'user-1');
});

test('sign-out invalidates pending sign-in reconciliation', async () => {
  const ownerRead = deferred();
  const app = mount({ ownerRead });
  app.emit('SIGNED_IN', session);
  app.emit('SIGNED_OUT', null);
  ownerRead.resolve('user-1');
  await flush();
  assert.equal(app.read().user, null);
  assert.equal(app.read().isInitializing, false);
});

test('delayed cached session cannot restore an old user after a new login', async () => {
  const cachedRead = deferred();
  const app = mount({ cachedRead });
  app.emit('SIGNED_IN', session);
  await flush();
  cachedRead.resolve(JSON.stringify({ ...session, user: { id: 'old-user' } }));
  await flush();
  assert.equal(app.read().user.id, 'user-1');
});

test('normal initial session restoration and genuine sign-out still work', async () => {
  const app = mount();
  app.emit('INITIAL_SESSION', session);
  await flush();
  assert.equal(app.read().user.id, 'user-1');
  assert.equal(app.read().isInitializing, false);
  app.emit('SIGNED_OUT', null);
  await flush();
  assert.equal(app.read().user, null);
});
