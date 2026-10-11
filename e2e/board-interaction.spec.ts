import {test,expect} from '@playwright/test';
import {mockBackend} from './helpers/mockBackend';
test.beforeEach(async({page})=>{await mockBackend(page);await page.goto('/featured/magnus-carlsen');await page.getByRole('button',{name:'Load games',exact:true}).click();await page.getByRole('tab',{name:'Games & practice',exact:true}).click();});
test('repertoire supports legal dragging and rejects illegal moves on a themed board',async({page})=>{
 await page.getByText('Explore the repertoire on a board',{exact:true}).click();
 const e2=page.locator('[data-square="e2"]').first(),e4=page.locator('[data-square="e4"]').first();
 await expect(e2).toBeVisible();
 await e2.locator('[data-piece="wP"]').dragTo(e4);
 await expect(page.getByRole('button',{name:'1.e4',exact:true})).toBeVisible();
 await expect(e4.locator('[data-piece="wP"]')).toHaveCount(1);
 await expect(e2).toHaveCSS('background-color','rgb(211, 217, 232)');
 // A pawn cannot move three squares.
 const e7=page.locator('[data-square="e7"]').first();
 await e7.locator('[data-piece="bP"]').dragTo(e4);
 await expect(e7.locator('[data-piece="bP"]')).toHaveCount(1);
 await page.getByRole('button',{name:'Go to start',exact:true}).click();await expect(e2.locator('[data-piece="wP"]')).toHaveCount(1);
});
test('practice color selection and start remain visible and usable above the report',async({page},testInfo)=>{
 await page.getByRole('button',{name:'Practice against Magnus Carlsen'}).click();
 const picker=page.getByRole('dialog',{name:'Choose your color',exact:true});
 await expect(picker).toBeVisible();await expect(page.locator('#root')).toHaveAttribute('inert','');
 await picker.getByRole('button',{name:'You play Black'}).click();await expect(picker.getByRole('button',{name:'You play Black'})).toHaveAttribute('aria-pressed','true');
 await picker.getByRole('button',{name:'You play White'}).click();await expect(picker.getByRole('button',{name:'You play White'})).toHaveAttribute('aria-pressed','true');
 await page.screenshot({path:testInfo.outputPath('practice-picker.png')});
 await picker.getByRole('button',{name:'Start game'}).click();
 const game=page.getByRole('dialog',{name:'Practice vs Magnus Carlsen',exact:true});await expect(game.getByRole('button',{name:'Reset',exact:true})).toBeVisible();
 await game.locator('[data-square="e2"] [data-piece="wP"]').dragTo(game.locator('[data-square="e4"]'));
 await expect(game.getByText(/Move from recorded repertoire/)).toBeVisible();
 await expect(game.getByText('No moves yet')).toHaveCount(0);
 await game.getByRole('button',{name:'Close practice',exact:true}).click();await expect(game).toHaveCount(0);await expect(page.locator('#root')).not.toHaveAttribute('inert','');
});
