import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {mockBackend,login} from './helpers/mockBackend';
const report=JSON.parse(readFileSync(new URL('../public/featured-reports/magnus-carlsen-summary.json',import.meta.url),'utf8'));
test.beforeEach(async({page})=>mockBackend(page));
test('guest locked sections are compact cards without hidden interactive content',async({page},testInfo)=>{
 await page.route('**/api/analyze-guest',r=>r.fulfill({contentType:'text/event-stream',body:`event: complete\ndata: ${JSON.stringify({report})}\n\n`}));
 await page.goto('/');await page.getByLabel('Player name',{exact:true}).fill('Magnus Carlsen');await page.getByRole('button',{name:'Scout opponent'}).click();
 await expect(page.getByRole('heading',{name:'Magnus Carlsen',exact:true})).toBeVisible();
 for(const name of ['Openings','Games & practice']){
  await page.getByRole('tab',{name,exact:true}).click();
  const panel=page.getByRole('tabpanel');await expect(panel.getByRole('button',{name:'Sign up for full access'})).toBeVisible();
  expect((await panel.boundingBox())!.height).toBeLessThan(360);
  await expect(panel.locator('select,details,[data-square]')).toHaveCount(0);
 }
 await page.screenshot({path:testInfo.outputPath('compact-guest-card.png')});
});
test('practice board remains mounted and unobscured while Stockfish thinks',async({page},testInfo)=>{
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/practice-move',async r=>{await held;await r.fulfill({json:{move:'e7e5',source:'stockfish'}});});
 await login(page);
 await page.route('**/featured-reports/magnus-carlsen-games-*.json', r=>r.fulfill({json:[{id:'engine-test',source:'chess.com',white:'Other',black:'MagnusCarlsen',result:'1-0',pgn:'[White "Other"]\n[Black "MagnusCarlsen"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0'}]}));
 await page.goto('/featured/magnus-carlsen');await page.getByRole('button',{name:'Load games',exact:true}).click();
 await page.getByRole('tab',{name:'Games & practice',exact:true}).click();await page.getByRole('button',{name:'Practice against Magnus Carlsen'}).click();await page.getByRole('button',{name:'Start game',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Practice vs Magnus Carlsen',exact:true});
 // The fixture contains only 1.e4; 1.a3 must use the held engine endpoint.
 const square=await dialog.locator('[data-square="e8"]').elementHandle();
 await dialog.locator('[data-square="a2"] [data-piece="wP"]').dragTo(dialog.locator('[data-square="a3"]'));
 await expect(dialog.getByRole('status')).toHaveText('Thinking…');
 await expect(dialog.locator('[data-square="a3"] [data-piece="wP"]')).toBeVisible();
 expect(await square!.evaluate(el=>el.isConnected)).toBe(true);
 const king=dialog.locator('[data-square="e8"] [data-piece="bK"]');
 expect(await king.evaluate(el=>{const rect=el.getBoundingClientRect();const top=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return el===top||el.contains(top);})).toBe(true);
 await page.screenshot({path:testInfo.outputPath('visible-board-thinking.png')});
 release();await expect(dialog.getByRole('status')).toHaveText('Your move');await expect(dialog.locator('[data-square="e5"] [data-piece="bP"]')).toBeVisible();expect(await square!.evaluate(el=>el.isConnected)).toBe(true);
});
test('search workspace has a contained particle piece on desktop and mobile',async({page},testInfo)=>{
 await login(page);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  const canvas=page.locator('.prep-search-piece canvas');await expect(canvas).toBeVisible();
  await expect.poll(()=>canvas.evaluate(el=>{const c=el as HTMLCanvasElement;return c.getContext('2d')!.getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0);})).toBe(true);
  const bounds=await canvas.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);
  await page.screenshot({path:testInfo.outputPath(`workspace-${width}.png`)});
 }
});
