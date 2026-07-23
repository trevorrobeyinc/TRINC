var O=Object.defineProperty;var I=Object.getOwnPropertyDescriptor;var K=Object.getOwnPropertyNames;var G=Object.prototype.hasOwnProperty;var _=(p,e)=>{for(var t in e)O(p,t,{get:e[t],enumerable:!0})},H=(p,e,t,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let s of K(e))!G.call(p,s)&&s!==t&&O(p,s,{get:()=>e[s],enumerable:!(n=I(e,s))||n.enumerable});return p};var z=p=>H(O({},"__esModule",{value:!0}),p);var ee={};_(ee,{default:()=>Z});module.exports=z(ee);var w=require("obsidian");var R={llmProvider:"openai",llmBaseUrl:"https://models.brevilabs.com/v1",llmModelName:"copilot-plus-flash",llmApiKey:"",llmTemperature:.7,llmMaxTokens:2048,miyoBaseUrl:"https://127.0.0.1:8743",qdrantBaseUrl:"https://127.0.0.1:6433",qdrantCollection:"miyo",enableOrphanScan:!0,enableHealthDigest:!0,enableSerendipityDigest:!0,reportsFolder:"Zettelkasten/Reports"};var M=class{constructor(e){this.app=e;this.cachedFiles=null;this.cacheTimestamp=0}async listFiles(){if(this.cachedFiles&&Date.now()-this.cacheTimestamp<6e4)return this.cachedFiles;let e=this.app.vault.getMarkdownFiles().map(t=>t.path).sort();return this.cachedFiles=e,this.cacheTimestamp=Date.now(),e}async readFile(e){let t=this.app.vault.getAbstractFileByPath(e);if(!t||!("extension"in t))throw new Error(`File not found: ${e}`);return this.app.vault.read(t)}async stat(e){let t=await this.app.vault.adapter.stat(e);if(!t)throw new Error(`Cannot stat: ${e}`);return{mtime:new Date(t.mtime),size:t.size}}extractWikilinks(e){let t=[],n=/\[\[([^\]]+)\]\]/g,s;for(;(s=n.exec(e))!==null;){let a=s[1],i=a.indexOf("|");i!==-1&&(a=a.slice(0,i));let o=a.indexOf("#");o!==-1&&(a=a.slice(0,o)),a=a.trim(),a&&t.push(a)}return t}invalidateCache(){this.cachedFiles=null,this.cacheTimestamp=0}};var P=require("obsidian"),x=class{constructor(e="https://127.0.0.1:8743"){this.baseUrl=e}updateBaseUrl(e){this.baseUrl=e}async isHealthy(){try{return(await(0,P.requestUrl)({url:`${this.baseUrl}/v0/health`,method:"GET"})).status===200}catch{return!1}}async search(e,t,n=5){try{let s=await(0,P.requestUrl)({url:`${this.baseUrl}/v0/search`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:e,vault:t,limit:n})});if(s.status!==200)return[];let a=s.json;return Array.isArray(a?.results)?a.results:[]}catch{return[]}}async searchRelated(e,t,n=10){try{let s=await(0,P.requestUrl)({url:`${this.baseUrl}/v0/search/related`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({file_path:e,vault:t,limit:n})});if(s.status!==200)return[];let a=s.json;return Array.isArray(a?.results)?a.results:[]}catch{return[]}}};var V=require("obsidian"),$=class{constructor(e="https://127.0.0.1:6433",t="miyo"){this.baseUrl=e;this.collection=t}updateConfig(e,t){this.baseUrl=e,this.collection=t}async getChunksForFile(e){try{let t=await(0,V.requestUrl)({url:`${this.baseUrl}/collections/${this.collection}/points/scroll`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({filter:{must:[{key:"file_path",match:{value:e}}]},limit:100,with_payload:!0,with_vector:!1})});return t.status!==200?[]:(t.json.result?.points??[]).sort((a,i)=>(a.payload?.chunk_index??0)-(i.payload?.chunk_index??0)).map(a=>a.payload?.chunk_text??"").filter(Boolean)}catch{return[]}}};var L=require("obsidian"),k=class{async generateText(e){return this.generateOpenAI(e)}static fromSettings(e){return{key:`${e.llmProvider}|${e.llmModelName}`,name:e.llmModelName,provider:e.llmProvider,baseUrl:e.llmBaseUrl,apiKey:e.llmApiKey||j()||void 0,temperature:e.llmTemperature,maxTokens:e.llmMaxTokens}}async generateOpenAI(e){let t=this.getOpenAIEndpoint(e.model),n={"Content-Type":"application/json"};e.model.apiKey&&(n.Authorization=`Bearer ${e.model.apiKey}`);let s={model:e.model.name,messages:e.messages.map(l=>({role:l.role,content:l.content})),stream:!1};typeof e.model.temperature=="number"&&(s.temperature=e.model.temperature),typeof e.model.maxTokens=="number"&&(s.max_tokens=e.model.maxTokens);let i=(await(0,L.requestUrl)({url:t,method:"POST",headers:n,body:JSON.stringify(s)})).json,o=i.choices?.[0]?.message?.content,r=typeof o=="string"?o:Array.isArray(o)?o.map(l=>typeof l?.text=="string"?l.text:"").join(""):"";return{text:Q(r),usage:Y(i.usage)}}getOpenAIEndpoint(e){let s=(e.baseUrl?.trim()||"https://models.brevilabs.com/v1").replace(/\/+$/,"");return s.endsWith("/chat/completions")?s:s.endsWith("/v1")?`${s}/chat/completions`:`${s}/v1/chat/completions`}};function j(){try{let p=require("fs"),e=require("os"),n=require("path").join(e.homedir(),".config","trevclaw","brevilabs-key"),s=p.readFileSync(n,"utf8").trim();return s.length>0?s:void 0}catch{return}}function Y(p){if(p)return{inputTokens:p.prompt_tokens,outputTokens:p.completion_tokens,totalTokens:p.total_tokens}}function Q(p){return p.replace(/<think>[\s\S]*?<\/think>/g,"").trim()}var A=class{constructor(e,t,n,s,a,i,o){this.vaultFs=e;this.miyoClient=t;this.qdrantClient=n;this.modelGateway=s;this.getSettings=a;this.vault=i,this.vaultRoot=o}async serendipity(e){let t=Date.now(),n=e.vault||this.vault,s=this.resolveModel(e),a=0,i=0,o=await this.resolveNoteContent(e),r=await this.extractConcepts(o,s);i++;let l=[];for(let g of r.slice(0,3)){let m=await this.miyoSearch(g,n,5);a++,l.push(...m)}let c=await this.selectRandomNotes(3),u=await this.findOnThisDay(5),y=await this.llmGenerate(s,this.buildSerendipityPrompt(o,l,c,u));i++;let d=this.extractSuggestions(l,c,u);return{ok:!0,command:"serendipity",content:y,suggestions:d,metadata:{durationMs:Date.now()-t,notesAnalyzed:new Set([...l,...c,...u].map(g=>g.path)).size,miyoQueries:a,llmCalls:i,vault:n}}}async crossDomain(e){let t=Date.now(),n=e.vault||this.vault,s=this.resolveModel(e),a=0,i=0,o=await this.resolveNoteContent(e),r=await this.llmGenerateJson(s,[{role:"system",content:'Extract the core structural pattern, the domain this idea belongs to, and 3-5 key concepts. Return strict JSON: {"structuralPattern":"...","domain":"...","concepts":["..."]}'},{role:"user",content:o}]);i++;let l=[];for(let m of(r?.concepts??[]).slice(0,5)){let v=await this.miyoSearch(m,n,5);a++,l.push(...v)}let c=[];e.notePath&&(c=await this.miyoSearchRelated(e.notePath,n,10),a++);let u=T([...l,...c]),y=this.classifyByDomain(u),d=await this.llmGenerate(s,this.buildCrossDomainPrompt(o,r,y));i++;let g=this.extractSuggestions(u);return{ok:!0,command:"cross-domain",content:d,suggestions:g,metadata:{durationMs:Date.now()-t,notesAnalyzed:u.length,miyoQueries:a,llmCalls:i,vault:n}}}async echoChamber(e){let t=Date.now(),n=e.vault||this.vault,s=this.resolveModel(e),a=0,i=0,o=await this.resolveNoteContent(e),r=await this.llmGenerateJson(s,[{role:"system",content:'Extract the 3-5 core assumptions, beliefs, or theses from this content. Return strict JSON: {"assumptions":["..."]}'},{role:"user",content:o}]);i++;let l=[];for(let m of(r?.assumptions??[]).slice(0,5)){let v=`contradicts OR challenges OR opposes: ${m}`,S=await this.miyoSearch(v,n,5);a++,l.push({assumption:m,evidence:S})}let c=await this.miyoSearch(o.slice(0,200),n,15);a++;let u=c.filter(m=>(m.score??0)>.1&&(m.score??0)<.5),y=await this.llmGenerate(s,this.buildEchoChamberPrompt(o,l,u));i++;let d=l.flatMap(m=>m.evidence),g=this.extractSuggestions([...d,...u]);return{ok:!0,command:"echo-chamber",content:y,suggestions:g,metadata:{durationMs:Date.now()-t,notesAnalyzed:new Set([...d,...u].map(m=>m.path)).size,miyoQueries:a,llmCalls:i,vault:n}}}async semanticLinker(e){let t=Date.now(),n=e.vault||this.vault,s=this.resolveModel(e),a=0,i=0,o=await this.resolveNoteContent(e),r=e.notePath??"unknown",l=e.options?.limit??15,c=[];if(e.notePath&&(c=await this.miyoSearchRelated(e.notePath,n,l),a++),c.length<5){let h=await this.extractConcepts(o,s);i++;for(let C of h.slice(0,3)){let b=await this.miyoSearch(C,n,5);a++,c.push(...b)}c=T(c)}let u=[];for(let h of c.slice(0,12)){let C=h.chunk_text??"";try{C=(await this.vaultFs.readFile(h.path)).slice(0,500)}catch{try{let b=`${this.vaultRoot}/${h.path}`;C=(await this.qdrantClient.getChunksForFile(b))[0]?.slice(0,500)??C}catch{}}u.push({path:h.path,snippet:C.slice(0,500)})}let y=await this.llmGenerateJson(s,this.buildSemanticLinkerClassificationPrompt(r,o,u));i++;let d=(y?.relationships??[]).filter(h=>h.target&&h.subtype).map(h=>({source:r,target:h.target,type:X(h.type),subtype:B(h.subtype),confidence:Math.max(0,Math.min(1,h.confidence??.5)),rationale:h.rationale??"",dataviewSyntax:`[${B(h.subtype)}:: [[${h.target.replace(/\.md$/,"")}]]]`})),g=this.inferTransitiveRelationships(d,c),m=[...d,...g],v=await this.llmGenerate(s,this.buildSemanticLinkerSynthesisPrompt(r,o,m));i++;let S=m.slice(0,10).map(h=>({targetNote:h.target,wikilink:`[[${h.target.replace(/\.md$/,"")}]]`,rationale:h.rationale,relationship:h.subtype,confidence:h.confidence}));return{ok:!0,command:"semantic-linker",content:v,suggestions:S,relationships:m,metadata:{durationMs:Date.now()-t,notesAnalyzed:c.length,miyoQueries:a,llmCalls:i,vault:n}}}async orphanRescue(e){let t=Date.now(),n=e.vault||this.vault,s=this.resolveModel(e),a=0,i=0;if(e.options?.batchMode??!1){let{orphans:d,totalFiles:g}=await this.buildLinkGraph(),m=Math.min(e.options?.limit??10,d.length),v=[];for(let h of d.slice(0,m)){let C=await this.miyoSearchRelated(h,n,5);a++;for(let b of C.slice(0,3))v.push({targetNote:b.path,wikilink:`[[${b.path.replace(/\.md$/,"")}]]`,rationale:`Connect orphan [[${h.replace(/\.md$/,"")}]] to this semantically related note`,confidence:b.score})}let S=await this.llmGenerate(s,this.buildOrphanBatchPrompt(d,g,v));return i++,{ok:!0,command:"orphan-rescue",content:S,suggestions:v.slice(0,20),metadata:{durationMs:Date.now()-t,notesAnalyzed:g,miyoQueries:a,llmCalls:i,vault:n}}}let r=await this.resolveNoteContent(e),l=e.notePath??"unknown",c=[];if(e.notePath&&(c=await this.miyoSearchRelated(e.notePath,n,10),a++),c.length<3){let d=await this.extractConcepts(r,s);i++;for(let g of d.slice(0,3)){let m=await this.miyoSearch(g,n,5);a++,c.push(...m)}c=T(c)}let u=await this.llmGenerate(s,this.buildOrphanSinglePrompt(l,r,c));i++;let y=this.extractSuggestions(c);return{ok:!0,command:"orphan-rescue",content:u,suggestions:y,metadata:{durationMs:Date.now()-t,notesAnalyzed:c.length,miyoQueries:a,llmCalls:i,vault:n}}}async vaultHealth(e){let t=Date.now(),n=e.vault||this.vault,{orphans:s,totalFiles:a,linkMap:i,filePaths:o,filesScanned:r}=await this.buildLinkGraph(),l=a>0?s.length/a:0,c=0;for(let h of i.values())c+=h.size;let u=a>0?c/a:0,y=Date.now()-2160*60*60*1e3,d=0;for(let h of o)try{(await this.vaultFs.stat(h)).mtime.getTime()<y&&d++}catch{}let g=a>0?d/a:0,v={totalFiles:a,orphanCount:s.length,orphanRatio:Math.round(l*1e3)/1e3,avgConnectivity:Math.round(u*100)/100,stalenessRatio:Math.round(g*1e3)/1e3,tagCoverage:-1,orphanPaths:s.slice(0,50),computedAt:new Date().toISOString()};return{ok:!0,command:"health",content:["# Vault Health Report","",`> Computed at ${v.computedAt}`,"","| Metric | Value |","|---|---|",`| Total files | ${a} |`,`| Orphan count | ${s.length} |`,`| Orphan ratio | ${(l*100).toFixed(1)}% |`,`| Avg connectivity | ${u.toFixed(2)} inbound links/file |`,`| Staleness (>90d) | ${(g*100).toFixed(1)}% |`,`| Stale files | ${d} |`,"",s.length>0?`## Top Orphans

${s.slice(0,20).map(h=>`- [[${h.replace(/\.md$/,"")}]]`).join(`
`)}`:"## No orphans detected"].join(`
`),suggestions:s.slice(0,10).map(h=>({targetNote:h,wikilink:`[[${h.replace(/\.md$/,"")}]]`,rationale:"Orphan note \u2014 no inbound links detected"})),healthScore:v,metadata:{durationMs:Date.now()-t,notesAnalyzed:a,miyoQueries:0,llmCalls:0,filesScanned:r,vault:n}}}async resolveNoteContent(e){if(e.noteContent)return e.noteContent;if(!e.notePath)return"(No note content provided)";try{return await this.vaultFs.readFile(e.notePath)}catch{return`(Failed to read note: ${e.notePath})`}}async extractConcepts(e,t){return(await this.llmGenerateJson(t,[{role:"system",content:'Extract 3-5 key concepts, themes, or topics from this text. Return strict JSON only: {"concepts":["concept1","concept2",...]}'},{role:"user",content:e.slice(0,3e3)}]))?.concepts??[]}async miyoSearch(e,t,n){return this.miyoClient.search(e,t,n)}async miyoSearchRelated(e,t,n){return this.miyoClient.searchRelated(e,t,n)}async pipeline(e,t){let n=Date.now(),s=[],a=0,i=0;for(let r of e){let l={...t,options:{limit:r.options?.limit??t.options?.limit??10,batchMode:r.options?.batchMode??!1,writeReport:!1}};if(s.length>0){let y=s[s.length-1].content;l.noteContent=(l.noteContent??"")+`

--- Previous Analysis ---

${y}`}let u=await this.getCommandHandler(r.command)(l);s.push(u),a+=u.metadata.llmCalls,i+=u.metadata.miyoQueries}let o=s.map((r,l)=>`# Step ${l+1}: ${r.command}

${r.content}`).join(`

---

`);return{ok:!0,steps:s,combinedContent:o,metadata:{durationMs:Date.now()-n,totalLlmCalls:a,totalMiyoQueries:i}}}getCommandHandler(e){switch(e){case"serendipity":return t=>this.serendipity(t);case"cross-domain":return t=>this.crossDomain(t);case"echo-chamber":return t=>this.echoChamber(t);case"semantic-linker":return t=>this.semanticLinker(t);case"orphan-rescue":return t=>this.orphanRescue(t);case"health":return t=>this.vaultHealth(t)}}async buildLinkGraph(){let e=await this.vaultFs.listFiles(),t=e.length,n=new Map,s=new Set(e);for(let o of s)n.set(o,new Set);let a=0;for(let o of e){let r;try{r=await this.vaultFs.readFile(o),a++}catch{continue}let l=new Set(this.vaultFs.extractWikilinks(r));for(let c of l){let u=c.endsWith(".md")?c:`${c}.md`,y=c.replace(/\.md$/,""),d=s.has(u)?u:s.has(y)?y:E(s,u)??E(s,y);if(d&&d!==o){let g=n.get(d)??new Set;g.add(o),n.set(d,g)}}}return{orphans:e.filter(o=>{if(W(o))return!1;let r=n.get(o);return!r||r.size===0}),totalFiles:t,linkMap:n,filePaths:e,filesScanned:a}}inferTransitiveRelationships(e,t){let n=[],s=new Set(e.map(a=>`${a.source}\u2192${a.target}`));for(let a of e)for(let i of e)if(a.target===i.source&&a.source!==i.target){let o=`${a.source}\u2192${i.target}`;s.has(o)||(s.add(o),n.push({source:a.source,target:i.target,type:"logical",subtype:"relates-to",confidence:Math.min(a.confidence,i.confidence)*.8,rationale:`Transitive: ${a.source} ${a.subtype} ${a.target} and ${i.source} ${i.subtype} ${i.target}`,dataviewSyntax:`[relates-to:: [[${i.target.replace(/\.md$/,"")}]]]`}))}return n.slice(0,5)}async selectRandomNotes(e){let t=await this.vaultFs.listFiles();if(t.length===0)return[];let n=[],s=[...t],a=Math.min(e,s.length);for(let i=0;i<a;i++){let o=i+Math.floor(Math.random()*(s.length-i));[s[i],s[o]]=[s[o],s[i]],n.push(s[i])}return n.map(i=>({path:i,score:void 0}))}async findOnThisDay(e){let t=new Date,n=t.getMonth(),s=t.getDate(),a=t.getFullYear(),i=await this.vaultFs.listFiles(),o=[];for(let r of i){if(o.length>=e)break;try{let l=await this.vaultFs.stat(r),c=l.mtime.getMonth(),u=l.mtime.getDate(),y=l.mtime.getFullYear();c===n&&u===s&&y<a&&o.push({path:r,score:void 0,mtime:l.mtime.getTime()})}catch{continue}}return o}classifyByDomain(e){let t=new Map;for(let n of e){let s=n.path.split("/"),a=s.length>1?s[0]:"Root",i=t.get(a)??[];i.push(n),t.set(a,i)}return t}extractSuggestions(...e){return T(e.flat()).slice(0,10).map(n=>({targetNote:n.path,wikilink:`[[${n.path.replace(/\.md$/,"")}]]`,rationale:n.chunk_text?.slice(0,150)??"Semantically related",confidence:n.score}))}resolveModel(e){return e.model?e.model:k.fromSettings(this.getSettings())}async llmGenerate(e,t){return(await this.modelGateway.generateText({model:e,messages:t})).text}async llmGenerateJson(e,t){let s=(await this.llmGenerate(e,t)).match(/\{[\s\S]*\}/);if(!s)return null;try{return JSON.parse(s[0])}catch{return null}}outputContract(){return`

OUTPUT FORMAT (strict):
- Reply with a markdown BULLET LIST only.
- Do NOT use markdown headings (#, ##, ###) anywhere. Use **bold labels** instead \u2014 your text is embedded inside an existing note section and headings corrupt it.
- No preamble, no restated scaffold, no closing summary. Start directly with the first bullet.
- Reference vault notes as [[Wiki Links]].
- Keep the entire reply under 250 words.`}buildSerendipityPrompt(e,t,n,s){let a=this.formatVaultContext("Semantically Related Notes",t),i=this.formatVaultContext("Random Catalyst Notes",n),o=this.formatVaultContext("On This Day (Past Years)",s);return[{role:"system",content:`You are a "Serendipity Generator" for a Zettelkasten knowledge base. Your role is to surface unexpected connections, forgotten insights, and novel perspectives. Create "happy accidents" by finding surprising links between ideas.

You have access to REAL notes from the user's vault. Reference them with [[wikilinks]].

Cover these angles as bold-labelled BULLETS (never as headings):
1. **Temporal Resurfacing**: Why are older notes suddenly relevant now?
2. **Semantic Proximity**: "Aha!" connections using different terminology
3. **Lateral Connections**: Structural similarities from unrelated domains
4. **Graph Gaps**: Distant notes that should connect
5. **Random Catalysts**: Novel juxtapositions from random vault notes
6. **Exploration Prompts**: Questions that spark further discovery

Use [[Note Name]] syntax for all note references. Only reference notes that appear in the vault context below.`},{role:"user",content:`## Current Note

${e.slice(0,3e3)}

${a}

${i}

${o}

Generate serendipity insights grounded in the vault notes above.`+this.outputContract()}]}buildCrossDomainPrompt(e,t,n){let s=Array.from(n.entries()).map(([a,i])=>this.formatVaultContext(`Domain: ${a}`,i)).join(`

`);return[{role:"system",content:`You are a "Cross-Domain Connector" for a Zettelkasten knowledge base. Your role is to identify structural isomorphisms and create bridges between disparate fields.

You have access to REAL notes from the user's vault organized by domain/folder. Reference them with [[wikilinks]].

Cover these angles as bold-labelled BULLETS (never as headings):
1. **Structural Pattern**: The core shape of the idea
2. **Isomorphisms**: 3-5 domains where this pattern appears (grounded in vault notes)
3. **Analogical Mapping**: Explicit "A is like B because..." format
4. **Universal Principles**: Tags like #feedback-loop, #antifragility, #emergence
5. **Convergence Points**: MOC suggestions connecting domains
6. **Idea Compass**: North (similar), South (opposing), East (cross-domain), West (historical)
7. **Bridge Notes**: Specific cross-pollination link recommendations

Use [[Note Name]] syntax for all references.`},{role:"user",content:`## Current Note

${e.slice(0,3e3)}

## Structural Analysis
${JSON.stringify(t??{})}

## Vault Notes by Domain

${s}

Generate cross-domain connections grounded in the vault notes above.`+this.outputContract()}]}buildEchoChamberPrompt(e,t,n){let s=t.map(i=>{let o=this.formatVaultContext(`Evidence against: "${i.assumption}"`,i.evidence);return`### Assumption: "${i.assumption}"
${o}`}).join(`

`),a=this.formatVaultContext("Semantically Distant but Relevant",n);return[{role:"system",content:`You are an "Echo Chamber Breaker" for a Zettelkasten knowledge base. Your role is to strengthen understanding through intellectual friction.

You have access to REAL notes from the user's vault that may contradict or complicate the assumptions in the current note. Reference them with [[wikilinks]].

Cover these angles as bold-labelled BULLETS (never as headings):
1. **Core Assumptions Identified**: List the main beliefs
2. **Counterarguments**: 3-5 substantive challenges (grounded in vault evidence where available)
3. **Contradictory Evidence**: What vault notes complicate this perspective?
4. **Cross-Domain Perspectives**: How would a historian/scientist/artist/philosopher view this?
5. **"What If" Scenarios**: 2-3 radical reinterpretations
6. **Semantic Distance Connections**: Non-obvious links from distant vault notes

Be respectful but intellectually rigorous. Use [[Note Name]] syntax.`},{role:"user",content:`## Current Note

${e.slice(0,3e3)}

## Vault Evidence per Assumption

${s}

${a}

Generate an echo chamber analysis grounded in the vault evidence above.`+this.outputContract()}]}buildSemanticLinkerClassificationPrompt(e,t,n){let s=n.map((a,i)=>`${i+1}. **${a.path}**: ${a.snippet.slice(0,300)}`).join(`
`);return[{role:"system",content:`You are a semantic relationship classifier for a Zettelkasten knowledge base.

For each neighbor note, classify the relationship to the source note.

Relationship types:
- hierarchical: is-a, part-of, parent-of, instance-of
- causal: causes, enables, prevents, results-in
- temporal: precedes, follows, evolves-into
- logical: supports, contradicts, refines, extends
- social: author-of, influenced-by
- functional: uses, implements, depends-on

Return strict JSON:
{"relationships":[{"target":"filename.md","type":"logical","subtype":"supports","confidence":0.85,"rationale":"..."}]}`},{role:"user",content:`## Source Note: ${e}

${t.slice(0,2e3)}

## Neighbor Notes

${s}

Classify the relationship between the source note and each neighbor.`}]}buildSemanticLinkerSynthesisPrompt(e,t,n){let s=n.map(i=>`- [[${i.target.replace(/\.md$/,"")}]] \u2014 ${i.subtype} (${i.type}, confidence: ${i.confidence.toFixed(2)}): ${i.rationale}`).join(`
`),a=n.map(i=>i.dataviewSyntax).join(`
`);return[{role:"system",content:`You are a "Semantic Linker" for a Zettelkasten knowledge base. Your role is to define specific typed relationships between notes.

You have classified relationships below. Synthesize them into a clear analysis.

Cover these angles as bold-labelled BULLETS (never as headings):
1. **Relationship Map**: Visual summary of how this note connects
2. **Key Relationships**: The most important typed connections with rationale
3. **Transitive Chains**: Inferred relationships through intermediate notes
4. **Dataview Metadata**: Copy-paste-ready inline fields
5. **Missing Connections**: Relationships that should exist but don't

Use [[Note Name]] syntax for all references.`},{role:"user",content:`## Source Note: ${e}

${t.slice(0,2e3)}

## Classified Relationships

${s}

## Dataview Syntax Block

\`\`\`
${a}
\`\`\`

Synthesize these relationships into a structured analysis.`+this.outputContract()}]}buildOrphanSinglePrompt(e,t,n){let s=this.formatVaultContext("Semantically Related Notes",n);return[{role:"system",content:`You are an "Orphan Rescuer" for a Zettelkasten knowledge base. Your role is to reintegrate isolated notes into the knowledge graph.

You have access to REAL vault notes that are semantically related. Reference them with [[wikilinks]].

Cover these angles as bold-labelled BULLETS (never as headings):
1. **Orphan Assessment**: Is this note truly isolated? What connections exist?
2. **Key Concepts**: Connection points extracted from the content
3. **Link Suggestions**: 3-5 specific notes to link to, with rationale
4. **Contextual Placement**: MOC assignment, parent note, series membership
5. **Metadata Recommendations**: Tags, aliases, properties for discoverability
6. **Rescue Plan**: Specific actions with link text and tag additions

Provide copy-paste-ready Dataview syntax where applicable.`},{role:"user",content:`## Orphan Note: ${e}

${t.slice(0,3e3)}

${s}

Generate a rescue plan to reintegrate this note into the knowledge graph.`+this.outputContract()}]}buildOrphanBatchPrompt(e,t,n){let s=e.slice(0,30).map(i=>`- [[${i.replace(/\.md$/,"")}]]`).join(`
`),a=n.slice(0,20).map(i=>`- ${i.rationale}: ${i.wikilink}`).join(`
`);return[{role:"system",content:`You are an "Orphan Rescuer" performing a vault-wide scan. Summarize the orphan situation and provide a prioritized rescue strategy.

Cover these angles as bold-labelled BULLETS (never as headings):
1. **Overview**: Orphan count, percentage, severity assessment
2. **High-Priority Orphans**: Which should be rescued first and why
3. **Cluster Analysis**: Do orphans group by topic or folder?
4. **Rescue Strategy**: Batch actions (MOC creation, tag campaigns, etc.)
5. **Suggested MOCs**: New Maps of Content that would connect orphan clusters

Use [[Note Name]] syntax for all references.`},{role:"user",content:`## Vault Stats

Total files: ${t}
Orphan count: ${e.length}
Orphan ratio: ${(e.length/Math.max(t,1)*100).toFixed(1)}%

## Orphans Found

${s}
`+(e.length>30?`
...and ${e.length-30} more
`:"")+`
## Rescue Suggestions (from semantic search)

${a}

Generate a prioritized vault-wide rescue strategy.`+this.outputContract()}]}formatVaultContext(e,t){if(t.length===0)return`## ${e}

(No results found)`;let n=t.slice(0,10).map(s=>{let i=`[[${s.path.replace(/\.md$/,"")}]]`,o=s.score!=null?` (score: ${s.score.toFixed(3)})`:"",r=s.chunk_text?`: ${s.chunk_text.replace(/\s+/g," ").trim().slice(0,200)}`:"";return`- ${i}${o}${r}`});return`## ${e}

${n.join(`
`)}`}};function T(p){let e=new Set;return p.filter(t=>e.has(t.path)?!1:(e.add(t.path),!0))}function E(p,e){let t=e.toLowerCase();for(let n of p)if(n.toLowerCase()===t)return n}function W(p){let e=p.toLowerCase();return e.includes("template")||e.includes("daily/")||e.includes("dailies/")||e.startsWith("copilot/")||e.startsWith(".obsidian/")||e.includes("zettelkasten/reports/")||/^\d{4}-\d{2}-\d{2}\.md$/.test(p.split("/").pop()??"")}var J={hierarchical:"hierarchical",causal:"causal",temporal:"temporal",logical:"logical",social:"social",functional:"functional"},q={"is-a":"is-a","part-of":"part-of","parent-of":"parent-of","instance-of":"instance-of",causes:"causes",enables:"enables",prevents:"prevents","results-in":"results-in",precedes:"precedes",follows:"follows","evolves-into":"evolves-into",supports:"supports",contradicts:"contradicts",refines:"refines",extends:"extends","relates-to":"relates-to","author-of":"author-of","influenced-by":"influenced-by",uses:"uses",implements:"implements","depends-on":"depends-on"};function X(p){return J[p.toLowerCase()]??"logical"}function B(p){return q[p.toLowerCase()]??"supports"}var U="vaultZK:",D=class{constructor(e){this.listeners=new Map;this.refs=new Map;this.app=e}on(e,t){this.listeners.has(e)||this.listeners.set(e,new Set),this.listeners.get(e).add(t);let n=this.app.workspace.on(U+e,t);this.refs.has(e)||this.refs.set(e,new Map),this.refs.get(e).set(t,n)}off(e,t){this.listeners.get(e)?.delete(t);let n=this.refs.get(e)?.get(t);n&&(this.app.workspace.offref(n),this.refs.get(e).delete(t))}emit(e,t){let n=this.listeners.get(e);if(n)for(let s of n)try{s(t)}catch(a){console.error(`[VaultZK:EventBus] Error in listener for ${e}:`,a)}this.app.workspace.trigger(U+e,t)}destroy(){for(let[,e]of this.refs)for(let[,t]of e)this.app.workspace.offref(t);this.refs.clear(),this.listeners.clear()}};var F=class{constructor(e,t,n,s){this.app=e;this.service=t;this.eventBus=n;this.getSettings=s;this.intervalId=null;this.isRunning=!1;this.lastOrphanRun="";this.lastHealthRun="";this.lastSerendipityRun=""}start(){this.intervalId||(this.intervalId=setInterval(()=>this.tick(),900*1e3),setTimeout(()=>this.tick(),6e4),console.log("[VaultZK] Scheduler started"))}stop(){this.intervalId&&(clearInterval(this.intervalId),this.intervalId=null),console.log("[VaultZK] Scheduler stopped")}async tick(){if(!this.isRunning){this.isRunning=!0;try{await this.tickInner()}finally{this.isRunning=!1}}}async tickInner(){let e=new Date,t=e.toISOString().slice(0,10),n=e.getHours(),s=e.getDay(),a=this.getSettings();a.enableOrphanScan&&n>=2&&n<3&&this.lastOrphanRun!==t&&(this.lastOrphanRun=t,this.runOrphanScan(a).catch(i=>console.error("[VaultZK] Scheduled orphan scan failed:",i))),a.enableHealthDigest&&s===0&&n>=9&&n<10&&this.lastHealthRun!==t&&(this.lastHealthRun=t,this.runHealthDigest(a).catch(i=>console.error("[VaultZK] Scheduled health digest failed:",i))),a.enableSerendipityDigest&&s===3&&n>=9&&n<10&&this.lastSerendipityRun!==t&&(this.lastSerendipityRun=t,this.runSerendipityDigest().catch(i=>console.error("[VaultZK] Scheduled serendipity digest failed:",i)))}async runOrphanScan(e){console.log("[VaultZK] Running scheduled orphan scan...");let t=await this.service.orphanRescue({options:{batchMode:!0,limit:10,writeReport:!1}});e.reportsFolder&&await this.writeReport(e.reportsFolder,`Orphan Scan ${new Date().toISOString().slice(0,10)}`,t.content),this.eventBus.emit("analysis:complete",{command:"orphan-rescue",notePath:null,durationMs:t.metadata.durationMs})}async runHealthDigest(e){console.log("[VaultZK] Running scheduled health digest...");let t=await this.service.vaultHealth({options:{limit:10,batchMode:!1,writeReport:!1}});e.reportsFolder&&await this.writeReport(e.reportsFolder,`Health Report ${new Date().toISOString().slice(0,10)}`,t.content),this.eventBus.emit("health:updated",t.healthScore)}async runSerendipityDigest(){console.log("[VaultZK] Running scheduled serendipity digest...");let e=this.app.vault.getMarkdownFiles();if(e.length===0)return;let t=e.sort((a,i)=>i.stat.mtime-a.stat.mtime).slice(0,20),n=t[Math.floor(Math.random()*t.length)],s=await this.service.serendipity({notePath:n.path,options:{limit:10,batchMode:!1,writeReport:!1}});this.eventBus.emit("analysis:complete",{command:"serendipity",notePath:n.path,durationMs:s.metadata.durationMs})}async writeReport(e,t,n){let s=`${e}/${t}.md`;await this.app.vault.adapter.exists(e)||await this.app.vault.createFolder(e);let a=this.app.vault.getAbstractFileByPath(s);a&&"extension"in a?await this.app.vault.modify(a,n):await this.app.vault.create(s,n),console.log(`[VaultZK] Report written: ${s}`)}};var f=require("obsidian"),N=class extends f.PluginSettingTab{constructor(t,n){super(t,n);this.plugin=n}display(){let{containerEl:t}=this;t.empty(),t.createEl("h2",{text:"LLM Configuration"}),new f.Setting(t).setName("Provider").setDesc("LLM provider for Zettelkasten analysis (OpenAI-compatible endpoints)").addDropdown(n=>n.addOption("openai","OpenAI-compatible (hosted)").setValue(this.plugin.settings.llmProvider).onChange(async s=>{this.plugin.settings.llmProvider=s,await this.plugin.saveSettings()})),new f.Setting(t).setName("Base URL").setDesc("API endpoint (default https://models.brevilabs.com/v1 \u2014 hosted Copilot Plus)").addText(n=>n.setPlaceholder("https://models.brevilabs.com/v1").setValue(this.plugin.settings.llmBaseUrl).onChange(async s=>{this.plugin.settings.llmBaseUrl=s,await this.plugin.saveSettings()})),new f.Setting(t).setName("Model name").setDesc("Model identifier sent in API requests").addText(n=>n.setPlaceholder("qwen2.5-coder-7b-instruct").setValue(this.plugin.settings.llmModelName).onChange(async s=>{this.plugin.settings.llmModelName=s,await this.plugin.saveSettings()})),new f.Setting(t).setName("API key").setDesc("Optional \u2014 leave blank for local providers").addText(n=>{n.inputEl.type="password",n.setPlaceholder("sk-...").setValue(this.plugin.settings.llmApiKey).onChange(async s=>{this.plugin.settings.llmApiKey=s,await this.plugin.saveSettings()})}),new f.Setting(t).setName("Temperature").setDesc("0.0 = deterministic, 1.0 = creative").addSlider(n=>n.setLimits(0,1.5,.1).setValue(this.plugin.settings.llmTemperature).setDynamicTooltip().onChange(async s=>{this.plugin.settings.llmTemperature=s,await this.plugin.saveSettings()})),new f.Setting(t).setName("Max tokens").setDesc("Maximum output tokens per LLM call").addText(n=>n.setPlaceholder("2048").setValue(String(this.plugin.settings.llmMaxTokens)).onChange(async s=>{let a=parseInt(s,10);!isNaN(a)&&a>0&&(this.plugin.settings.llmMaxTokens=a,await this.plugin.saveSettings())})),t.createEl("h2",{text:"Miyo Semantic Search"}),new f.Setting(t).setName("Miyo base URL").setDesc("Miyo server endpoint").addText(n=>n.setPlaceholder("https://127.0.0.1:8743").setValue(this.plugin.settings.miyoBaseUrl).onChange(async s=>{this.plugin.settings.miyoBaseUrl=s,await this.plugin.saveSettings()})),t.createEl("h2",{text:"Qdrant Vector DB"}),new f.Setting(t).setName("Qdrant base URL").setDesc("Qdrant server endpoint").addText(n=>n.setPlaceholder("https://127.0.0.1:6433").setValue(this.plugin.settings.qdrantBaseUrl).onChange(async s=>{this.plugin.settings.qdrantBaseUrl=s,await this.plugin.saveSettings()})),new f.Setting(t).setName("Collection name").setDesc("Qdrant collection used by Miyo").addText(n=>n.setPlaceholder("miyo").setValue(this.plugin.settings.qdrantCollection).onChange(async s=>{this.plugin.settings.qdrantCollection=s,await this.plugin.saveSettings()})),t.createEl("h2",{text:"Scheduled Tasks"}),new f.Setting(t).setName("Orphan scan").setDesc("Daily 2:00 AM \u2014 batch orphan rescue analysis").addToggle(n=>n.setValue(this.plugin.settings.enableOrphanScan).onChange(async s=>{this.plugin.settings.enableOrphanScan=s,await this.plugin.saveSettings()})),new f.Setting(t).setName("Health digest").setDesc("Weekly Sunday 9:00 AM \u2014 vault health report").addToggle(n=>n.setValue(this.plugin.settings.enableHealthDigest).onChange(async s=>{this.plugin.settings.enableHealthDigest=s,await this.plugin.saveSettings()})),new f.Setting(t).setName("Serendipity digest").setDesc("Weekly Wednesday 9:00 AM \u2014 serendipity on a random recent note").addToggle(n=>n.setValue(this.plugin.settings.enableSerendipityDigest).onChange(async s=>{this.plugin.settings.enableSerendipityDigest=s,await this.plugin.saveSettings()})),t.createEl("h2",{text:"Reports"}),new f.Setting(t).setName("Reports folder").setDesc("Vault folder for scheduled report output").addText(n=>n.setPlaceholder("Zettelkasten/Reports").setValue(this.plugin.settings.reportsFolder).onChange(async s=>{this.plugin.settings.reportsFolder=s,await this.plugin.saveSettings()}))}};var Z=class extends w.Plugin{constructor(){super(...arguments);this.settings=R}async onload(){await this.loadSettings(),this.vaultFs=new M(this.app),this.miyoClient=new x(this.settings.miyoBaseUrl),this.qdrantClient=new $(this.settings.qdrantBaseUrl,this.settings.qdrantCollection),this.modelGateway=new k;let t=this.app.vault.getName(),n=this.app.vault.adapter,s=typeof n?.basePath=="string"?n.basePath:"";s||console.warn("[VaultZK] Could not determine vault root path \u2014 Qdrant file lookups may not work"),this.service=new A(this.vaultFs,this.miyoClient,this.qdrantClient,this.modelGateway,()=>this.settings,t,s),this.eventBus=new D(this.app),this.scheduler=new F(this.app,this.service,this.eventBus,()=>this.settings),this.scheduler.start(),this.api=this.buildAPI(),this.registerCommands(),this.addSettingTab(new N(this.app,this)),this.registerEvent(this.app.vault.on("create",()=>this.vaultFs.invalidateCache())),this.registerEvent(this.app.vault.on("delete",()=>this.vaultFs.invalidateCache())),this.registerEvent(this.app.vault.on("rename",()=>this.vaultFs.invalidateCache())),console.log(`[VaultZK] Plugin loaded (vault: ${t})`)}onunload(){this.scheduler?.stop(),this.eventBus?.destroy(),console.log("[VaultZK] Plugin unloaded")}async loadSettings(){let t=await this.loadData()??{},n={...R};for(let s of Object.keys(R))s in t&&typeof t[s]==typeof R[s]&&(n[s]=t[s]);this.settings=n}async saveSettings(){await this.saveData(this.settings),this.miyoClient?.updateBaseUrl(this.settings.miyoBaseUrl),this.qdrantClient?.updateConfig(this.settings.qdrantBaseUrl,this.settings.qdrantCollection)}buildAPI(){return{serendipity:t=>this.runCommand("serendipity",t),crossDomain:t=>this.runCommand("cross-domain",t),echoChamber:t=>this.runCommand("echo-chamber",t),semanticLinker:t=>this.runCommand("semantic-linker",t),orphanRescue:t=>this.runCommand("orphan-rescue",t),vaultHealth:t=>this.runCommand("health",t),pipeline:(t,n)=>this.runPipeline(t,n)}}async runCommand(t,n){let s=Date.now(),a;switch(t){case"serendipity":a=await this.service.serendipity(n);break;case"cross-domain":a=await this.service.crossDomain(n);break;case"echo-chamber":a=await this.service.echoChamber(n);break;case"semantic-linker":a=await this.service.semanticLinker(n);break;case"orphan-rescue":a=await this.service.orphanRescue(n);break;case"health":a=await this.service.vaultHealth(n);break;default:throw new Error(`Unknown command: ${t}`)}return this.eventBus.emit("analysis:complete",{command:t,notePath:n.notePath??null,durationMs:Date.now()-s}),a}async runPipeline(t,n){let s=await this.service.pipeline(t,n);return this.eventBus.emit("pipeline:complete",{steps:s.steps.map(a=>a.command),durationMs:s.metadata.durationMs}),s}registerCommands(){let t=[{id:"run-serendipity",name:"Run Serendipity on current note",command:"serendipity"},{id:"run-cross-domain",name:"Run Cross-Domain on current note",command:"cross-domain"},{id:"run-echo-chamber",name:"Run Echo Chamber on current note",command:"echo-chamber"},{id:"run-semantic-linker",name:"Run Semantic Linker on current note",command:"semantic-linker"},{id:"run-orphan-rescue",name:"Run Orphan Rescue on current note",command:"orphan-rescue"},{id:"run-vault-health",name:"Run Vault Health Check",command:"health"}];for(let n of t)this.addCommand({id:n.id,name:n.name,callback:()=>this.executeOnActiveNote(n.command,n.name)});this.addCommand({id:"run-full-pipeline",name:"Run Full Pipeline on current note",callback:()=>this.executeFullPipeline()})}async executeOnActiveNote(t,n){let s=this.app.workspace.getActiveFile(),a={notePath:s?.path,options:{limit:10,batchMode:!1,writeReport:!1}};if(t!=="health"&&!s){new w.Notice("No active markdown file");return}new w.Notice(`[VaultZK] Running ${n}...`);try{let i=await this.runCommand(t,a);new w.Notice(`[VaultZK] ${n} complete (${(i.metadata.durationMs/1e3).toFixed(1)}s)`),await this.showResult(t,s,i)}catch(i){console.error(`[VaultZK] ${t} failed:`,i),new w.Notice(`[VaultZK] ${n} failed: ${i.message}`)}}async executeFullPipeline(){let t=this.app.workspace.getActiveFile();if(!t){new w.Notice("No active markdown file");return}new w.Notice("[VaultZK] Running full pipeline...");try{let n=[{command:"serendipity"},{command:"cross-domain"},{command:"semantic-linker"},{command:"echo-chamber"}],s=await this.runPipeline(n,{notePath:t.path,options:{limit:10,batchMode:!1,writeReport:!1}});new w.Notice(`[VaultZK] Pipeline complete (${(s.metadata.durationMs/1e3).toFixed(1)}s)`);let a=`${this.settings.reportsFolder}/Pipeline ${t.basename} ${new Date().toISOString().slice(0,10)}.md`;await this.ensureFolder(this.settings.reportsFolder),await this.app.vault.create(a,s.combinedContent),await this.app.workspace.openLinkText(a,"",!0)}catch(n){console.error("[VaultZK] Pipeline failed:",n),new w.Notice(`[VaultZK] Pipeline failed: ${n.message}`)}}async showResult(t,n,s){let a=n?.basename??"vault",i=new Date().toISOString().slice(0,10),o=`${this.settings.reportsFolder}/${t} ${a} ${i}.md`;await this.ensureFolder(this.settings.reportsFolder);let r=this.app.vault.getAbstractFileByPath(o);r&&"extension"in r?await this.app.vault.modify(r,s.content):await this.app.vault.create(o,s.content),await this.app.workspace.openLinkText(o,"",!0)}async ensureFolder(t){await this.app.vault.adapter.exists(t)||await this.app.vault.createFolder(t)}};
