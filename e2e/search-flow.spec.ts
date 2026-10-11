import { test, expect } from '@playwright/test';
import {mockBackend,login} from './helpers/mockBackend';
test.beforeEach(async({page})=>mockBackend(page));
test('invalid empty search does not start analysis',async({page})=>{
 let called=false;page.on('request',r=>{if(r.url().endsWith('/api/jobs'))called=true;});
 await login(page);await page.getByRole('button',{name:'Analyze Opponent',exact:true}).click();
 await expect(page.getByText(/name.*(required|characters)|at least.*characters/i).first()).toBeVisible();expect(called).toBe(false);
});
test('game limit sliders maintain the requested total',async({page})=>{
 await login(page);await page.getByLabel('Total games to analyze').fill('500');
 await expect(page.getByLabel('Online games to analyze')).toHaveValue('250');await expect(page.getByLabel('Over-the-board games to analyze')).toHaveValue('250');
 await page.getByLabel('Online games to analyze').fill('400');await expect(page.getByLabel('Over-the-board games to analyze')).toHaveValue('100');
 await page.getByLabel('Online games to analyze').press('ArrowLeft');
 await expect(page.getByLabel('Online games to analyze')).toHaveValue('350');
 await expect(page.getByLabel('Over-the-board games to analyze')).toHaveValue('150');
 await expect(page.locator('.prep-range-track span').nth(1)).toHaveAttribute('style', 'width: 70%;');
});
test('offline state displays a recoverable connectivity notice',async({page,context})=>{
 await page.goto('/');await context.setOffline(true);await expect(page.getByText(/you appear to be offline/i)).toBeVisible();
 await context.setOffline(false);await expect(page.getByText(/you appear to be offline/i)).toHaveCount(0);
});
