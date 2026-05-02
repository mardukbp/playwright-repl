// Record a trace of adding todos
// App: https://demo.playwright.dev/todomvc/

await page.goto('https://demo.playwright.dev/todomvc/')
await page.evaluate(() => localStorage.clear())
await page.reload()

// Tracing start
await page.context().tracing.start({ screenshots: true, snapshots: true })

await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('Buy groceries')
await page.keyboard.press('Enter')
await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('Write tests')
await page.keyboard.press('Enter')

await page.getByRole('listitem').filter({ hasText: 'Buy groceries' }).getByRole('checkbox').check()
await page.getByRole('link', { name: 'Completed' }).click()
await expect(page.getByText('Buy groceries')).toBeVisible()

// Tracing stop
const __os = await import('os'); const __path = await import('path'); const __fs = await import('fs'); const __d = new Date(); const __ts = __d.getFullYear() + '-' + String(__d.getMonth()+1).padStart(2,'0') + '-' + String(__d.getDate()).padStart(2,'0') + 'T' + String(__d.getHours()).padStart(2,'0') + '-' + String(__d.getMinutes()).padStart(2,'0') + '-' + String(__d.getSeconds()).padStart(2,'0'); const __dir = __path.join(__os.homedir(), 'pw-traces'); __fs.mkdirSync(__dir, { recursive: true }); const __tp = __path.join(__dir, 'trace-' + __ts + '.zip'); await page.context().tracing.stop({ path: __tp }); 'Trace saved to ' + __tp

// Cleanup
await page.evaluate(() => localStorage.clear())
