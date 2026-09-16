import { expect, test } from '@playwright/test';

test('loads', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.locator('#app')).toContainText('rhythm');
  await page.screenshot({ path: info.outputPath('load.png'), fullPage: true });
});
