import { test, expect, Locator } from '@playwright/test';

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
});

test('Open Trace from Trace Viewer', async ({ page }) => {
    await page.getByRole('tab', { name: 'Trace Viewer' }).locator('a').click();

    // Locate the welcome view button or the open traces view (when trace exists already)
    const index = await waitForFirstLocator([
        page.getByLabel('Opened Traces Section'),
        page.getByRole('button', { name: 'Open Trace' })
    ]);

    if (index === 0) {
        await page.getByLabel('Opened Traces Section').hover();
    }

    await page.getByRole('button', { name: 'Open Trace' }).hover();
    await page.getByRole('button', { name: 'Open Trace' }).click();
    await page.getByRole('option', { name: 'Folder' }).locator('a').click();
    await page.getByRole('option', { name: '202-bug-hunt' }).locator('a').click();
    await page.getByRole('option', { name: 'cat-kernel' }).locator('a').click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'OK' }).click();
    await expect(page.getByRole('tab', { name: 'cat-kernel' })).toBeVisible();
});

export async function waitForFirstLocator(locators: Locator[]): Promise<number> {
    // return the first promise that resolves
    const res = await Promise.race([
        ...locators.map(async (locator, index): Promise<number> => {
            let timedOut = false;
            await locator.waitFor({ state: 'visible' }).catch(() => (timedOut = true));
            return timedOut ? -1 : index;
        })
    ]);

    // None of the locators resolved - throw error
    if (res === -1) {
        throw new Error('TimedOut: locators provided were not visible');
    }
    return res;
}
