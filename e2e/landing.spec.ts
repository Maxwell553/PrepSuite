import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
 await page.route('https://www.googletagmanager.com/**',r=>r.abort());
 await page.route('**/fide-rating-history/**',r=>r.fulfill({json:[]}));
});
test('one hero survives reload without legacy markup',async({page,request})=>{
 const html=await (await request.get('/')).text();
 expect(html).not.toMatch(/Your Opponent.s Secrets|Uncover your opponent/i);
 await page.goto('/');await expect(page.getByRole('heading',{level:1})).toHaveText('One moveahead.Before move one.');
 await page.reload();await expect(page.getByRole('heading',{level:1})).toHaveCount(1);
 await expect(page.getByRole('heading',{level:1})).toContainText('Before move one.');
});
test('username mode sends a username-only guest request and shows failure',async({page})=>{
 let input:any;
 await page.route('**/api/analyze-guest',async route=>{input=route.request().postDataJSON();await route.fulfill({status:429,json:{error:'Guest preview limit reached. Please try again later.'}});});
 await page.goto('/');await page.getByRole('button',{name:'Chess.com',exact:true}).click();
 await page.getByLabel('Username',{exact:true}).fill('test_handle');await page.getByRole('button',{name:'Scout opponent'}).click();
 await expect.poll(()=>input?.chessComUsername).toBe('test_handle');expect(input.name).toBe('test_handle');
 await expect(page.getByText(/Guest preview limit reached/).first()).toBeVisible();
});
test('failed signup never claims an email was sent',async({page})=>{
 await page.route('**/auth/v1/signup**',r=>r.fulfill({status:400,json:{code:'email_address_invalid',msg:'Invalid email address'}}));
 await page.goto('/');await page.getByLabel('Email',{exact:true}).fill('invalid@example.com');await page.getByLabel('Password',{exact:true}).fill('test-password-only');
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 await expect(page.getByRole('alert').first()).toBeVisible();await expect(page.getByRole('heading',{name:'Check your inbox'})).toHaveCount(0);
});
test('sample opens without its game payload, then loads game exploration with a connected preparation plan',async({page})=>{
 const gameRequests:string[]=[];page.on('request',r=>{if(/-games-\d+.json/.test(r.url()))gameRequests.push(r.url());});
 await page.goto('/');await page.getByRole('button',{name:'Open the full sample report'}).click();
 await expect(page.getByRole('button',{name:'Load games'})).toBeVisible();expect(gameRequests).toHaveLength(0);
 await page.getByRole('button',{name:'Load games'}).click();await page.getByRole('tab',{name:'Games & practice',exact:true}).click();
 await expect(page.getByRole('button',{name:'View all games'})).toBeVisible();expect(gameRequests.length).toBeGreaterThan(0);
 await page.getByRole('tab',{name:'Preparation',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Three places to start.'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Download round sheet'})).toBeEnabled();
 await page.getByRole('tab',{name:'Games & practice',exact:true}).click();
 await page.getByRole('button',{name:'View all games'}).click();
 await expect(page.getByRole('dialog',{name:'Magnus Carlsen games'})).toBeVisible();
});
test('mobile landing and search fit the viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.getByRole('heading',{level:1})).toBeVisible();await expect(page.getByRole('button',{name:'Scout opponent'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('reduced-motion preference keeps content visible',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await expect(page.getByRole('heading',{level:1})).toBeVisible();
 await page.getByRole('link',{name:'FAQ',exact:true}).click();await page.getByText('Does a low win rate mean a weak opening?',{exact:true}).click();
 await expect(page.getByText(/Draws, opponent strength, color/)).toBeVisible();
});
