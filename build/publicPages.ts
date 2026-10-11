import fs from 'node:fs';
import path from 'node:path';
import type {Plugin} from 'vite';
import {pageForPath, pageUrl, pageStructuredData, publicPages, SOCIAL_IMAGE, type PublicPage} from '../src/lib/publicPages.ts';

export const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function publicHead(page:PublicPage) {
  const meta=(key:string,value:string,property=false)=>`<meta ${property?'property':'name'}="${key}" content="${escapeHtml(value)}">`;
  return `<title>${escapeHtml(page.title)}</title>\n<link rel="canonical" href="${pageUrl(page)}">\n`+
    meta('description',page.description)+meta('robots',page.indexable?'index, follow':'noindex, nofollow')+
    Object.entries({'og:type':'website','og:title':page.title,'og:description':page.description,'og:url':pageUrl(page),'og:image':SOCIAL_IMAGE,'og:image:width':'1200','og:image:height':'630','og:image:alt':'PrepSuite: connect tournament players, online accounts and their games.','og:site_name':'PrepSuite'}).map(([k,v])=>meta(k,v,true)).join('\n')+
    Object.entries({'twitter:card':'summary_large_image','twitter:title':page.title,'twitter:description':page.description,'twitter:image':SOCIAL_IMAGE,'twitter:image:alt':'PrepSuite chess opponent scouting'}).map(([k,v])=>meta(k,v)).join('\n')+
    `<script id="public-structured-data" type="application/ld+json">${JSON.stringify(pageStructuredData(page)).replace(/</g,'\\u003c')}</script>`;
}
function publicContent(page:PublicPage, root:string) {
  if (!page.indexable) return '<div class="boot-shell" role="status">Loading PrepSuite…</div>';
  let detail='';
  if(page.slug) {
    const summary=JSON.parse(fs.readFileSync(path.join(root,'public/featured-reports',`${page.slug}-summary.json`),'utf8'));
    const openings=[...(summary.whiteOpenings||[]),...(summary.blackDefenses||[])].sort((a,b)=>b.totalGames-a.totalGames).slice(0,3);
    detail=`<p>${Number(summary.gameCount||0).toLocaleString('en-US')} games in this report snapshot${summary.lastUpdated ? ` · ${escapeHtml(summary.lastUpdated.slice(0,10))}`:''}.</p><h2>Opening patterns</h2><ul>${openings.map(o=>`<li>${escapeHtml(o.name)}: ${Number(o.totalGames)} games</li>`).join('')}</ul><p>Explore opening statistics, game review, recorded-line practice, and a preparation plan. Historical results are clues, not engine-confirmed weaknesses.</p>`;
  } else if(page.path==='/') {
    detail='<h2>From a name to a game plan</h2><p>Find a tournament opponent or search by username. Review linked accounts, explore opening results, and practice from their recorded games.</p><h2>Sample scouting reports</h2><ul>'+publicPages.filter(p=>p.slug).map(p=>`<li><a href="${p.path}">${escapeHtml(p.heading)}</a></li>`).join('')+'</ul>';
  } else {
    detail='<p>The full page opens in the interactive app. Enable JavaScript to read the complete text.</p>';
  }
  return `<main class="seo-shell"><a href="/">PrepSuite.ai</a><h1>${escapeHtml(page.heading)}</h1><p>${escapeHtml(page.description)}</p>${detail}<nav aria-label="Public pages"><a href="/about">About</a> · <a href="/privacy-policy">Privacy Policy</a> · <a href="/terms-of-service">Terms of Service</a></nav></main>`;
}
export function renderPublicPage(template:string,page:PublicPage,root:string) {
  return template.replace(/<!--public-head:start-->[\s\S]*?<!--public-head:end-->/,()=>`<!--public-head:start-->${publicHead(page)}<!--public-head:end-->`)
    .replace(/<!--public-content:start-->[\s\S]*?<!--public-content:end-->/,()=>`<!--public-content:start-->${publicContent(page,root)}<!--public-content:end-->`);
}
export function publicPagesPlugin():Plugin {
  let root='', outDir='';
  return {
    name:'public-page-html',
    configResolved(config){root=config.root;outDir=path.resolve(root,config.build.outDir);},
    configurePreviewServer(server){
      server.middlewares.use((request,_response,next)=>{
        const pathname=(request.url || '/').split('?')[0].replace(/\/$/,'') || '/';
        if(pathname!=='/' && (publicPages.some(page=>page.path===pathname) || ['/analysis','/dashboard','/history','/settings'].includes(pathname))){
          request.url=pathname+'/index.html';
        }
        next();
      });
    },
    transformIndexHtml(html,context){return renderPublicPage(html,pageForPath(context.path),root);},
    closeBundle(){
      const template=fs.readFileSync(path.join(outDir,'index.html'),'utf8');
      for(const page of publicPages){
        const destination=path.join(outDir,page.path.slice(1),'index.html');
        fs.mkdirSync(path.dirname(destination),{recursive:true});
        fs.writeFileSync(destination,renderPublicPage(template,page,root));
      }
      // Private routes must not inherit the indexable homepage document on first request.
      for(const route of ['/analysis','/dashboard','/history','/settings']){
        const destination=path.join(outDir,route.slice(1),'index.html');fs.mkdirSync(path.dirname(destination),{recursive:true});
        fs.writeFileSync(destination,renderPublicPage(template,pageForPath(route),root));
      }
      fs.writeFileSync(path.join(outDir,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+publicPages.map(p=>`<url><loc>${pageUrl(p)}</loc></url>`).join('')+'</urlset>');
    },
  };
}
