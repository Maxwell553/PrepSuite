/** Rebuild small summaries and paged game payloads from the checked-in report snapshots. */
import fs from 'node:fs';
import path from 'node:path';
import {generateStats,normalizeTargetGames,aggregateOpeningsBySource} from '../src/pipeline/statsAggregator.js';
const directory=path.resolve(import.meta.dirname,'../../public/featured-reports');
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'index.json'),'utf8'));
for(const {slug} of manifest){
 const original=JSON.parse(fs.readFileSync(path.join(directory,`${slug}.json`),'utf8'));
 const {games=[],...summary}=original;
 const aliases=[original.player.name,...Object.values(original.player.platforms||{}),original.player.fideName].filter(Boolean);
 const normalized=normalizeTargetGames(games,aliases,'__target__');
 summary.whiteOpenings=generateStats(normalized,'__target__','white');
 summary.blackDefenses=generateStats(normalized,'__target__','black');
 summary.openingsBySource=aggregateOpeningsBySource(games,aliases);
 summary.gameCount=games.length;
 summary.gameSources=[...new Set(games.map((g:{source:string})=>g.source))];
 summary.gamePages=Math.ceil(games.length/200);
 fs.writeFileSync(path.join(directory,`${slug}-summary.json`),JSON.stringify(summary));
 for(let i=0;i<summary.gamePages;i++)fs.writeFileSync(path.join(directory,`${slug}-games-${i}.json`),JSON.stringify(games.slice(i*200,(i+1)*200)));
}
