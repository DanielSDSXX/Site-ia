/**
 * Captura de telas da aplicação em execução.
 * Uso: node scripts/screenshots.mjs [--dark]
 *
 * Requer o servidor rodando em http://localhost:3000 e o seed aplicado.
 * O playwright não é dependência do projeto — instale sob demanda:
 *
 *   npm install --no-save playwright
 *
 * Este script é utilitário de desenvolvimento e não faz parte do build.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = process.env.OUT_DIR ?? '/tmp/shots';
const DARK = process.argv.includes('--dark');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
  deviceScaleFactor: 2,
  locale: 'pt-BR',
});
const page = await context.newPage();

await mkdir(OUT, { recursive: true });

async function shot(name, { full = false } = {}) {
  await page.waitForTimeout(700);
  const path = `${OUT}/${name}${DARK ? '-dark' : ''}.png`;
  await page.screenshot({ path, fullPage: full });
  console.log('✓', path);
}

async function go(url, name, opts) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
  await shot(name, opts);
}

// Landing pública
await go('/', '01-landing', { full: true });

if (DARK) {
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('lm-theme', 'dark');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await shot('01-landing', { full: true });
}

await go('/entrar', '02-login');

// Autenticação
await page.fill('#email', 'demo@legalmind.local');
await page.fill('#password', 'legalmind-demo-2026');
await Promise.all([
  page.waitForURL('**/dashboard', { timeout: 30_000 }),
  page.click('button[type=submit]'),
]);
await shot('03-dashboard', { full: true });

await go('/processos', '04-processos');

// Abre o processo de demonstração
await page.click('table a[href^="/processos/"]');
await page.waitForLoadState('networkidle');
await shot('05-processo-visao-geral', { full: true });

const processUrl = page.url().split('?')[0];
for (const [aba, name] of [
  ['riscos', '06-processo-riscos'],
  ['estrategia', '07-processo-estrategia'],
  ['linha-do-tempo', '08-processo-timeline'],
  ['provas', '09-processo-provas'],
  ['documentos', '10-processo-documentos'],
  ['chat', '11-processo-chat'],
]) {
  await page.goto(`${processUrl}?aba=${aba}`, { waitUntil: 'networkidle' });
  await shot(name, { full: true });
}

// Painel de evidência: abre o PDF na página citada
await page.goto(`${processUrl}?aba=riscos`, { waitUntil: 'networkidle' });
const chip = page.locator('button:has-text("p.")').first();
if (await chip.count()) {
  await chip.click();
  await page.waitForTimeout(3500);
  await shot('12-evidencia-pdf');
  await page.keyboard.press('Escape');
}

// Busca global
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
await page.keyboard.press('Control+K');
await page.waitForTimeout(400);
await page.keyboard.type('Mariana');
await page.waitForTimeout(1200);
await shot('13-busca-global');
await page.keyboard.press('Escape');

await go('/prazos', '14-prazos', { full: true });
await go('/tarefas', '15-tarefas', { full: true });
await go('/inteligencia', '16-inteligencia', { full: true });
await go('/jurisprudencia', '17-jurisprudencia', { full: true });
await go('/relatorios', '18-relatorios', { full: true });
await go('/clientes', '19-clientes', { full: true });
await go('/equipe', '20-equipe', { full: true });
await go('/configuracoes', '21-configuracoes', { full: true });
await go('/admin', '22-admin', { full: true });
await go('/processos/novo', '23-novo-processo', { full: true });

// Responsivo
await page.setViewportSize({ width: 390, height: 844 });
await go('/dashboard', '24-mobile-dashboard', { full: true });

await browser.close();
console.log('\nConcluído.');
