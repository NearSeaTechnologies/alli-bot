import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REGISTRY_BEFORE = 'const wDn=[{id:"general",label:"General",icon:"settings-gear"},{id:"usage",label:"Usage & Billing",icon:"chart-bars"},{id:"beta",label:"Updates",icon:"cloud-download"}]';
const REGISTRY_AFTER = 'const wDn=[{id:"general",label:"General",icon:"settings-gear"},{id:"router",label:"Router (Alli)",icon:"git-branch"}]';
const GENERAL_BEFORE = 'Q=x==="general"?a.jsx(Te,{children:a.jsx(Sa,{auth:t})}):null';
const GENERAL_AFTER = 'Q=x==="general"?a.jsx(Te,{children:a.jsx(Sa,{auth:t})}):x==="router"?a.jsx(RRouterPanel,{}):null';
const USAGE_BEFORE = 'Z=x==="usage"?a.jsx(Te,{children:a.jsx(Na,{})}):null';
const USAGE_AFTER = 'Z=x==="usage"?a.jsx(Te,{children:a.jsx(RRouterUsage,{})}):null';
const COMPONENT_ANCHOR = 'function Sa(s){';
const FILE_PICKER_BEFORE = "Mn=()=>{ne.current?.click()}";
const FILE_PICKER_AFTER = "Mn=async()=>{try{const pick=window.desktop?.pickComposerFilePayloads;if(typeof pick!==\"function\"){ne.current?.click();return}const picked=await pick();if(!Array.isArray(picked)){ne.current?.click();return}const extra=[];for(const file of picked){if(file&&typeof file.path===\"string\"&&typeof file.name===\"string\"){vft(file.path,file.name);Tft(file.path,typeof file.size===\"number\"?file.size:0);extra.push(file.path)}}if(extra.length>0)R([...l,...extra])}catch{ne.current?.click()}}";
const FILE_STAGE_BEFORE = "const c=new Uint8Array(await i.arrayBuffer());return e(o,c)";
const FILE_STAGE_AFTER = "const c=new Uint8Array(await i.arrayBuffer());let bin=\"\";for(let off=0;off<c.length;off+=32768)bin+=String.fromCharCode.apply(null,c.subarray(off,off+32768));return e(o,btoa(bin))";
const FILE_STAGE_CALL_BEFORE = "b.stageAttachmentBytes({filename:we,bytes:Pe})";
const FILE_STAGE_CALL_AFTER = "b.stageAttachmentBytes({filename:we,bytes:Pe,bytesBase64:typeof Pe===\"string\"?Pe:void 0})";
const ACCOUNT_USAGE_BEFORE = "P&&b!=null?p.jsx(Qln,{onChangeLimit:F,reading:b}):null";
const ACCOUNT_USAGE_AFTER = "null";
const ACCOUNT_IOS_BEFORE = "N?p.jsx(It.Item,{leading:p.jsx(bt,{name:\"device-mobile\",size:\"base\"}),onSelect:L,children:\"Get Grok Bot for iOS\"}):null";
const ACCOUNT_IOS_AFTER = "null";
const NEW_AGENT_OPEN_BEFORE = "ee.current||(s(),o(),N(),W.open())";
const NEW_AGENT_OPEN_AFTER = "ee.current||(s(),o(),N(),W.openPicker())";
const NDE_TAIL_BEFORE = 'id:"data-scientist",name:"Data Scientist",description:`Answers data questions with real ${Qi} queries and charts`,eligibility:{kind:"selected-tools",recommendedIf:["Tableau","Hex","Amplitude","Mixpanel","Snowflake","Databricks"]}}]';
const BOTDIRECTORY_CATALOG = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/src/recovered/features/onboarding/signed-in/botdirectory-catalog.json"), "utf8"));
const ORIGINAL_TEMPLATE_IDS = new Set([
  "night-shift", "inbox-triage", "chief-of-staff", "negotiator", "prototyper", "researcher", "shopper",
  "apartment-scout", "lookout", "competitor-watcher", "crm-scribe", "pipeline-scout", "first-responder",
  "win-loss-analyst", "icebreaker", "call-coach", "deck-designer", "channel-digest", "ticket-triager",
  "feedback-miner", "review-responder", "marketing-analyst", "shopkeeper", "invoice-chaser", "expense-auditor",
  "subscription-sleuth", "paralegal", "application-screener", "sourcing-scout", "qa-engineer", "dashboard-watcher",
  "data-scientist",
]);
const ORIGINAL_TEMPLATE_CATEGORIES = {
  "night-shift": "Personal", "inbox-triage": "Productivity", "chief-of-staff": "Productivity", "negotiator": "Sales",
  "prototyper": "Productivity", "researcher": "Productivity", "shopper": "Personal", "apartment-scout": "Personal",
  "lookout": "Ops", "competitor-watcher": "Marketing", "crm-scribe": "Sales", "pipeline-scout": "Sales",
  "first-responder": "Sales", "win-loss-analyst": "Sales", "icebreaker": "Sales", "call-coach": "Sales",
  "deck-designer": "Marketing", "channel-digest": "Productivity", "ticket-triager": "Success", "feedback-miner": "Success",
  "review-responder": "Success", "marketing-analyst": "Marketing", "shopkeeper": "Ops", "invoice-chaser": "Ops",
  "expense-auditor": "Ops", "subscription-sleuth": "Personal", "paralegal": "Ops", "application-screener": "Ops",
  "sourcing-scout": "Ops", "qa-engineer": "Ops", "dashboard-watcher": "Ops", "data-scientist": "Productivity",
};

function directoryCatalogJs() {
  return BOTDIRECTORY_CATALOG.templates
    .filter((entry) => !ORIGINAL_TEMPLATE_IDS.has(entry.id))
    .map((entry) => JSON.stringify({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      eligibility: entry.eligibility,
      category: entry.category ?? "Productivity",
    }))
    .join(",");
}

function categoryLookupJs() {
  const map = { ...ORIGINAL_TEMPLATE_CATEGORIES };
  for (const entry of BOTDIRECTORY_CATALOG.templates) {
    if (typeof entry.category === "string" && entry.category.length > 0 && !Object.hasOwn(ORIGINAL_TEMPLATE_CATEGORIES, entry.id)) {
      map[entry.id] = entry.category;
    }
  }
  return JSON.stringify(map);
}

const TEAMMATE_PICKER_START = "function X4n(n){";
const TEAMMATE_PICKER_END = "function t5n(n,e){";

function teammatePickerSource() {
  return `function X4n(n){const{isPending:t,error:s,onPickTemplate:r,onCreateOwn:i}=n,{launcher:o}=Qe();const c=o.teammateContext()?.dailyTools??[],[q,setQ]=S.useState(""),[cat,setCat]=S.useState("All");const RCats=${categoryLookupJs()};const cats=["All","Productivity","Sales","Marketing","Ops","Success","Personal"];const query=q.trim().toLowerCase();const RCat=T=>typeof T.category==="string"&&T.category.length>0?T.category:RCats[T.id]||"Productivity";const matches=T=>{if(query.length===0)return!0;const hay=(T.name+" "+T.description+" "+RCat(T)+" "+((T.eligibility&&T.eligibility.recommendedIf)||[]).join(" ")).toLowerCase();return hay.includes(query)};const counts={All:0};for(const T of nde){if(!matches(T))continue;counts.All++;const k=RCat(T);counts[k]=(counts[k]||0)+1}const shown=nde.filter(T=>(cat==="All"||RCat(T)===cat)&&matches(T)).map(T=>{const tool=T.eligibility?Xmt(T,c):null;const item=tool?mTe(T,tool):Ooe(T);return{...item,category:RCat(T)}});const cardClass="sand-78zum5 sand-dt5ytf sand-6s0dn4 sand-ou54vl sand-9f619 sand-1qhigcl sand-4pepcl sand-mkeg23 sand-1y0btm7 sand-1atdlfd sand-1pyiiq6 sand-z0cqqs sand-8c2ked sand-1b80kgn sand-sk93b4 sand-1ypdohk sand-1ar62m4 sand-1hc1fzr sand-fqoyci sand-jyslct sand-2b8uid sand-q90yva sand-gdialr";const cardStyle={minWidth:0,width:"100%"};const E=shown.map(R=>p.jsxs("button",{className:cardClass,disabled:t,onClick:()=>r(R),style:cardStyle,type:"button",children:[p.jsx(au,{"aria-hidden":!0,sizePx:Qmt,src:_Ne(R.name)}),p.jsxs("span",{className:"sand-78zum5 sand-dt5ytf sand-6s0dn4 sand-195vfkc sand-h8yej3",style:{minWidth:0,width:"100%"},children:[p.jsx("span",{className:"sand-1ghz6dp sand-1j61zf2 sand-dod15v sand-4ryatg sand-tyxrsu sand-193iq5w",style:{display:"block",overflow:"visible",textAlign:"center",whiteSpace:"normal",width:"100%"},children:R.name}),p.jsx("span",{style:{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",borderRadius:999,color:"rgba(255,255,255,.7)",fontSize:11,lineHeight:"18px",padding:"0 8px",whiteSpace:"nowrap"},children:R.category}),p.jsx(dl,{level:"body2",style:Gae.cardDescription,children:Array.isArray(R.description)?aAe(R.description):R.description})]})]},R.templateId));const A=p.jsx(Q4n,{isPending:t,onCreateOwn:i});const I=p.jsxs("div",{style:{alignItems:"stretch",display:"grid",gap:12,gridTemplateColumns:"repeat(5,minmax(0,1fr))",justifyItems:"stretch",paddingBottom:24,width:"100%"},children:[A,...E]});const search=p.jsx("input",{"aria-label":"Search templates",autoComplete:"off",autoFocus:!0,onChange:ev=>setQ(ev.currentTarget.value),placeholder:"Search templates",spellCheck:!1,type:"text",value:q,style:{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",borderRadius:999,boxSizing:"border-box",color:"inherit",fontSize:14,height:36,outline:"none",padding:"0 14px",width:"100%"}});const pills=p.jsx("div",{"aria-label":"Categories",style:{display:"flex",flexWrap:"wrap",gap:8,width:"100%"},children:cats.map(C=>p.jsx("button",{onClick:()=>setCat(C),type:"button",style:{background:cat===C?"rgba(255,255,255,.14)":"transparent",border:"1px solid rgba(255,255,255,.14)",borderRadius:999,color:cat===C?"#fff":"rgba(255,255,255,.65)",cursor:"pointer",fontSize:13,height:32,padding:"0 14px",whiteSpace:"nowrap"},children:C+" · "+(counts[C]||0)},C))});const empty=shown.length===0?p.jsx(dl,{as:"p",level:"body2",style:Gae.cardDescription,children:query.length>0?"No templates match “"+q.trim()+"”":"No templates in this category"}):null;const err=s!=null?p.jsx(dl,{as:"p",level:"body2",style:Gae.error,children:s}):null;const title=p.jsx(dl,{as:"h2",level:"heading3",style:Gae.title,weight:"medium",children:"Meet a future teammate"});const count=p.jsx(dl,{as:"p",level:"body2",style:Gae.cardDescription,children:shown.length+" template"+(shown.length===1?"":"s")});return p.jsxs("div",{className:re("sand-teammate-picker","sand-78zum5 sand-dt5ytf"),style:{alignItems:"stretch",gap:16,margin:"0 auto",maxWidth:1120,padding:"8px 8px 24px",width:"100%"},children:[title,search,pills,count,empty,I,err]})}
function Q4n(n){const{isPending:t,onCreateOwn:s}=n;return p.jsxs("button",{className:"sand-78zum5 sand-dt5ytf sand-6s0dn4 sand-ou54vl sand-9f619 sand-1qhigcl sand-4pepcl sand-mkeg23 sand-1y0btm7 sand-1atdlfd sand-1pyiiq6 sand-z0cqqs sand-8c2ked sand-1b80kgn sand-sk93b4 sand-1ypdohk sand-1ar62m4 sand-1hc1fzr sand-fqoyci sand-jyslct sand-2b8uid sand-q90yva sand-gdialr",disabled:t,onClick:s,style:{minWidth:0,width:"100%"},type:"button",children:[p.jsx(au,{"aria-hidden":!0,icon:"plus",sizePx:Qmt}),p.jsxs("span",{className:"sand-78zum5 sand-dt5ytf sand-6s0dn4 sand-195vfkc sand-h8yej3",children:[p.jsx("span",{className:"sand-1ghz6dp sand-1j61zf2 sand-dod15v sand-4ryatg sand-tyxrsu sand-193iq5w",style:{display:"block",overflow:"visible",textAlign:"center",whiteSpace:"normal",width:"100%"},children:"Create your own"}),p.jsx(dl,{level:"body2",style:Gae.cardDescription,children:"Name a teammate and describe what they should do"})]})]})}
function e5n(n){const{isCreatePending:t,createError:s,onPickTemplate:r,onCreateCustom:i}=n,[o,l]=S.useState("picker");return p.jsx("div",{className:re("sand-new-agent-pane","sand-78zum5 sand-dt5ytf sand-1iyjqo2 sand-2lwn1j sand-1odjw0f sand-1axd487 sand-17qtykl"),style:{alignItems:"stretch",justifyContent:"flex-start",minHeight:0,width:"100%"},children:o==="picker"?p.jsx(X4n,{error:s,isPending:t,onCreateOwn:()=>l("form"),onPickTemplate:r}):p.jsx(W4n,{error:s,isPending:t,onCancel:()=>l("picker"),onCreate:i})})}
`;
}

function patchDirectoryCatalog(source) {
  if (source.includes(DIRECTORY_CATALOG_MARKER)) return source;
  return replaceExactlyOnce(source, NDE_TAIL_BEFORE, `${NDE_TAIL_BEFORE.slice(0, -1)},${directoryCatalogJs()}]`, "merge botdirectory templates");
}

function patchTeammatePickerSearch(source) {
  const start = source.indexOf(TEAMMATE_PICKER_START);
  const end = source.indexOf(TEAMMATE_PICKER_END, start);
  if (start < 0 || end < 0 || source.indexOf(TEAMMATE_PICKER_START, start + 1) >= 0) {
    throw new Error("Original renderer teammate picker search anchor is missing or ambiguous.");
  }
  return source.slice(0, start) + teammatePickerSource() + source.slice(end);
}

const COMPONENT_SOURCE = String.raw`
const RRouterProviders=[
  {value:"claude-code",label:"Claude",description:"Use your existing Claude Code sign-in. Does not use Cursor usage.",kind:"local",localKey:"claude-code"},
  {value:"codex",label:"Codex",description:"Use your existing ChatGPT sign-in from Codex. Does not use Cursor usage.",kind:"local",localKey:"codex"},
  {value:"grok",label:"Grok",description:"Use your existing Grok / xAI sign-in. Bills your xAI account, not Cursor.",kind:"local",localKey:"grok"}
],RRouterOptions=RRouterProviders.map(s=>({value:s.value,label:s.label})),RRouterEmptyUsage={requests:0,inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,lastUsedAt:null},RRouterInputClass="sand-9f619 sand-h8yej3 sand-5f5z56 sand-u97haq sand-lrnmfh sand-uve7l6 sand-16b7oty sand-1rgtt3y sand-o7x2bt sand-mkeg23 sand-1y0btm7 sand-qz0629 sand-1043rbw sand-13l7odt sand-1wd3ewq sand-jb2p0i sand-4z9k3i sand-frs9s4 sand-tt52l0 sand-1odjw0f sand-1t137rt sand-ltfok3";
function RRouterState(){
  const[s,e]=de.useState({provider:"claude-code",usage:null,local:null,error:null});
  de.useEffect(()=>{let t=!0;const n=r=>{t&&e(r.detail)};window.addEventListener("sand-router-provider-changed",n);window.desktop.agent.getInferenceRouter().then(r=>{t&&e({...r,error:null})}).catch(r=>{t&&e(i=>({...i,error:String(r?.message??r)}))});return()=>{t=!1;window.removeEventListener("sand-router-provider-changed",n)}},[]);
  const t=async n=>{const r=s;e(i=>({...i,provider:n,error:null}));try{const i=await window.desktop.agent.setInferenceRouter(n),o={...i,error:null};e(o);window.dispatchEvent(new CustomEvent("sand-router-provider-changed",{detail:o}))}catch(i){e({...r,error:String(i?.message??i)})}};
  return[s,t]
}
function RRouterSecrets(){const[s,e]=de.useState([]),[t,n]=de.useState(0);de.useEffect(()=>{let r=!0;window.desktop.secrets.list().then(i=>{r&&e(Array.isArray(i?.keys)?i.keys:[])});return()=>{r=!1}},[t]);return[s,()=>n(r=>r+1)]}
function RRouterNumber(s){return new Intl.NumberFormat().format(s)}
function RRouterCredential({provider:s,state:e,keys:t,onSaved:n}){const[r,i]=de.useState(""),[o,l]=de.useState(!1);if(s.kind==="account")return a.jsx(se,{as:"span",color:"secondary",size:"sm",children:"Signed in"});if(s.kind==="local"){const c=e.local?.[s.localKey],d=c?.installed&&c?.authenticated;return a.jsx(se,{as:"span",color:d?"primary":"secondary",size:"sm",children:d?"Ready":c?.installed?"Sign in with "+(s.value==="codex"?"codex login":s.value==="grok"?"grok login":"claude"):"Not installed"})}const c=t.includes(s.secret),d=async()=>{if(r.trim().length===0)return;l(!0);try{await window.desktop.secrets.upsert({[s.secret]:r.trim()}),i(""),n()}finally{l(!1)}};return a.jsxs("div",{className:"sand-9f619 sand-78zum5 sand-6s0dn4 sand-h8yej3",style:{width:360},children:[a.jsx("input",{"aria-label":s.secret,className:RRouterInputClass,disabled:o,onChange:u=>i(u.currentTarget.value),placeholder:c?"Replace saved key":"Paste API key",style:{fontSize:13,height:34,minWidth:0,padding:"0 10px",width:270},type:"password",value:r}),a.jsx(oe,{disabled:o||r.trim().length===0,onClick:d,shape:"rectangular",size:"sm",variant:"secondary",children:o?"Saving…":"Save"})]})}
function RRouterUsageRows({usage:s}){return a.jsxs("div",{children:[a.jsx(ie,{label:"Requests",variant:"card",children:a.jsx(se,{as:"span",color:"secondary",size:"sm",children:RRouterNumber(s.requests)})}),a.jsx(ie,{divided:!0,label:"Input tokens",variant:"card",children:a.jsx(se,{as:"span",color:"secondary",size:"sm",children:RRouterNumber(s.inputTokens)})}),a.jsx(ie,{divided:!0,label:"Output tokens",variant:"card",children:a.jsx(se,{as:"span",color:"secondary",size:"sm",children:RRouterNumber(s.outputTokens)})}),a.jsx(ie,{divided:!0,label:"Cache tokens",variant:"card",children:a.jsx(se,{as:"span",color:"secondary",size:"sm",children:RRouterNumber(s.cacheReadTokens+s.cacheWriteTokens)})}),a.jsx(ie,{divided:!0,label:"Last used",variant:"card",children:a.jsx(se,{as:"span",color:"secondary",size:"sm",children:s.lastUsedAt?new Date(s.lastUsedAt).toLocaleString():"Not used yet"})})]})}
function RBoxRuntime(){const[s,e]=de.useState({mode:"remote",status:null,error:null,busy:!0});de.useEffect(()=>{let t=!0;window.desktop.agent.getBoxRuntime().then(n=>{t&&e({...n,error:null,busy:!1})}).catch(n=>{t&&e(r=>({...r,error:String(n?.message??n),busy:!1}))});return()=>{t=!1}},[]);const t=s.mode==="sandbox",n=async()=>{const r=t?"remote":"sandbox";e(i=>({...i,mode:r,busy:!0,error:null}));try{const i=await window.desktop.agent.setBoxRuntime(r);e({...i,error:null,busy:!1})}catch(i){e(o=>({...o,mode:t?"sandbox":"remote",error:String(i?.message??i),busy:!1}))}};return a.jsxs("div",{children:[a.jsx(ie,{description:t?(s.status?.detail??"Shell, files and computer use run on the Hetzner sandbox through localhost:1340."):"Turn this on after the sandbox container and SSH tunnel are running.",label:"Use sandbox computer",variant:"card",children:a.jsx("button",{"aria-checked":t,"aria-label":"Use sandbox computer",disabled:s.busy,onClick:n,role:"switch",style:{appearance:"none",background:t?"var(--color-accent-primary, #4f8cff)":"rgba(255,255,255,.14)",border:0,borderRadius:999,cursor:s.busy?"wait":"pointer",height:22,opacity:s.busy?0.65:1,padding:2,position:"relative",transition:"background .15s ease",width:38},type:"button",children:a.jsx("span",{style:{background:"white",borderRadius:"50%",boxShadow:"0 1px 3px rgba(0,0,0,.35)",display:"block",height:18,transform:"translateX("+(t?16:0)+"px)",transition:"transform .15s ease",width:18}})})}),s.error?a.jsx(se,{as:"p",color:"red",size:"sm",children:s.error}):null]})}
function RRouterPanel(){const[s,e]=RRouterState(),[t,n]=RRouterSecrets(),r=RRouterProviders.find(i=>i.value===s.provider)??RRouterProviders[0],i=s.usage?.providers?.[s.provider]??RRouterEmptyUsage,o=r.value==="codex"?"Uses the ChatGPT login already stored by Codex on this Mac.":r.value==="grok"?"Uses the Grok CLI login already stored on this Mac.":r.kind==="local"?"Uses Claude Code's existing login on this Mac.":"Uses a connected account on this Mac.";return a.jsx(Te,{children:a.jsxs("div",{className:k("sand-settings-general","sand-9f619 sand-78zum5 sand-dt5ytf sand-3qzy4x"),children:[a.jsx(re,{title:"Routing",children:a.jsx(ie,{description:r.description,label:"Provider",variant:"card",children:a.jsx(ye,{"aria-label":"Routing provider",onValueChange:l=>{if(l!==null)void e(l)},options:RRouterOptions,placement:"bottom-end",size:"lg",value:s.provider,variant:"filled"})})}),a.jsx(re,{title:"Computer",children:a.jsx(RBoxRuntime,{})}),a.jsx(re,{title:r.kind==="key"?"OpenRouter account":"Account",children:a.jsx(ie,{description:o,label:r.kind==="key"?"API key":"Status",variant:"card",children:a.jsx(RRouterCredential,{provider:r,state:s,keys:t,onSaved:n})})}),s.error?a.jsx(se,{as:"p",color:"red",size:"sm",children:s.error}):null,a.jsx(re,{title:"Usage for "+r.label,children:a.jsx(RRouterUsageRows,{usage:i})})]})})}
function RRouterUsageSummary({provider:s,usage:e,current:t,divided:n}){const r=[RRouterNumber(e.requests)+" requests",RRouterNumber(e.inputTokens)+" input",RRouterNumber(e.outputTokens)+" output",RRouterNumber(e.cacheReadTokens+e.cacheWriteTokens)+" cached"].join(" · "),i=t?"Current route":e.lastUsedAt?new Date(e.lastUsedAt).toLocaleString():"Not used yet";return a.jsx(ie,{divided:n,description:r,label:s.label,variant:"card",children:a.jsx(se,{as:"span",color:t?"primary":"secondary",size:"sm",children:i})})}
function RRouterUsage(){const[s]=RRouterState(),e=RRouterProviders.find(t=>t.value===s.provider)??RRouterProviders[0],t=RRouterProviders.filter(n=>n.value===s.provider||(s.usage?.providers?.[n.value]?.requests??0)>0);return a.jsxs("div",{className:k("sand-usage-section","sand-9f619 sand-78zum5 sand-dt5ytf sand-ou54vl"),children:[a.jsx(re,{title:"Current provider",children:a.jsx(ie,{description:e.description,label:e.label,variant:"card",children:a.jsx(se,{as:"span",color:"secondary",size:"sm",children:"Selected"})})}),a.jsx(re,{title:"Tracked activity",children:a.jsx("div",{children:t.map((n,r)=>a.jsx(RRouterUsageSummary,{provider:n,usage:s.usage?.providers?.[n.value]??RRouterEmptyUsage,current:n.value===s.provider,divided:r>0},n.value))})})]})}
`;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + 1) >= 0) throw new Error(`Original renderer ${label} anchor is missing or ambiguous.`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceOnceOrSkip(source, before, after, label) {
  if (source.includes(after) && !source.includes(before)) return source;
  return replaceExactlyOnce(source, before, after, label);
}

const DIRECTORY_CATALOG_MARKER = "multi-account-content-desk";

export function patchOriginalSettingsRegistry(source) {
  return replaceExactlyOnce(source, REGISTRY_BEFORE, REGISTRY_AFTER, "settings registry");
}

export function patchOriginalSettingsPanel(source) {
  let patched = replaceExactlyOnce(source, COMPONENT_ANCHOR, `${COMPONENT_SOURCE}${COMPONENT_ANCHOR}`, "component insertion");
  patched = replaceExactlyOnce(patched, GENERAL_BEFORE, GENERAL_AFTER, "Router panel switch");
  patched = replaceExactlyOnce(patched, USAGE_BEFORE, USAGE_AFTER, "Usage panel switch");
  return patched;
}

const KICKSTART_RETRY_BEFORE = "kickstartAwaitingFirstMessage:async I=>{d(I);let P;try{P=await n.kickstartAgent(I)}catch(J){throw m(I),J}P?.isIntroductionInFlight===!1&&m(I)}";
const KICKSTART_RETRY_AFTER = "kickstartAwaitingFirstMessage:async I=>{d(I);for(let k=0;k<20;k++){let P;try{P=await n.kickstartAgent(I)}catch(J){throw m(I),J}if(P?.isIntroductionInFlight!==!1)return;await new Promise(R=>setTimeout(R,500))}m(I)}";
const ABOUT_ITEM_BEFORE = 'se=p.jsx(It.Item,{leading:X,onSelect:H,children:"About"})';
const ABOUT_ITEM_AFTER = 'se=null';
const FEEDBACK_ITEM_BEFORE = 'ce=p.jsx(It.Item,{leading:ae,onSelect:h.open,children:"Send Feedback"})';
const FEEDBACK_ITEM_AFTER = 'ce=null';
const WEEKLY_USAGE_ITEM_BEFORE = 'k=p.jsx(It.SubMenuTrigger,{label:"Weekly usage",leading:u,trailing:p.jsxs("span",{className:m,children:[h,y]}),children:"Weekly usage"})';
const WEEKLY_USAGE_ITEM_AFTER = 'k=null';
const SIDEBAR_AGENT_NAME_BEFORE = 'className:re("sand-agent-item__name",Fe(h1.name,Ut.body1,Us.medium).className),children:i}';
const SIDEBAR_AGENT_NAME_AFTER = 'className:re("sand-agent-item__name",Fe(h1.name,Ut.body1,Us.medium).className),children:i==="Grok"?"Alli":i}';
const WORKING_PERSONA_BEFORE = 'const tln={thinking:"thinking",searching:"searching",browsing:"searching",reading:"searching",connecting:"searching",writing:"working",coding:"working",generating:"loading","running-commands":"working","on-its-computer":"working","on-your-computer":"working",working:"working",messaging:"orbit",waiting:"orbit"},eZ="idle";function nln(n){return n==null?"working":n.kind==="tool"&&n.tool==="SendToAgent"?"sending":tln[dse(n).verb]}';
const WORKING_PERSONA_AFTER = 'const tln={thinking:"idle",searching:"idle",browsing:"idle",reading:"idle",connecting:"idle",writing:"idle",coding:"idle",generating:"idle","running-commands":"idle","on-its-computer":"idle","on-your-computer":"idle",working:"idle",messaging:"idle",waiting:"idle"},eZ="idle";function nln(n){return n==null?"idle":n.kind==="tool"&&n.tool==="SendToAgent"?"idle":tln[dse(n).verb]??"idle"}';
const WORKING_PHOTO_BEFORE = 'if(z){let ye;e[18]===Symbol.for("react.memo_cache_sentinel")?(ye=p.jsx(ANe,{size:kJn}),e[18]=ye):ye=e[18],Ae=ye}else Se&&G!=null?Ae=p.jsx(Nlt,{color:V.color,eyeColor:sSe,sizePx:DGe,sourceId:G,state:H}):Ae=p.jsx(sd,{color:V.color,emphasis:ce,eyeColor:sSe,ref:fe,shape:V.shape,sizePx:DGe,state:ae});';
const WORKING_PHOTO_AFTER = 'if(z)Ae=p.jsx(Iee,{avatarKey:L,dataUrl:F.avatarDataUrl??null,fillPx:DGe,isStatic:!0});else Se&&G!=null?Ae=p.jsx(Nlt,{color:V.color,eyeColor:sSe,sizePx:DGe,sourceId:G,state:H}):Ae=p.jsx(sd,{color:V.color,emphasis:ce,eyeColor:sSe,ref:fe,shape:V.shape,sizePx:DGe,state:ae});';
const ACTIVITY_DOTS_BEFORE = 'j=v?p.jsx("span",{className:q.className,style:q.style,children:p.jsx(ANe,{size:"sm"})}):null';
const ACTIVITY_DOTS_AFTER = 'j=null';
const KIT_WORKING_BADGE_BEFORE = 'else if(s==="working"){let G;e[45]===Symbol.for("react.memo_cache_sentinel")?(G=p.jsx(ANe,{size:"sm",style:w1e.badgeFill}),e[45]=G):G=e[45],k=G}';
const KIT_WORKING_BADGE_AFTER = 'else if(s==="working"){let G;e[45]===Symbol.for("react.memo_cache_sentinel")?(G=p.jsx(d0e,{status:"working",style:w1e.badgeFill}),e[45]=G):G=e[45],k=G}';
const ACTIVITY_MARK_STATE_BEFORE = 'const vJn="working"';
const ACTIVITY_MARK_STATE_AFTER = 'const vJn="idle"';

export function patchKickstartRetry(source) {
  if (!source.includes(KICKSTART_RETRY_BEFORE)) return source;
  return replaceExactlyOnce(source, KICKSTART_RETRY_BEFORE, KICKSTART_RETRY_AFTER, "retry kickstart until the bot can introduce itself");
}

export function patchWorkingAvatarDots(source) {
  let patched = source;
  if (!patched.includes('working:"idle",messaging:"orbit"') && patched.includes(WORKING_PERSONA_BEFORE)) {
    patched = replaceExactlyOnce(patched, WORKING_PERSONA_BEFORE, WORKING_PERSONA_AFTER, "keep bot image idle while working");
    if (patched.includes(WORKING_PHOTO_BEFORE)) patched = replaceExactlyOnce(patched, WORKING_PHOTO_BEFORE, WORKING_PHOTO_AFTER, "keep custom bot photo instead of working dots");
    if (patched.includes(ACTIVITY_DOTS_BEFORE)) patched = replaceExactlyOnce(patched, ACTIVITY_DOTS_BEFORE, ACTIVITY_DOTS_AFTER, "do not overlay working dots on activity avatars");
    if (patched.includes(KIT_WORKING_BADGE_BEFORE)) patched = replaceExactlyOnce(patched, KIT_WORKING_BADGE_BEFORE, KIT_WORKING_BADGE_AFTER, "use green status instead of working dots on kit avatars");
    if (patched.includes(ACTIVITY_MARK_STATE_BEFORE)) patched = replaceExactlyOnce(patched, ACTIVITY_MARK_STATE_BEFORE, ACTIVITY_MARK_STATE_AFTER, "activity mark stays idle while working");
  }
  if (patched.includes('thinking:"thinking",searching:"searching"')) {
    patched = replaceExactlyOnce(patched, 'thinking:"thinking",searching:"searching"', 'thinking:"idle",searching:"idle"', "thinking and searching keep the bot image idle");
  }
  if (patched.includes('A_t={thinking:"dots",orbit:"orbit"')) {
    patched = replaceExactlyOnce(patched, 'A_t={thinking:"dots",orbit:"orbit"', 'A_t={orbit:"orbit"', "do not overlay thinking dots on the bot image");
  }
  if (patched.includes('KCe(n)?"thinking":nln(n.currentActivity??null)')) {
    patched = replaceExactlyOnce(patched, 'function wbe(n){return n==null||!xge(n)?eZ:KCe(n)?"thinking":nln(n.currentActivity??null)}', 'function wbe(n){return n==null||!xge(n)?eZ:nln(n.currentActivity??null)}', "writing does not switch the bot image to thinking dots");
  }
  if (patched.includes('_t==="dots"?za(gn,ze):_t==="orbit"?$a(gn,ze)')) {
    patched = replaceExactlyOnce(patched, '_t==="dots"?za(gn,ze):_t==="orbit"?$a(gn,ze)', '_t==="dots"?0:_t==="orbit"?$a(gn,ze)', "disable persona dots overlay");
  }
  if (patched.includes("n.awaitingUserResponse==null&&n.isRunning||KCe(n)")) {
    patched = replaceExactlyOnce(
      patched,
      "function xge(n){return n.awaitingUserResponse==null&&n.isRunning||KCe(n)}",
      "function xge(n){return n.awaitingUserResponse==null&&(n.currentActivity!=null||n.isComposingMessage)}",
      "show green indicator only while a bot is actually working",
    );
  }
  return patched;
}

export function patchOriginalComposerFilePicker(source) {
  let patched = replaceOnceOrSkip(source, FILE_PICKER_BEFORE, FILE_PICKER_AFTER, "composer file picker");
  patched = replaceOnceOrSkip(patched, ABOUT_ITEM_BEFORE, ABOUT_ITEM_AFTER, "hide About menu item");
  patched = replaceOnceOrSkip(patched, FEEDBACK_ITEM_BEFORE, FEEDBACK_ITEM_AFTER, "hide Send Feedback menu item");
  patched = replaceOnceOrSkip(patched, WEEKLY_USAGE_ITEM_BEFORE, WEEKLY_USAGE_ITEM_AFTER, "hide Weekly usage menu item");
  patched = replaceOnceOrSkip(patched, SIDEBAR_AGENT_NAME_BEFORE, SIDEBAR_AGENT_NAME_AFTER, "rename sidebar Grok");
  patched = patchKickstartRetry(patched);
  return patchWorkingAvatarDots(patched);
}

export function patchOriginalComposerFileStage(source) {
  let patched = replaceOnceOrSkip(source, FILE_STAGE_BEFORE, FILE_STAGE_AFTER, "composer file stage bytes");
  patched = replaceOnceOrSkip(patched, FILE_STAGE_CALL_BEFORE, FILE_STAGE_CALL_AFTER, "composer file stage call");
  patched = replaceOnceOrSkip(patched, ACCOUNT_USAGE_BEFORE, ACCOUNT_USAGE_AFTER, "account weekly usage");
  patched = replaceOnceOrSkip(patched, ACCOUNT_IOS_BEFORE, ACCOUNT_IOS_AFTER, "account ios item");
  patched = replaceOnceOrSkip(patched, NEW_AGENT_OPEN_BEFORE, NEW_AGENT_OPEN_AFTER, "new agent type picker");
  patched = patchDirectoryCatalog(patched);
  patched = patchTeammatePickerSearch(patched);
  return patched;
}

export async function applyOriginalRendererRouterPatch({ stageRoot }) {
  const assetsRoot = path.join(stageRoot, "dist", "renderer", "assets");
  const registryCandidates = [];
  const panelCandidates = [];
  const pickerCandidates = [];
  for (const name of await readdir(assetsRoot)) {
    if (!name.endsWith(".js")) continue;
    const target = path.join(assetsRoot, name);
    const source = await readFile(target, "utf8");
    if (source.includes(REGISTRY_BEFORE)) registryCandidates.push({ name, target, source });
    if (source.includes(COMPONENT_ANCHOR) && source.includes(GENERAL_BEFORE) && source.includes(USAGE_BEFORE)) panelCandidates.push({ name, target, source });
    if (source.includes(TEAMMATE_PICKER_START) && (source.includes(FILE_PICKER_BEFORE) || source.includes("pickComposerFilePayloads")) && (source.includes(NEW_AGENT_OPEN_BEFORE) || source.includes(NEW_AGENT_OPEN_AFTER))) pickerCandidates.push({ name, target, source });
  }
  const alreadyPatchedRegistry = [];
  for (const name of await readdir(assetsRoot)) {
    if (!name.endsWith(".js")) continue;
    const source = await readFile(path.join(assetsRoot, name), "utf8");
    if (source.includes(REGISTRY_AFTER) && !source.includes(REGISTRY_BEFORE)) alreadyPatchedRegistry.push(name);
  }
  if ((registryCandidates.length !== 1 || panelCandidates.length !== 1) && alreadyPatchedRegistry.length === 0) {
    throw new Error(`Expected one original Settings registry and panel chunk, found ${registryCandidates.length}/${panelCandidates.length}.`);
  }
  if (pickerCandidates.length !== 1) {
    throw new Error(`Expected one original composer file picker chunk, found ${pickerCandidates.length}.`);
  }
  const changes = [];
  const writes = new Map();
  const patchComposerAttachments = (source) => patchOriginalComposerFileStage(patchOriginalComposerFilePicker(source));
  const jobs = [
    ...(registryCandidates[0] != null ? [["registry", registryCandidates[0], patchOriginalSettingsRegistry]] : []),
    ...(panelCandidates[0] != null ? [["panel", panelCandidates[0], patchOriginalSettingsPanel]] : []),
    ["file-picker", pickerCandidates[0], patchComposerAttachments],
  ];
  for (const [role, candidate, transform] of jobs) {
    const previous = writes.get(candidate.target) ?? candidate.source;
    const patched = transform(previous);
    writes.set(candidate.target, patched);
    changes.push({
      role,
      path: `dist/renderer/assets/${candidate.name}`,
      original: { bytes: Buffer.byteLength(candidate.source), sha256: sha256(candidate.source) },
      patched: { bytes: Buffer.byteLength(patched), sha256: sha256(patched) },
    });
  }
  for (const [target, patched] of writes) await writeFile(target, patched);
  for (const name of await readdir(assetsRoot)) {
    if (!/\.(js|css|html|json)$/.test(name)) continue;
    const target = path.join(assetsRoot, name);
    const source = await readFile(target, "utf8");
    if (!source.includes("Grok Bot")) continue;
    await writeFile(target, source.replaceAll("Grok Bot", "Alli Bot"));
  }
  const record = {
    schemaVersion: 1,
    mode: "original-renderer-settings-extension",
    chunks: changes,
    features: ["settings-router-provider", "settings-local-docker-vm", "usage-current-provider", "composer-native-file-picker", "composer-base64-file-stage"],
    transformations: ["settings-registry", "router-panel", "usage-panel", "composer-file-picker", "composer-file-stage"],
  };
  const provenancePath = path.join(stageRoot, "dist", "renderer-router-extension.json");
  await writeFile(provenancePath, `${JSON.stringify(record, null, 2)}\n`);
  return { ...record, provenancePath, provenanceBytes: (await stat(provenancePath)).size };
}
