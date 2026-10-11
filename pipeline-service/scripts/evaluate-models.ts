/** Explicit live evaluation: uses Vertex credentials and billable model calls. Never runs during CI. */
import '../src/lib/environment.js';
import {readFileSync} from 'node:fs';
import {getAccessToken,getVertexUrl} from '../src/lib/vertexAuth.js';
import {models} from '../src/lib/models.js';
const cases=JSON.parse(readFileSync(new URL('../evals/preparation-cases.json',import.meta.url),'utf8'));
const candidates=process.argv.slice(2);if(!candidates.length)candidates.push(models.analysis,models.support);
let failures=0;
for(const model of [...new Set(candidates)])for(const sample of cases){
 const started=Date.now();
 const response=await fetch(getVertexUrl(model),{method:'POST',headers:{Authorization:`Bearer ${await getAccessToken()}`,'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:`Using ONLY these facts: ${JSON.stringify(sample.facts)}, return JSON {score:number|null,evidence:"insufficient"|"historical"}. Score is (wins + draws/2)/games, null if no games. Under 20 games is insufficient. Never infer engine weakness or identity. No markdown.`}]}],generationConfig:{temperature:0,maxOutputTokens:200,responseMimeType:'application/json'}}),signal:AbortSignal.timeout(45000)});
 const data=await response.json();let actual;
 try{actual=JSON.parse(data.candidates?.[0]?.content?.parts?.filter((p:{thought?:boolean})=>!p.thought).map((p:{text?:string})=>p.text||'').join('')||'');}catch{actual=null;}
 const passed=response.ok&&actual?.score===sample.expected.score&&actual?.evidence===sample.expected.evidence;
 if(!passed)failures++;
 console.log(JSON.stringify({case:sample.id,model,passed,actual,expected:sample.expected,durationMs:Date.now()-started,usage:data.usageMetadata,status:response.status}));
}
process.exitCode=failures?1:0;
