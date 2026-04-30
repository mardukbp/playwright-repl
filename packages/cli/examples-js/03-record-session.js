// Record and save a smoke test
// App: https://demo.playwright.dev/todomvc/

await page.goto('https://demo.playwright.dev/todomvc/')
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('Buy groceries')
await page.keyboard.press('Enter')
await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('Write tests')
await page.keyboard.press('Enter')
await page.getByRole('listitem').filter({ hasText: 'Buy groceries' }).getByRole('checkbox').check()
await expect(page.getByText('1 item left')).toBeVisible()
await page.getByRole('button', { name: 'Clear completed' }).click()
await expect(page.getByText('Write tests')).toBeVisible()

// Cleanup
await page.evaluate(() => localStorage.clear())
