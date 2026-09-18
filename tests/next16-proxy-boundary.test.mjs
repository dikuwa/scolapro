import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = path => existsSync(new URL(`../${path}`, import.meta.url));

const proxy = read('src/proxy.ts');
const sessionProxy = read('src/lib/supabase/proxy.ts');

// Compile the declared matcher the way the request boundary applies it: the
// whole pathname must match, with an optional trailing slash.
const matcherBlock = proxy.match(/matcher:\s*\[([\s\S]*?)\]/)?.[1];
assert.ok(matcherBlock, 'src/proxy.ts must declare a matcher array');
// The matcher is documented with line comments that may themselves contain
// quoted text (for example crossorigin="use-credentials"). Strip comments
// before reading the declaration so documentation cannot be mistaken for the
// pattern, and require the literal to start with "/" as a second guard.
const matcherDeclarations = matcherBlock.replace(/^\s*\/\/.*$/gm, '');
const matcherLiteral = matcherDeclarations.match(/"(\/[^"]*)"/)?.[1];
assert.ok(matcherLiteral, 'src/proxy.ts must declare a single string matcher');
// The matcher is declared as a TypeScript string literal, so its escapes have
// to be decoded before the pattern is compiled.
const matcherSource = JSON.parse(`"${matcherLiteral}"`);
const handledByProxy = pathname => new RegExp(`^${matcherSource}/?$`).test(pathname);
// Guard against a silently useless pattern: if the compiled matcher rejected
// every pathname the exclusion tests would pass for the wrong reason.
assert.equal(handledByProxy('/'), true, 'the compiled matcher must be functional');

function apiRoutePaths() {
  const found = [];
  const walk = (dir, segments) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        // Route groups do not appear in the URL path.
        if (entry.name.startsWith('(') && entry.name.endsWith(')')) continue;
        walk(new URL(`${entry.name}/`, dir), [...segments, entry.name]);
      } else if (entry.name === 'route.ts') {
        found.push(`/api/${segments.join('/')}`);
      }
    }
  };
  walk(new URL('../src/app/api/', import.meta.url), []);
  return found.sort();
}

test('the proxy lives next to the app directory and no root proxy remains', () => {
  assert.equal(exists('src/proxy.ts'), true, 'src/proxy.ts must exist for the src/app layout');
  assert.equal(exists('proxy.ts'), false, 'a root proxy.ts would be dead code and must be removed');
});

test('updateSession is still invoked and the login redirect contract is preserved', () => {
  assert.match(proxy, /import \{ updateSession \} from "@\/lib\/supabase\/proxy"/);
  assert.match(proxy, /return updateSession\(request\)/);
  assert.match(sessionProxy, /loginUrl\.searchParams\.set\("next"/);
  assert.match(sessionProxy, /loginUrl\.pathname = "\/login"/);
  assert.match(sessionProxy, /PUBLIC_PATHS = new Set\(\["\/login", "\/join"\]\)/);
  assert.match(sessionProxy, /supabase\.auth\.getClaims\(\)/);
});

test('the matcher excludes /api so secret-authenticated routes are never redirected', () => {
  assert.match(matcherSource, /\(\?!api\//, 'the matcher must exclude the /api prefix');
  assert.equal(handledByProxy('/api/health'), false);
  assert.equal(handledByProxy('/api/internal/report-card-render'), false);
  assert.equal(handledByProxy('/api/webhooks/resend/email'), false);
});

test('no discovered API route is redirected by the proxy matcher contract', () => {
  const routes = apiRoutePaths();
  assert.ok(routes.length > 0, 'expected to discover API routes');
  for (const route of routes) {
    assert.equal(handledByProxy(route), false, `${route} must not be handled by the proxy`);
  }
  // Guard the contracts that matter most, so a route move cannot silently
  // drop out of this check.
  for (const required of [
    '/api/health',
    '/api/internal/report-card-render',
    '/api/internal/communications-delivery',
    '/api/internal/communications-receipts',
    '/api/webhooks/resend/email',
    '/api/webhooks/bird/sms',
    '/api/webhooks/bird/whatsapp',
  ]) {
    assert.ok(routes.includes(required), `${required} must still exist and stay out of the proxy`);
  }
});

test('protected pages are still matched by the proxy', () => {
  for (const pathname of ['/', '/learners', '/attendance', '/school/absence-reviews', '/teaching', '/platform/tenants']) {
    assert.equal(handledByProxy(pathname), true, `${pathname} must be handled by the proxy`);
  }
  // The proxy also has to run on public paths: it redirects an authenticated
  // user away from /login.
  assert.equal(handledByProxy('/login'), true);
  assert.equal(handledByProxy('/join'), true);
});

test('Next internals and static assets stay excluded', () => {
  for (const pathname of [
    '/_next/static/chunks/main.js',
    '/_next/image',
    '/favicon.ico',
    '/brand/scolapro/logo-blue.svg',
    '/icon.png',
    '/photo.jpg',
    '/photo.jpeg',
    '/anim.gif',
    '/shot.webp',
  ]) {
    assert.equal(handledByProxy(pathname), false, `${pathname} must stay outside the proxy`);
  }
});

test('the PWA manifest stays outside the proxy because it is fetched without credentials', () => {
  // The document links the manifest without crossorigin="use-credentials", so a
  // browser omits credentials when fetching it. Gating it would redirect the
  // manifest to /login and break installability.
  assert.equal(handledByProxy('/manifest.webmanifest'), false);
  assert.match(proxy, /manifest\\\\\.webmanifest/, 'the matcher must exclude the manifest explicitly');
});

test('the proxy relocation carries no database, RLS or service-role surface', () => {
  for (const [name, text] of [['src/proxy.ts', proxy], ['src/lib/supabase/proxy.ts', sessionProxy]]) {
    assert.doesNotMatch(text, /lib\/supabase\/admin|SERVICE_ROLE/, `${name} must not use a service-role client`);
    assert.doesNotMatch(text, /create policy|drop policy|alter table|security definer/i, `${name} must not carry schema or policy changes`);
  }
});
