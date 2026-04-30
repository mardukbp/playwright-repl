// Complete a todo and use filters
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
await page.getByRole('listitem').filter({ hasText: 'Buy groceries' }).getByRole('checkbox').check()
await expect(page.getByText('2 items left')).toBeVisible()
await page.getByRole('link', { name: 'Active' }).click()
await expect(page.getByText('Write tests')).toBeVisible()
await expect(page.getByText('Deploy to production')).toBeVisible()
await page.getByRole('link', { name: 'Completed' }).click()
await expect(page.getByText('Buy groceries')).toBeVisible()
await page.getByRole('link', { name: 'All' }).click()
await page.getByRole('button', { name: 'Clear completed' }).click()
await expect(page.getByText('Write tests')).toBeVisible()
await expect(page.getByText('Deploy to production')).toBeVisible()

// Cleanup
await page.evaluate(() => localStorage.clear())
