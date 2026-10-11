import { test, expect } from '@playwright/test';
import {mockBackend,login} from './helpers/mockBackend';
import {readFileSync} from 'node:fs';
const report=JSON.parse(readFileSync(new URL('../public/featured-reports/magnus-carlsen-summary.json',import.meta.url),'utf8'));
report.id='qa-pipeline-report';
test.beforeEach(async({page})=>mockBackend(page));
test('streaming fallback completes a signed-in search and saves its report',async({page})=>{
 let persisted=false;
 await page.route('**/api/jobs',r=>r.fulfill({status:501,json:{error:'Jobs disabled'}}));
 await page.route('**/api/analyze',r=>r.fulfill({contentType:'text/event-stream',body:`event: complete\ndata: ${JSON.stringify({report,creditsDeducted:0})}\n\n`}));
 page.on('request',r=>{if(r.url().includes('/scouting_reports')&&r.method()==='POST')persisted=true;});
 await login(page);await page.getByLabel('Player name',{exact:true}).fill('Magnus Carlsen');await page.getByRole('button',{name:'Analyze Opponent',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Magnus Carlsen',exact:true,includeHidden:true})).toBeVisible();
 await expect.poll(()=>persisted).toBe(true);
 await expect(page.getByRole('button',{name:'History 03'})).toBeEnabled();
});
test('failed analysis surfaces the error after navigation to the dashboard',async({page})=>{
 await page.route('**/api/jobs',r=>r.fulfill({status:503,json:{error:'Scouting service is temporarily unavailable.'}}));
 await login(page);await page.getByLabel('Player name',{exact:true}).fill('Test Player');await page.getByRole('button',{name:'Analyze Opponent',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Scouting service is temporarily unavailable.');
 await expect(page.getByRole('button',{name:'Search Opponent 01'})).toBeEnabled();
});
test('durable job polling returns its report without streaming fallback',async({page})=>{
 let polls=0;let streaming=false;
 await page.route('**/api/jobs',r=>r.fulfill({status:202,json:{id:'qa-job'}}));
 await page.route('**/api/jobs/qa-job',r=>r.fulfill({json:++polls===1?{status:'running',progress:{phase:'games',message:'Fetching games'}}:{status:'complete',result:{report,creditsDeducted:0}}}));
 page.on('request',r=>{if(r.url().endsWith('/api/analyze'))streaming=true;});
 await login(page);await page.getByLabel('Player name',{exact:true}).fill('Magnus Carlsen');await page.getByRole('button',{name:'Analyze Opponent',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Magnus Carlsen',exact:true,includeHidden:true})).toBeVisible();await expect.poll(()=>polls).toBeGreaterThanOrEqual(2);
 expect(streaming).toBe(false);
});

test('report chat sends context and recovers from a service error', async ({page}) => {
 await page.route('**/api/jobs',r=>r.fulfill({status:501,json:{error:'Jobs disabled'}}));
 await page.route('**/api/analyze',r=>r.fulfill({contentType:'text/event-stream',body:`event: complete\ndata: ${JSON.stringify({report})}\n\n`}));
 let requests=0;
 await page.route('**/api/chat',async r=>{
  expect(r.request().postDataJSON().report.player.name).toBe('Magnus Carlsen');
  if (++requests === 1) return r.fulfill({status:503,json:{error:'Chat temporarily unavailable'}});
  return r.fulfill({json:{text:'Review the English Opening games before choosing a line.'}});
 });
 await login(page); await page.getByLabel('Player name',{exact:true}).fill('Magnus Carlsen');
 await page.getByRole('button',{name:'Analyze Opponent',exact:true}).click();
 await page.getByRole('tab',{name:'Ask a question',exact:true}).click();
 await page.getByRole('button',{name:'Repertoire Analysis Chat'}).click();
 const input=page.getByPlaceholder('Ask about specific openings, lines, or positions...');
 await input.fill('What should I prepare?'); await page.getByRole('button',{name:'Send repertoire question'}).click();
 await expect(page.getByText(/I encountered an error/)).toBeVisible();
 await input.fill('Which opening should I review?'); await page.getByRole('button',{name:'Send repertoire question'}).click();
 await expect(page.getByText('Review the English Opening games before choosing a line.')).toBeVisible();
 await page.getByRole('button',{name:'Close repertoire chat'}).click();
 await expect(page.getByRole('button',{name:'Repertoire Analysis Chat'})).toBeVisible();
});

test('support assistant responds and its category can be changed', async ({page}) => {
 await page.route('**/api/support-chat',r=>r.fulfill({json:{text:'Use preparation filters to focus your report.'}}));
 await login(page); await page.getByRole('button',{name:'Open support chat'}).click();
 await page.getByRole('button',{name:'Ask a question',exact:true}).click();
 await page.getByPlaceholder('Type your message...').fill('How do I prepare?');
 await page.getByRole('button',{name:'Send support question'}).click();
 await expect(page.getByText('Use preparation filters to focus your report.')).toBeVisible();
 await page.getByRole('button',{name:'Change',exact:true}).click();
 await expect(page.getByRole('button',{name:'Report a bug',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close chat',exact:true}).click();
 await expect(page.getByRole('button',{name:'Open support chat'})).toBeVisible();
});

test('home and account navigation stay locked until generation completes', async ({page}) => {
 let complete=false;
 await page.route('**/api/jobs',r=>r.fulfill({status:202,json:{id:'qa-lock-job'}}));
 await page.route('**/api/jobs/qa-lock-job',r=>r.fulfill({json:complete?{status:'complete',result:{report,creditsDeducted:0}}:{status:'running',progress:{phase:'games',message:'Fetching games'}}}));
 await login(page);await page.getByLabel('Player name',{exact:true}).fill('Magnus Carlsen');await page.getByRole('button',{name:'Analyze Opponent',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Report in progress'})).toBeVisible();
 await expect(page.locator('#root')).toHaveAttribute('inert','');
 await expect(page.getByRole('button',{name:'PrepSuite home',includeHidden:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Open account settings',includeHidden:true})).toBeDisabled();
 await expect(page.getByRole('heading',{name:'Magnus Carlsen',exact:true,includeHidden:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'PrepSuite home',includeHidden:true})).toBeInViewport();
 await expect(page.locator('.prep-generation-overlay')).toHaveCSS('backdrop-filter','blur(3px)');
 await page.keyboard.press('Tab');
 await expect(page.getByRole('dialog',{name:'Report in progress'})).toBeFocused();
 complete=true;
 await expect(page.getByRole('button',{name:'PrepSuite home'})).toBeEnabled();
 await page.getByRole('button',{name:'PrepSuite home'}).click();
 await expect(page.getByRole('heading',{level:1})).toContainText('Before move one.');
});
