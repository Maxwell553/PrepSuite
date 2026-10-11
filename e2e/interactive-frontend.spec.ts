import { test, expect } from '@playwright/test';
import {readFileSync} from 'node:fs';
const samples: {name:string;slug:string}[] = JSON.parse(readFileSync(new URL('../public/featured-reports/index.json',import.meta.url),'utf8'));
test.beforeEach(async({page})=>{
 await page.route('https://www.googletagmanager.com/**',r=>r.abort());
 await page.route('**/fide-rating-history/**',r=>r.fulfill({json:[]}));
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{error:'Test service unavailable'}}));
 await page.route('**/*.supabase.co/**',r=>r.fulfill({json:[]}));
});
test('opening animation supports pause, line switching, stepping and restart',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Pause opening animation'}).click();
 await page.getByRole('button',{name:'Queen’s Gambit',exact:true}).click();
 await page.getByRole('button',{name:'Next opening move'}).click();
 await expect(page.getByRole('img',{name:'Queen’s Gambit, after d4',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Show position after 6 half-moves: Nf6'}).click();
 await expect(page.getByRole('img',{name:/Queen’s Gambit, after d4, d5, c4, e6, Nc3, Nf6/})).toBeVisible();
 await page.getByRole('button',{name:'Restart opening animation'}).click();
 await expect(page.getByRole('img',{name:'Queen’s Gambit, starting position'})).toBeVisible();
});
for(const sample of samples) test(`sample route and return: ${sample.name}`,async({page})=>{
 await page.goto('/');await page.getByRole('link',{name:new RegExp(`${sample.name} Explore scouting report`)}).click();
 const report = JSON.parse(readFileSync(new URL(`../public/featured-reports/${sample.slug}-summary.json`,import.meta.url),'utf8'));
 await expect(page.getByRole('heading',{name:report.player.name,exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Back to home'}).click();
 await expect(page.getByRole('heading',{level:1})).toContainText('Before move one.');
});
for(const label of ['About','Privacy','Terms']) test(`footer ${label} and return`,async({page})=>{
 await page.goto('/');await page.locator('footer').getByRole('link',{name:label,exact:true}).click();
 await expect(page.getByRole('heading',{level:1})).toBeVisible();
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await expect(page.getByRole('heading',{level:1})).toContainText('Before move one.');
});
test('game review filters, keyboard dismissal, replay controls and practice work',async({page})=>{
 await page.goto('/featured/magnus-carlsen');await page.getByRole('button',{name:'Load games'}).click();await page.getByRole('tab',{name:'Games & practice',exact:true}).click();
 await page.getByRole('button',{name:'View all games'}).first().click();
 const dialog=page.getByRole('dialog',{name:'Magnus Carlsen games'});
 await dialog.getByPlaceholder('Search opponent or opening...').fill('no-such-opponent-qa');
 await expect(dialog.getByText('0 Games',{exact:true})).toBeVisible();
 await dialog.getByPlaceholder('Search opponent or opening...').fill('');
 await dialog.getByRole('button',{name:'Losses',exact:true}).click();
 await dialog.getByRole('button',{name:/^L /}).first().click();
 const analysis=page.getByRole('dialog',{name:'Game analysis',exact:true});
 await analysis.getByRole('button',{name:'Next game move'}).click();await expect(analysis).toContainText('Move 1 of');
 await analysis.getByRole('button',{name:'Last game move'}).click();await expect(analysis.getByRole('button',{name:'Next game move'})).toBeDisabled();
 await analysis.getByRole('button',{name:'Restart game'}).click();await expect(analysis).toContainText('Starting position');
 await page.keyboard.press('Escape');await expect(analysis).toHaveCount(0);
 await page.getByRole('button',{name:'Practice against Magnus Carlsen'}).click();
 await page.getByRole('button',{name:'You play Black'}).click();await page.getByRole('button',{name:'Start game',exact:true}).click();
 await expect(page.getByText(/Move from recorded repertoire/)).toBeVisible();
 await expect(page.getByText('No moves yet')).toHaveCount(0);
});
test('mobile report and practice board fit without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/featured/magnus-carlsen');
 await page.getByRole('button',{name:'Load games'}).click();await page.getByRole('tab',{name:'Games & practice',exact:true}).click();
 await page.getByRole('button',{name:'Practice against Magnus Carlsen'}).click();await page.getByRole('button',{name:'Start game',exact:true}).click();
 await expect(page.getByRole('button',{name:'Reset',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const board=page.locator('[data-square="a1"]').first();
 await expect(board).toBeVisible();
 const bounds=await board.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);
});
