import { test, expect } from '@playwright/test';
import {mockBackend,login} from './helpers/mockBackend';
test.beforeEach(async({page})=>mockBackend(page));
test('email sign-in opens workspace, persists across reload, and logs out',async({page})=>{
 await login(page); await page.reload();
 await expect(page.getByRole('button',{name:'Open account settings'})).toBeVisible();
 await page.getByRole('button',{name:'Open account settings'}).click();
 await expect(page.getByRole('heading',{name:'Session',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Log out',exact:true}).click();
 await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();
});
test('workspace navigation and search controls work',async({page})=>{
 await login(page);
 await page.getByRole('button',{name:'Active Report'}).click();
 await expect(page.getByRole('heading',{name:'No Active Report'})).toBeVisible();
 await page.getByRole('button',{name:'Start New Prep'}).click();
 await page.getByRole('button',{name:'Manually link accounts (optional)'}).click();
 await expect(page.getByLabel('Chess.com username')).toBeVisible();
 await page.getByLabel('Chess.com username').fill('test_handle');
 await page.getByRole('switch',{name:'Batch reports'}).click();
 await expect(page.getByPlaceholder('Player name')).toHaveCount(2);
 await page.getByRole('button',{name:/Add player/i}).click();
 await expect(page.getByPlaceholder('Player name')).toHaveCount(3);
 await page.getByRole('button',{name:'History',exact:false}).first().click();
 await expect(page.getByRole('heading',{name:'No reports yet'})).toBeVisible();
 await page.getByRole('button',{name:'Scout a player'}).click();
 await expect(page.getByLabel('Player name',{exact:true})).toBeVisible();
});
test('account deletion can be cancelled without making a delete request',async({page})=>{
 let deletion=false;page.on('request',r=>{if(r.url().includes('/delete-user'))deletion=true;});
 await login(page);await page.getByRole('button',{name:'Open account settings'}).click();
 await page.getByRole('button',{name:'Delete Account',exact:true}).click();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 expect(deletion).toBe(false);await expect(page.getByRole('button',{name:'Log out',exact:true})).toBeVisible();
});
test('bad credentials show an error and preserve the sign-in form',async({page})=>{
 await page.route('**/auth/v1/token**',r=>r.fulfill({status:400,json:{code:'invalid_credentials',msg:'Invalid login credentials'}}));
 await page.goto('/');await page.getByRole('link',{name:'Sign in',exact:true}).click();
 await page.getByLabel('Email',{exact:true}).fill('qa@example.test');await page.getByLabel('Password',{exact:true}).fill('test-only-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Invalid login credentials');
 await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
});
