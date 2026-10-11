import samples from '../../public/featured-reports/index.json' with { type: 'json' };

export const SITE_ORIGIN = 'https://prepsuite.ai';
export const SOCIAL_IMAGE = `${SITE_ORIGIN}/prepsuite-social.png`;
export const HOME_DESCRIPTION = 'Connect tournament players with their Chess.com and Lichess accounts. Combine online and over-the-board games to explore openings and prepare for your next round.';
export type PublicPage = {path:string; title:string; description:string; heading:string; indexable:boolean; slug?:string};
export const publicPages: PublicPage[] = [
  {path:'/', title:'PrepSuite — Chess Opponent Scouting & Preparation', description:HOME_DESCRIPTION, heading:'One move ahead. Before move one.', indexable:true},
  ...samples.map(sample => ({path:`/featured/${sample.slug}`, slug:sample.slug, title:`${sample.name} Scouting Report | PrepSuite`, heading:`${sample.name} scouting report`, description:`Explore ${sample.name}'s sample scouting report: opening repertoires, game results and preparation tools. No sign-in required. Ratings and games reflect the report snapshot.`, indexable:true})),
  {path:'/about', title:'Why PrepSuite | Chess Opponent Preparation', heading:'Why I Made PrepSuite', description:'Learn why chess player Max Ingargiola built PrepSuite to connect tournament identities, online accounts and opponent game histories.', indexable:true},
  {path:'/privacy-policy', title:'Privacy Policy | PrepSuite', heading:'Privacy Policy', description:'Read how SoundSideDesign LLC handles personal information when you use PrepSuite.', indexable:true},
  {path:'/terms-of-service', title:'Terms of Service | PrepSuite', heading:'Terms of Service', description:'Read the terms governing your use of PrepSuite and its chess preparation tools.', indexable:true},
];
export function pageForPath(path:string): PublicPage {
  const normalized = path.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  return publicPages.find(page => page.path === normalized) || {
    path:normalized, title:'PrepSuite Workspace', heading:'PrepSuite', description:'Your private chess preparation workspace.', indexable:false,
  };
}
export function pageUrl(page:PublicPage) {return `${SITE_ORIGIN}${page.path}`;}
export function pageStructuredData(page:PublicPage) {
  if (!page.indexable) return null;
  return {'@context':'https://schema.org','@graph':[
    {'@type':'Organization','@id':`${SITE_ORIGIN}/#organization`,name:'PrepSuite',url:SITE_ORIGIN,logo:`${SITE_ORIGIN}/prepsuite-shield.svg`},
    {'@type':'WebSite','@id':`${SITE_ORIGIN}/#website`,name:'PrepSuite',url:SITE_ORIGIN,publisher:{'@id':`${SITE_ORIGIN}/#organization`}},
    {'@type':'WebPage','@id':`${pageUrl(page)}#page`,url:pageUrl(page),name:page.title,description:page.description,isPartOf:{'@id':`${SITE_ORIGIN}/#website`},primaryImageOfPage:SOCIAL_IMAGE},
  ]};
}

/** Keep client navigation metadata identical to the HTML served to crawlers. Never use private report data. */
export function updatePageMetadata(path:string) {
  const page = pageForPath(path);
  document.title = page.title;
  const setMeta = (key:string, value:string, property=false) => {
    const attr = property ? 'property' : 'name';
    let node = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
    if (!node) {node=document.createElement('meta');node.setAttribute(attr,key);document.head.appendChild(node);}
    node.content=value;
  };
  setMeta('description',page.description);setMeta('robots',page.indexable?'index, follow':'noindex, nofollow');
  for (const [key,value] of Object.entries({'og:type':'website','og:title':page.title,'og:description':page.description,'og:url':pageUrl(page),'og:image':SOCIAL_IMAGE,'og:image:width':'1200','og:image:height':'630','og:image:alt':'PrepSuite: connect tournament players, online accounts and their games.','og:site_name':'PrepSuite'})) setMeta(key,value,true);
  for (const [key,value] of Object.entries({'twitter:card':'summary_large_image','twitter:title':page.title,'twitter:description':page.description,'twitter:image':SOCIAL_IMAGE,'twitter:image:alt':'PrepSuite chess opponent scouting'})) setMeta(key,value);
  let canonical=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical);}
  canonical.href=pageUrl(page);
  let structured=document.getElementById('public-structured-data');
  if(!structured){structured=document.createElement('script');structured.id='public-structured-data';structured.setAttribute('type','application/ld+json');document.head.appendChild(structured);}
  structured.textContent=JSON.stringify(pageStructuredData(page));
}
