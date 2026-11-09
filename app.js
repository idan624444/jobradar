const TABS=[
  {id:"today",label:"חדשות"},
  {id:"all",label:"הכל"},
  {id:"saved",label:"שמורות"},
  {id:"journey",label:"המסע שלי"},
  {id:"tips",label:"טיפים"}
];
const CATS=["סושיאל","שיווק דיגיטלי","משרד פרסום","תוכן ווידאו","קמפיינים PPC","שיווק כללי"];
const STATES={saved:"שמורה",applied:"הגשתי",interview:"ראיון",offer:"הצעה!",rejected:"לא התקבלתי",hidden:"לא מתאים"};
const ui={tab:"today",cats:new Set(),q:"",partOnly:false,remoteOnly:false};
try{const t=localStorage.getItem("jc-tab");if(t&&TABS.some(x=>x.id===t))ui.tab=t}catch(e){}
if(location.hash&&TABS.some(x=>x.id===location.hash.slice(1)))ui.tab=location.hash.slice(1);

let jobs=[],status={},meta=null,loaded=false;const readOnly=false;
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function daysAgo(d){if(!d)return "";const n=Math.round((Date.now()-new Date(d+"T12:00:00").getTime())/864e5);
  return n<=0?"היום":n===1?"אתמול":n<7?`לפני ${n} ימים`:n<30?`לפני ${Math.round(n/7)} שב׳`:"לפני יותר מחודש"}
function scoreColor(s){return s>=80?"var(--green-ring)":s>=60?"var(--tint)":s>=40?"var(--orange-ring)":"var(--red-ring)"}
function st(id){const v=status[id]?.state;return typeof v==="string"&&Object.prototype.hasOwnProperty.call(STATES,v)?v:""}
// Everything below comes from scraped job boards or other viewers: treat it as untrusted and normalise before rendering.
function safeUrl(u){try{const x=new URL(String(u));return (x.protocol==="https:"||x.protocol==="http:")?x.href:"#"}catch(_){return "#"}}
const str=(v,n=200)=>typeof v==="string"?v.slice(0,n):"";
const strs=(a,n=4)=>Array.isArray(a)?a.filter(x=>typeof x==="string").slice(0,n).map(x=>x.slice(0,200)):[];
function cleanJob(id,d){d=d||{};const sc=Math.round(Number(d.score));return{id,title:str(d.title,160)||"משרה ללא כותרת",company:str(d.company,80),city:str(d.city,80),scope:str(d.scope,40),mode:str(d.mode,40),experience:str(d.experience,40),
  category:CATS.includes(d.category)?d.category:"שיווק כללי",source:str(d.source,30),url:safeUrl(d.url),postedAt:/^\d{4}-\d{2}-\d{2}$/.test(d.postedAt)?d.postedAt:"",runId:str(d.runId,20),
  score:Number.isFinite(sc)?Math.min(100,Math.max(0,sc)):0,reasons:strs(d.reasons),flags:strs(d.flags,3),tip:str(d.tip,400),letter:str(d.letter,1500)}}
function cleanStatus(d){d=d||{};return{state:typeof d.state==="string"?d.state:"",note:str(d.note,2000),updatedAt:str(d.updatedAt,40)}}
function isNew(j){return meta?.lastRunId? j.runId===meta.lastRunId : false}

function renderTabs(){
  const counts={today:jobs.filter(j=>isNew(j)&&st(j.id)!=="hidden").length,all:jobs.filter(j=>st(j.id)!=="hidden").length,
    saved:jobs.filter(j=>st(j.id)==="saved").length,journey:jobs.filter(j=>["applied","interview","offer","rejected"].includes(st(j.id))).length};
  $("tabs").innerHTML=TABS.map(t=>`<button class="tab" role="tab" id="tab-${t.id}" aria-selected="${ui.tab===t.id}" data-tab="${t.id}">${t.label}${counts[t.id]!=null?`<span class="n">${counts[t.id]}</span>`:""}</button>`).join("");
  $("sNew").textContent=loaded?counts.today:"–";$("sSaved").textContent=loaded?counts.saved:"–";
  $("sApplied").textContent=loaded?jobs.filter(j=>st(j.id)==="applied").length:"–";
  $("sInterview").textContent=loaded?jobs.filter(j=>["interview","offer"].includes(st(j.id))).length:"–";
}
function renderFilters(){
  if(ui.tab==="tips"){$("filters").innerHTML="";return}
  $("filters").innerHTML=CATS.map(c=>`<button class="chip" aria-pressed="${ui.cats.has(c)}" data-cat="${c}">${c}</button>`).join("")+
   `<button class="chip" aria-pressed="${ui.partOnly}" data-f="partOnly">חלקית / גמישה</button><button class="chip" aria-pressed="${ui.remoteOnly}" data-f="remoteOnly">מהבית / היברידי</button>`+
   `<input class="search" id="q" type="search" placeholder="חיפוש חברה, עיר, תפקיד" value="${esc(ui.q)}">`;
}
function filtered(){
  let list=jobs.slice();
  if(ui.tab==="today")list=list.filter(j=>isNew(j)&&st(j.id)!=="hidden");
  else if(ui.tab==="all")list=list.filter(j=>st(j.id)!=="hidden");
  else if(ui.tab==="saved")list=list.filter(j=>st(j.id)==="saved");
  else if(ui.tab==="journey")list=list.filter(j=>["applied","interview","offer","rejected"].includes(st(j.id)));
  if(ui.cats.size)list=list.filter(j=>ui.cats.has(j.category));
  if(ui.partOnly)list=list.filter(j=>/חלקית|גמיש|פרילנס|פרויקט/.test(j.scope||""));
  if(ui.remoteOnly)list=list.filter(j=>/בית|היברידי|מרחוק/.test(j.mode||""));
  if(ui.q){const q=ui.q.trim();list=list.filter(j=>[j.title,j.company,j.city,j.category].join(" ").includes(q))}
  const order={offer:0,interview:1,applied:2,rejected:3};
  if(ui.tab==="journey")list.sort((a,b)=>(order[st(a.id)]-order[st(b.id)])||((status[b.id]?.updatedAt||"").localeCompare(status[a.id]?.updatedAt||"")));
  else list.sort((a,b)=>(b.score-a.score)||(b.postedAt||"").localeCompare(a.postedAt||""));
  return list;
}
function card(j){
  const s=st(j.id),pressed=k=>s===k;
  const btn=(k,label)=>`<button class="act" data-set="${k}" data-id="${esc(j.id)}" aria-pressed="${pressed(k)}" ${readOnly?"disabled":""}>${label}</button>`;
  return `<article class="card ${s==="hidden"||s==="rejected"?"dim":""}">
    <div class="ring" title="ציון התאמה ${j.score} מתוך 100"><div class="score" style="--s:${j.score};--c:${scoreColor(j.score)}"></div><b>${j.score}</b></div>
    <div class="head">
      <div class="title"><a href="${esc(j.url)}" target="_blank" rel="noopener noreferrer">${esc(j.title)}</a>${isNew(j)?'<span class="newb">חדש</span>':""}</div>
      <div class="co">${esc(j.company||"חברה חסויה")} · ${esc(j.city)}</div>
    </div>
    <div class="meta">
      <span class="tag cat">${esc(j.category)}</span>
      ${j.scope?`<span class="tag">${esc(j.scope)}</span>`:""}${j.mode?`<span class="tag">${esc(j.mode)}</span>`:""}
      ${j.experience?`<span class="tag">ניסיון: ${esc(j.experience)}</span>`:""}
      <span class="tag">${esc(j.source)} · ${daysAgo(j.postedAt)}</span>
      ${s&&s!=="hidden"?`<span class="state st-${s}">${esc(STATES[s])}</span>`:""}
    </div>
    <div class="body">
      <ul class="why">${(j.reasons||[]).map(r=>`<li>${esc(r)}</li>`).join("")}${(j.flags||[]).map(r=>`<li class="flag">${esc(r)}</li>`).join("")}</ul>
      ${j.tip?`<div class="tip"><b>איך לבלוט:</b> ${esc(j.tip)}</div>`:""}
      <div class="actions">
        <button class="act primary" data-apply="${esc(j.id)}">הגשת מועמדות</button>
        <a class="act" href="${esc(j.url)}" target="_blank" rel="noopener noreferrer">למודעה ↗</a>
        ${btn("saved","☆ שמירה")}${btn("applied","הגשתי")}${btn("interview","יש ראיון")}${btn("offer","הצעה")}${btn("rejected","לא התקבלתי")}
        <button class="act ghost" data-set="hidden" data-id="${esc(j.id)}" aria-pressed="${pressed("hidden")}" ${readOnly?"disabled":""}>${s==="hidden"?"החזרה לרשימה":"לא מתאים לי"}</button>
      </div>
      ${s&&s!=="hidden"?`<textarea class="note" id="note-${esc(j.id)}" data-note="${esc(j.id)}" placeholder="הערות: עם מי דיברתי, מתי לחזור אליהם…" ${readOnly?"disabled":""}>${esc(status[j.id]?.note||"")}</textarea>`:""}
    </div>
  </article>`;
}
function tipsView(){const p=profile;return `<div class="tips">
  <section class="tipcard" id="me"><h3>הפרטים שלי להגשה</h3>
    <p class="fine">הפרטים נוספים אוטומטית בסוף כל מכתב פנייה. הם נשמרים רק בטלפון שלך ולא עולים לאינטרנט.</p>
    <div class="form">
      <label for="pf-name">שם מלא</label><input id="pf-name" data-pf="name" autocomplete="name" value="${esc(p.name)}" placeholder="תהילה">
      <label for="pf-phone">טלפון</label><input id="pf-phone" data-pf="phone" type="tel" autocomplete="tel" dir="ltr" value="${esc(p.phone)}" placeholder="050-0000000">
      <label for="pf-email">מייל</label><input id="pf-email" data-pf="email" type="email" autocomplete="email" dir="ltr" value="${esc(p.email)}" placeholder="name@gmail.com">
      <label for="pf-portfolio">קישור לתיק עבודות</label><input id="pf-portfolio" data-pf="portfolio" type="url" dir="ltr" value="${esc(p.portfolio)}" placeholder="https://instagram.com/…">
    </div>
  </section>
  <section class="tipcard"><h3>התיק שלך הוא היתרון הגדול</h3>
    <p>אין לך עדיין ניסיון רשמי, אבל יש לך משהו שרוב המועמדים לג׳וניור לא מביאים: צילום ועריכה טובים ועמוד עסקי שניהלת בעצמך.</p>
    <ul><li>אספי 6–9 עבודות (תמונות, רילס, פוסטים) לתיק אחד: היילייט באינסטגרם, תיקייה בדרייב או עמוד Canva.</li>
    <li>לכל עבודה כתבי שורה אחת: מה המטרה, מה עשית, ומה יצא (צפיות, עוקבים, פניות).</li>
    <li>שימי את הקישור לתיק בשורה הראשונה של קורות החיים ובכל פנייה.</li></ul></section>
  <section class="tipcard"><h3>קורות חיים בעמוד אחד</h3>
    <ul><li>כותרת: ״מנהלת סושיאל ויוצרת תוכן בתחילת הדרך | צילום ועריכת וידאו״.</li>
    <li>״ניהול עמוד עסקי עצמאי״ זה ניסיון. כתבי אותו כמו משרה, עם תאריכים ותוצאות.</li>
    <li>ציינו את לימודי השיווק והסושיאל שמתחילים בקרוב. מעסיקים אוהבים ג׳וניורית שלומדת.</li>
    <li>כלים: Canva, CapCut, Lightroom, Meta Business Suite, ומה שתלמדי בקורס.</li></ul></section>
  <section class="tipcard"><h3>איך מגישים בחצי דקה</h3>
    <ul><li>לוחצים ״הגשת מועמדות״ בכרטיס. מחכה שם מכתב פנייה שנכתב במיוחד למשרה הזו, ואפשר לערוך אותו.</li>
    <li>״העתקה ופתיחת המודעה״ מעתיק את המכתב, פותח את המודעה ומסמן ״הגשתי״.</li>
    <li>במודעה: מדביקים את המכתב בשדה ההודעה ומצרפים את קובץ קורות החיים מהטלפון.</li></ul></section>
  <section class="tipcard"><h3>קצב שעובד</h3>
    <ul><li>הגישי למשרות עם ציון 70 ומעלה כבר ביום שהן עולות. משרות ג׳וניור מתמלאות תוך ימים.</li>
    <li>אחרי הגשה סמני ״הגשתי״, ואם אין תשובה תוך שבוע שלחי הודעת המשך קצרה.</li>
    <li>משרה עם ״!״ כתום שווה בדיקה זהירה: לפעמים ״שיווק״ זה בעצם מכירות טלפוניות.</li></ul></section>
</div>`}
function emptyView(){
  if(!loaded)return `<div class="empty"><h3>טוענת משרות…</h3><p>עוד רגע מופיעות כאן ההצעות.</p></div>`;
  const m={today:["אין משרות חדשות מהסריקה האחרונה","הסריקה הבאה תרוץ מחר בשמונה בבוקר. בינתיים אפשר להציץ ב״כל המשרות״."],
    all:["עדיין אין משרות במאגר","אחרי הסריקה הראשונה יופיעו כאן כל המשרות שנמצאו."],
    saved:["אין משרות שמורות","לחצי ״☆ שמירה״ על משרה שמעניינת אותך והיא תחכה לך כאן."],
    journey:["עוד לא סימנת הגשות","אחרי שתגישי, לחצי ״הגשתי״ על המשרה. כאן תראי את כל התהליכים שלך במקום אחד."]}[ui.tab];
  const f=(ui.cats.size||ui.q||ui.partOnly||ui.remoteOnly)?"<p>יש סינון פעיל, נסי להסיר אותו.</p>":"";
  return `<div class="empty"><h3>${m[0]}</h3><p>${m[1]}</p>${f}</div>`;
}
function render(){
  renderTabs();renderFilters();
  if(ui.tab==="tips"){$("view").innerHTML=tipsView();return}
  const list=filtered();
  $("view").innerHTML=list.length?list.map(card).join(""):emptyView();
}
function renderRun(){
  if(!meta){return}
  const d=meta.lastRunAt?new Date(meta.lastRunAt):null;
  const when=d?d.toLocaleString("he-IL",{weekday:"long",hour:"2-digit",minute:"2-digit",day:"numeric",month:"numeric"}):"";
  $("run").innerHTML=`<span class="dot"></span><span>סריקה אחרונה: ${esc(when)} · נסרקו ${Number(meta.scanned)||0} מודעות, ${Number(meta.added)||0} חדשות נוספו</span>`;
}

document.addEventListener("click",async e=>{
  const t=e.target.closest("[data-tab]");if(t){ui.tab=t.dataset.tab;try{localStorage.setItem("jc-tab",ui.tab)}catch(_){};render();return}
  const c=e.target.closest("[data-cat]");if(c){const k=c.dataset.cat;ui.cats.has(k)?ui.cats.delete(k):ui.cats.add(k);render();return}
  const f=e.target.closest("[data-f]");if(f){ui[f.dataset.f]=!ui[f.dataset.f];render();return}
  const s=e.target.closest("[data-set]");if(s){
    const id=s.dataset.id,k=s.dataset.set,cur=st(id),next=cur===k?"":k;
    status[id]={...(status[id]||{}),state:next,updatedAt:new Date().toISOString()};
    saveStatus();render();
  }
});
document.addEventListener("input",e=>{if(e.target.id==="q"){ui.q=e.target.value;const pos=e.target.selectionStart;render();const q=$("q");q.focus();q.setSelectionRange(pos,pos)}});
document.addEventListener("change",e=>{
  const id=e.target.dataset?.note;if(!id)return;
  const note=e.target.value.slice(0,2000);if((status[id]?.note||"")===note)return;
  status[id]={...(status[id]||{}),note,updatedAt:new Date().toISOString()};saveStatus();
});
// Apply sheet: a tailored letter is ready to copy; she pastes it on the posting and attaches her CV.
const PROFILE="jobradar-profile-v1";
let profile=(()=>{try{const o=JSON.parse(localStorage.getItem(PROFILE)||"{}");return{name:str(o.name,80),phone:str(o.phone,30),email:str(o.email,120),portfolio:str(o.portfolio,300)}}catch(_){return{name:"",phone:"",email:"",portfolio:""}}})();
function saveProfile(){try{localStorage.setItem(PROFILE,JSON.stringify(profile))}catch(_){}}
function signature(){const p=profile;return [p.portfolio&&("תיק עבודות: "+p.portfolio),"",p.name||"תהילה",p.phone,p.email].filter((x,i)=>x||i===1).join("\n").replace(/^\n+/,"")}
function letterFor(j){
  const body=j.letter||`שלום,\nאני מגישה מועמדות לתפקיד ${j.title}${j.company&&j.company!=="חברה חסויה"?" ב"+j.company:""}.\nניהלתי עמוד עסקי משלי ברשתות, ואני חזקה במיוחד בצילום ועריכת וידאו לרשתות. בדצמבר אני מתחילה לימודי שיווק וסושיאל.\nמצרפת קורות חיים, ואשמח לשיחה.`;
  return body.trim()+"\n\n"+signature();
}
let applyJob=null;
function openApply(id){
  const j=jobs.find(x=>x.id===id);if(!j)return;applyJob=j;
  $("ap-title").textContent=j.title;$("ap-co").textContent=[j.company||"חברה חסויה",j.city].filter(Boolean).join(" · ");
  $("ap-letter").value=letterFor(j);$("ap-go").href=j.url;
  $("ap-nopf").hidden=!!profile.portfolio;
  const d=$("apply");if(typeof d.showModal==="function"){d.showModal()}else{d.setAttribute("open","")}
}
function closeApply(){const d=$("apply");if(d.open){typeof d.close==="function"?d.close():d.removeAttribute("open")}}
function copyLetter(){
  const ta=$("ap-letter"),t=ta.value;
  const fallback=()=>{ta.focus();ta.select();try{document.execCommand("copy")}catch(_){}};
  try{navigator.clipboard.writeText(t).catch(fallback)}catch(_){fallback()}
}
function toast(t){const el=$("toast");el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,2600)}
document.addEventListener("click",e=>{
  const a=e.target.closest("[data-apply]");if(a){openApply(a.dataset.apply);return}
  if(e.target.closest("#ap-go")&&applyJob){
    copyLetter();
    const id=applyJob.id;if(!["interview","offer"].includes(st(id))){status[id]={...(status[id]||{}),state:"applied",updatedAt:new Date().toISOString()};saveStatus()}
    closeApply();render();toast("המכתב הועתק. הדביקי אותו במודעה וצרפי קורות חיים");return}
  if(e.target.closest("#ap-copy")){copyLetter();toast("המכתב הועתק");return}
  if(e.target.closest("#ap-close")||e.target===$("apply")){closeApply();return}
  if(e.target.closest("#ap-editpf")){closeApply();ui.tab="tips";render();setTimeout(()=>$("pf-portfolio")?.focus(),50);return}
});
document.addEventListener("input",e=>{const k=e.target.dataset?.pf;if(k){profile[k]=e.target.value.slice(0,300);saveProfile()}});
function showBanner(t){const b=$("banner");b.textContent=t;b.hidden=false}

try{$("today-date").textContent=new Date().toLocaleDateString("he-IL",{weekday:"long",day:"numeric",month:"long"})}catch(_){}
render();
// Marks and notes live only on this device; nothing personal is sent anywhere.
const STORE="jobradar-status-v1";
function loadStatus(){try{const o=JSON.parse(localStorage.getItem(STORE)||"{}");const r={};for(const k of Object.keys(o).slice(0,2000))r[k]=cleanStatus(o[k]);return r}catch(_){return {}}}
function saveStatus(){try{localStorage.setItem(STORE,JSON.stringify(status))}catch(_){showBanner("הדפדפן לא מאפשר לשמור סימונים. אם את בגלישה פרטית, פתחי את האתר בחלון רגיל.")}}
status=loadStatus();
(async()=>{
  try{
    const r=await fetch("jobs.json?t="+Date.now(),{cache:"no-store"});
    if(!r.ok)throw new Error(r.status);
    const data=await r.json();
    meta=data&&typeof data.meta==="object"?data.meta:null;
    jobs=(Array.isArray(data?.jobs)?data.jobs:[]).slice(0,1000).filter(j=>j&&typeof j.id==="string"&&/^[A-Za-z0-9_-]{1,120}$/.test(j.id)).map(j=>cleanJob(j.id,j));
  }catch(_){showBanner("לא הצלחתי לטעון את המשרות. בדקי את החיבור ורענני את הדף.")}
  loaded=true;renderRun();render();
})();
if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
