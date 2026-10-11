import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {pageForPath,publicPages,updatePageMetadata,SOCIAL_IMAGE} from '../publicPages';
import {renderPublicPage} from '../../../build/publicPages';

describe('public route metadata',()=>{
  it('serves distinct sample HTML with real links and no private workspace data',()=>{
    const template=readFileSync('index.html','utf8');
    for(const page of publicPages){
      const html=renderPublicPage(template,page,process.cwd());
      expect(html).toContain(`<title>${page.title.replace(/&/g,'&amp;')}</title>`);
      expect(html).toContain(`href="https://prepsuite.ai${page.path}"`);
      expect(html).toContain('<h1>');expect(html).toContain(SOCIAL_IMAGE);
      expect(html).not.toContain('NewLogo.jpg');
    }
    const magnus=renderPublicPage(template,pageForPath('/featured/magnus-carlsen'),process.cwd());
    expect(magnus).toContain('2,288 games');expect(magnus).toContain('Sicilian');
    const home=renderPublicPage(template,pageForPath('/'),process.cwd());
    expect(home).toContain('href="/featured/magnus-carlsen"');
  });
  it('resets metadata and canonical on client navigation',()=>{
    document.head.innerHTML='';
    updatePageMetadata('/featured/magnus-carlsen/');
    expect(document.title).toContain('Magnus Carlsen');
    expect(document.querySelector('link[rel=canonical]')?.getAttribute('href')).toBe('https://prepsuite.ai/featured/magnus-carlsen');
    updatePageMetadata('/history');expect(document.querySelector('meta[name=robots]')?.getAttribute('content')).toBe('noindex, nofollow');
    updatePageMetadata('/');expect(document.title).not.toContain('Magnus');
    expect(document.querySelectorAll('link[rel=canonical]')).toHaveLength(1);
    expect(document.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
  });
});
