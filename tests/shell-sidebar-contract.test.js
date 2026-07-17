const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const shellHtmlPath = path.join(repoRoot, 'src/renderer/index.html');
const shellRendererPath = path.join(repoRoot, 'src/renderer/scripts/login.js');
const sidebarCssPath = path.join(repoRoot, 'src/Components/Sidebar/sidebar.css');
const mainProcessPath = path.join(repoRoot, 'src/main/main.js');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('application shell owns one authoritative sidebar toggle and drawer', () => {
  const html = read(shellHtmlPath);

  assert.equal((html.match(/id="sidebarToggle"/g) || []).length, 1);
  assert.equal((html.match(/id="appSidebar"/g) || []).length, 1);
  assert.equal((html.match(/id="sidebarBackdrop"/g) || []).length, 1);
  assert.match(html, /id="appShell"[^>]*data-sidebar-mode="expanded"/);
  assert.match(
    html,
    /id="sidebarToggle"[\s\S]*aria-controls="appSidebar"[\s\S]*aria-expanded="true"/
  );
  assert.match(html, /id="sidebarBackdrop"[\s\S]*hidden/);
});

test('sidebar controller supports expanded, compact, and mobile overlay behavior', () => {
  const renderer = read(shellRendererPath);
  const css = read(sidebarCssPath);
  const mainProcess = read(mainProcessPath);

  assert.match(renderer, /function sidebarViewportMode\(\)/);
  assert.match(renderer, /window\.outerWidth <= 767/);
  assert.match(renderer, /max-width: 960px/);
  assert.match(renderer, /max-width: 1199px/);
  assert.match(renderer, /sessionStorage\.getItem\('enterprisePos\.sidebarMode'\)/);
  assert.match(renderer, /sessionStorage\.setItem\('enterprisePos\.sidebarMode', nextMode\)/);
  assert.match(renderer, /appShell\.dataset\.sidebarMode = mode/);
  assert.match(renderer, /appShell\.dataset\.sidebarOpen = open \? 'true' : 'false'/);
  assert.match(
    renderer,
    /appSidebar\.classList\.toggle\('epos-sidebar-rail', mode === 'compact'\)/
  );
  assert.match(css, /\.epos-app-shell\s*{[\s\S]*--epos-shell-sidebar-width:\s*232px;/);
  assert.match(css, /\.epos-app-shell\[data-sidebar-mode="compact"\] \.epos-app-sidebar/);
  assert.match(
    css,
    /\.epos-app-shell\[data-sidebar-mode="mobile"\] \.epos-app-sidebar\s*{[\s\S]*position:\s*fixed;[\s\S]*transform:\s*translateX\(-105%\)/
  );
  assert.match(
    css,
    /\.epos-app-shell\[data-sidebar-mode="mobile"\]\[data-sidebar-open="true"\] \.epos-app-sidebar\s*{[\s\S]*transform:\s*translateX\(0\)/
  );
  assert.match(
    css,
    /@media \(max-width: 960px\)[\s\S]*\.epos-app-sidebar\s*{[\s\S]*position:\s*fixed;[\s\S]*transform:\s*translateX\(-105%\)/
  );
  assert.match(
    css,
    /\.epos-app-shell\[data-sidebar-open="true"\] \.epos-app-sidebar\s*{[\s\S]*transform:\s*translateX\(0\)/
  );
  assert.match(mainProcess, /minWidth:\s*390/);
});

test('mobile drawer has backdrop, Escape close, and navigation close behavior', () => {
  const renderer = read(shellRendererPath);

  assert.match(renderer, /sidebarBackdrop\?\.addEventListener\('click'/);
  assert.match(
    renderer,
    /document\.addEventListener\('keydown', \(e\) => \{[\s\S]*e\.key !== 'Escape'/
  );
  assert.match(renderer, /sidebarToggle\?\.focus\(\)/);
  assert.match(renderer, /applySidebarState\(\{ closeMobile: true \}\)/);
  assert.match(renderer, /navigateTo\(link\.dataset\.route\)/);
  assert.match(renderer, /appSidebar\.toggleAttribute\('inert', mobile && !open\)/);
  assert.match(renderer, /sidebarBackdrop\.hidden = !open/);
});

test('compact navigation keeps icons visible and labels accessible', () => {
  const renderer = read(shellRendererPath);
  const css = read(sidebarCssPath);

  assert.match(renderer, /link\.setAttribute\('aria-label', label\)/);
  assert.match(renderer, /link\.title = label/);
  assert.match(
    css,
    /\.epos-app-shell\[data-sidebar-mode="compact"\] \.epos-sidebar-label\s*{[\s\S]*clip-path:\s*inset\(50%\)/
  );
  assert.match(
    css,
    /\.epos-app-shell\[data-sidebar-mode="compact"\] \.epos-sidebar-icon\s*{[\s\S]*width:\s*30px;[\s\S]*height:\s*30px;/
  );
  assert.match(css, /\.epos-sidebar-item-active/);
});

test('shell layout gives recovered width to module content without transforms', () => {
  const html = read(shellHtmlPath);
  const css = read(sidebarCssPath);

  assert.match(html, /class="epos-app-content min-w-0 flex-1 flex flex-col overflow-hidden"/);
  assert.match(css, /\.epos-app-content\s*{[\s\S]*min-width:\s*0;[\s\S]*width:\s*100%;/);
  assert.doesNotMatch(css, /\.epos-app-content[\s\S]*scale\(/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('sidebar implementation remains shared and not duplicated into modules', () => {
  const moduleFiles = [
    'src/main/features/dashboard/index.html',
    'src/main/features/billing/index.html',
    'src/main/features/products/index.html',
    'src/main/features/inventory/index.html',
    'src/main/features/purchases/index.html',
    'src/main/features/suppliers/index.html',
    'src/main/features/customers/index.html',
    'src/main/features/settings/index.html',
  ];

  for (const relativePath of moduleFiles) {
    const content = read(path.join(repoRoot, relativePath));
    assert.doesNotMatch(content, /sidebarToggle|appSidebar|sidebarBackdrop|epos-app-sidebar/);
  }
});
