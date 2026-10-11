import {expect} from '@playwright/test';
const user = {id:'00000000-0000-4000-8000-000000000001',email:'qa@example.test',aud:'authenticated',role:'authenticated',created_at:'2024-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}};
const token = ['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,exp:4102444800,aud:'authenticated'})).toString('base64url'),'test-only-signature'].join('.');
export async function mockBackend(page: import('@playwright/test').Page) {
 await page.route('https://www.googletagmanager.com/**',r=>r.abort());
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{error:'Test service temporarily unavailable'}}));
 // Every Supabase request is intercepted. These tests cannot modify a real account.
 await page.route('**/*.supabase.co/**',async r=>{
  const url=r.request().url();
  if(url.includes('/auth/v1/token')) return r.fulfill({json:{access_token:token,token_type:'bearer',expires_in:3600,refresh_token:'test-only-refresh',user}});
  if(url.includes('/auth/v1/user')) return r.fulfill({json:user});
  if(url.includes('/auth/v1/logout')) return r.fulfill({status:204});
  if(url.includes('/players') && r.request().method() === 'POST') return r.fulfill({json:{id:'qa-player-id'}});
  if(url.includes('/scouting_reports') && r.request().method() === 'POST') return r.fulfill({json:{id:'qa-report-id'}});
  if(url.includes('/profiles')) return r.fulfill({json:{id:user.id,credits:0}});
  return r.fulfill({json:[]});
 });
}
export async function login(page: import('@playwright/test').Page) {
 await page.goto('/');
 await page.getByRole('link',{name:'Sign in',exact:true}).click();
 await page.getByLabel('Email',{exact:true}).fill('qa@example.test');
 await page.getByLabel('Password',{exact:true}).fill('test-only-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('button',{name:'Open account settings'})).toBeVisible();
}
