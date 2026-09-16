import { expect, type Page, test } from '@playwright/test';

async function shot(page: Page, name: string, info: { outputPath: (p: string) => string }) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
}

test.describe('rhythm', () => {
  test('loads a seeded piece and encodes it in the url', async ({ page }, info) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.hash.startsWith('#p='))).toBe(true);
    await expect(page.getByRole('button', { name: 'play' })).toBeVisible();
    await shot(page, 'load', info);
  });

  test('plays and stops', async ({ page }, info) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'play' }).click();
    await expect(page.getByRole('button', { name: 'stop' })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    await shot(page, 'playing', info);
    await page.getByRole('button', { name: 'stop' }).click();
    await expect(page.getByRole('button', { name: 'play' })).toBeVisible();
  });

  test('opens the root editor and edits a cell', async ({ page }, info) => {
    await page.goto('/');
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('no canvas');
    await canvas.click({ position: { x: box.width * 0.6, y: 8 } });
    await expect(page.getByRole('heading', { name: 'root' })).toBeVisible();
    const before = await page.evaluate(() => location.hash);
    const cell = page.getByRole('gridcell').first();
    await cell.focus();
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await expect.poll(() => page.evaluate(() => location.hash)).not.toBe(before);
    await shot(page, 'root-editor', info);
  });

  test('opens an atom editor from the bottom lane', async ({ page }, info) => {
    await page.goto('/');
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('no canvas');
    await canvas.click({ position: { x: box.width * 0.5, y: box.height - 10 } });
    await expect(page.getByRole('heading', { name: /^atom \d$/ })).toBeVisible();
    await expect(page.getByRole('group', { name: 'beats' })).toBeVisible();
    await shot(page, 'atom-editor', info);
  });

  test('adds a level and shows a new lane', async ({ page }, info) => {
    await page.goto('/');
    const canvas = page.locator('canvas');
    const h1 = (await canvas.boundingBox())?.height ?? 0;
    await page.getByRole('button', { name: 'add level' }).click();
    await expect(page.getByRole('heading', { name: 'root' })).toBeVisible();
    await expect.poll(async () => (await canvas.boundingBox())?.height ?? 0).toBeGreaterThan(h1);
    await shot(page, 'two-levels', info);
  });

  test('restores a piece from its url', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => location.hash.length)).toBeGreaterThan(20);
    const seed = await page.getByLabel('seed').textContent();
    const url = page.url();
    await page.goto('about:blank');
    await page.goto(url);
    await expect(page.getByLabel('seed')).toHaveText(seed ?? '');
  });

  test('shares through the worker and follows the short link', async ({ page, request }) => {
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => location.hash.length)).toBeGreaterThan(20);
    const encoded = await page.evaluate(() => location.hash.slice(3));
    const res = await request.post('/api/share', { data: { p: encoded } });
    expect(res.ok()).toBe(true);
    const { slug } = (await res.json()) as { slug: string };
    expect(slug).toMatch(/^[a-z2-9]{6}$/);
    const follow = await request.get(`/s/${slug}`, { maxRedirects: 0 });
    expect(follow.status()).toBe(302);
    expect(follow.headers()['location']).toContain(`#p=${encoded}`);
    const bad = await request.post('/api/share', { data: { p: 'AAAAAAAAAAAAAAAAAAAA' } });
    expect(bad.status()).toBe(400);
  });

  test('exports midi', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'export' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'midi' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^rhythm-[0-9a-f]+\.mid$/);
  });

  test('exports wav', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'export' }).click();
    const dialog = page.locator('dialog[open]');
    await dialog.getByRole('button', { name: '8', exact: true }).click();
    const download = page.waitForEvent('download', { timeout: 60_000 });
    await dialog.getByRole('button', { name: 'wav' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.wav$/);
    const path = await file.path();
    const { readFileSync } = await import('node:fs');
    const bytes = readFileSync(path);
    expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
    let peak = 0;
    for (let i = 44; i < bytes.length; i += 2)
      peak = Math.max(peak, Math.abs(bytes.readInt16LE(i)));
    expect(peak).toBeGreaterThan(2000);
  });

  test('keyboard shortcuts overlay', async ({ page }, info) => {
    await page.goto('/');
    await page.keyboard.press('?');
    await expect(page.getByRole('heading', { name: 'keys' })).toBeVisible();
    await shot(page, 'keys', info);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'keys' })).toBeHidden();
  });
});
