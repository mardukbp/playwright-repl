// Replay demo — add todos, complete them, verify count
// App: https://demo.playwright.dev/todomvc/

await page.goto('https://demo.playwright.dev/todomvc/')
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('Buy groceries')
await page.keyboard.press('Enter')
await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('Write tests')
await page.keyboard.press('Enter')
await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('Deploy to production')
await page.keyboard.press('Enter')
await expect(page.getByText('3 items left')).toBeVisible()
await page.getByRole('listitem').filter({ hasText: 'Buy groceries' }).getByRole('checkbox').check()
await expect(page.getByText('2 items left')).toBeVisible()
await page.getByRole('listitem').filter({ hasText: 'Write tests' }).getByRole('checkbox').check()
await expect(page.getByText('1 item left')).toBeVisible()

// Cleanup
await page.evaluate(() => localStorage.clear())
