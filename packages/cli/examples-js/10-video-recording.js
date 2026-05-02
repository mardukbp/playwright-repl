// Record a video of adding todos
// App: https://demo.playwright.dev/todomvc/

await page.goto('https://demo.playwright.dev/todomvc/')
await page.evaluate(() => localStorage.clear())
await page.reload()

// Video start (CDP screencast)
const __cdp = await page.context().newCDPSession(page); await __cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 2 }); page.__videoSession = __cdp; page.__videoFrames = []; page.__videoStartTime = Date.now(); __cdp.on('Page.screencastFrame', (params) => { page.__videoFrames.push(params.data); __cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {}); });

await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('Buy groceries')
await page.keyboard.press('Enter')
await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('Write tests')
await page.keyboard.press('Enter')
await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('Deploy to production')
await page.keyboard.press('Enter')

await page.getByRole('listitem').filter({ hasText: 'Buy groceries' }).getByRole('checkbox').check()
await expect(page.getByText('2 items left')).toBeVisible()

await page.getByRole('link', { name: 'Completed' }).click()
await expect(page.getByText('Buy groceries')).toBeVisible()

// Video stop
await page.__videoSession.send('Page.stopScreencast'); 'Video stopped (' + Math.round((Date.now() - page.__videoStartTime) / 1000) + 's, ' + page.__videoFrames.length + ' frames)'

// Cleanup
await page.evaluate(() => localStorage.clear())
