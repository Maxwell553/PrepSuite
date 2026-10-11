import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test.beforeEach(async({page})=>{
 await page.route('https://www.googletagmanager.com/**',r=>r.abort());
 await page.route('**/fide-rating-history/**',r=>r.fulfill({json:{history:[{date:'2026-09',classicalRating:2823},{date:'2026-10',classicalRating:2823}]}}));
});
test('report starts with a bounded overview and exposes details through keyboard-accessible sections',async({page})=>{
 await page.goto('/featured/magnus-carlsen');
 const overview=page.getByRole('tabpanel',{name:'Overview',exact:true});
 await expect(overview.getByRole('heading',{name:'Opening snapshot'})).toBeVisible();
 await expect(overview.locator('.prep-summary-columns li')).toHaveCount(3);
 await expect(page.getByRole('heading',{name:'Player Activity'})).toHaveCount(0);
 await page.getByRole('tab',{name:'Overview',exact:true}).focus();await page.keyboard.press('ArrowRight');
 await expect(page.getByRole('tab',{name:'Openings',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('heading',{name:'White repertoire',exact:true})).toBeVisible();
 await page.getByLabel('Opponent plays',{exact:true}).selectOption('black');
 await page.getByLabel('Source',{exact:true}).selectOption('otb');
 await expect(page.getByRole('heading',{name:'Black repertoire',exact:true})).toBeVisible();
 await expect(page.getByRole('tabpanel',{name:'Openings'})).toContainText('537 games · over the board');
 await page.getByRole('tab',{name:'Activity',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Latest published period: 2026-10');
 await expect(page.getByRole('heading',{name:'Clock Pressure'})).not.toBeVisible();
 await page.getByText('Clock pressure & time controls',{exact:true}).click();
 await expect(page.getByRole('heading',{name:'Clock Pressure'})).toBeVisible();
 await page.getByRole('tab',{name:'Overview',exact:true}).click();
 await expect(overview).toBeVisible();await expect(page.getByRole('heading',{name:'Black repertoire',exact:true})).toHaveCount(0);
});
test('PDF export still downloads the report and returns to the selected section',async({page})=>{
 test.setTimeout(90000);
 await page.goto('/featured/magnus-carlsen');
 await page.getByRole('button',{name:'Load games',exact:true}).click();
 await page.getByRole('tab',{name:'Openings',exact:true}).click();
 await page.getByLabel('Opponent plays',{exact:true}).selectOption('black');
 const download=page.waitForEvent('download',{timeout:60000});
 await page.getByRole('button',{name:'PDF',exact:true}).click();
 const file=await download;expect(file.suggestedFilename()).toMatch(/^PrepSuite_Magnus_Carlsen.*\.pdf$/);
 const data=await readFile((await file.path())!);expect(data.subarray(0,4).toString()).toBe('%PDF');expect(data.length).toBeGreaterThan(10000);
 await expect(page.getByRole('tab',{name:'Openings',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('heading',{name:'Black repertoire',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'White repertoire',exact:true})).toHaveCount(0);
});

test('preparation filters persist across tabs and round sheet downloads',async({page})=>{
 await page.goto('/featured/magnus-carlsen');await page.getByRole('button',{name:'Load games',exact:true}).click();
 await page.getByRole('tab',{name:'Preparation',exact:true}).click();
 await page.getByLabel('Prepare as',{exact:true}).selectOption('black');
 await page.getByRole('tabpanel',{name:'Preparation'}).getByLabel('Source',{exact:true}).selectOption('otb');
 await page.getByRole('tab',{name:'Overview',exact:true}).click();
 await page.getByRole('tab',{name:'Preparation',exact:true}).click();
 await expect(page.getByLabel('Prepare as',{exact:true})).toHaveValue('black');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download round sheet'}).click();
 expect((await download).suggestedFilename()).toBe('round-preparation.pdf');
 await page.getByRole('button',{name:'Review supporting games →'}).first().click();
 await expect(page.getByRole('dialog')).toBeVisible();
});
