import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.getByRole('tab', { name: 'Welcome, preview' }).getByRole('button', { name: /Close/ }).click();
    await page.getByRole('button', { name: 'Never' }).click();
});

test('Open Trace from Explorer', async ({ page }) => {
    await page.getByRole('treeitem', { name: '202-bug-hunt' }).locator('a').click();
    await page.getByRole('treeitem', { name: 'cat-kernel' }).locator('a').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Open with Trace Viewer' }).hover();
    await page.getByRole('menuitem', { name: 'Open with Trace Viewer' }).click();
    await expect(page.getByRole('tab', { name: 'cat-kernel' })).toBeVisible();
    await page.getByRole('tab', { name: 'Trace Viewer' }).locator('a').click();
    await expect(page.getByLabel('Opened Traces Section')).toBeVisible();
});

test('Open Trace from Trace Viewer', async ({ page }) => {
    await page.getByRole('tab', { name: 'Trace Viewer' }).locator('a').click();
    await expect(page.getByLabel('Opened Traces Section')).toBeVisible();
    await page.getByLabel('Opened Traces Section').hover();
    await page.getByRole('button', { name: 'Open Trace' }).hover();
    await page.getByRole('button', { name: 'Open Trace' }).click();
    await page.getByRole('option', { name: '202-bug-hunt' }).locator('a').click();
    await page.getByRole('option', { name: 'cat-kernel' }).locator('a').click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'OK' }).click();
    await expect(page.getByRole('tab', { name: 'cat-kernel' })).toBeVisible();
});
