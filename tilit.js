# /* =====================================================================
HÄTÄKESKUS — TILIT & MONIPELI + GOOGLE-SYNKRONOINTI  (tilit.js)

ASENNUS (yksi rivi):
Avaa index.html ja etsi <head>-osasta rivi jossa lukee leaflet.min.js:
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
Lisää HETI sen alapuolelle uusi rivi:
<script src="tilit.js"></script>
Tallenna. Laita tilit.js samaan kansioon kuin index.html.

Toimii heti paikallisesti (monta erillistä peliä). Google-synkka on
valinnainen: täytä FIREBASE_CONFIG alle (katso README).
===================================================================== */
(function(){
/* ====== LIITÄ OMA FIREBASE-CONFIG TÄHÄN (katso README) ====== */
var FIREBASE_CONFIG={
apiKey:“LIITA_TAHAN”,
authDomain:“LIITA_TAHAN.firebaseapp.com”,
projectId:“LIITA_TAHAN”,
storageBucket:“LIITA_TAHAN.appspot.com”,
messagingSenderId:“LIITA_TAHAN”,
appId:“LIITA_TAHAN”
};
/* =========================================================== */

var CONFIGURED = FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.indexOf(“LIITA”)<0;
function esc(s){return String(s==null?’’:s).replace(/[&<>”]/g,function(c){return {’&’:’&’,’<’:’<’,’>’:’>’,’”’:’"’}[c];});}

/* –– Kaappaa alkuperäiset tallennusfunktiot ENNEN nimeämistä –– */
var _lsGet=localStorage.getItem.bind(localStorage),
_lsSet=localStorage.setItem.bind(localStorage),
_lsDel=localStorage.removeItem.bind(localStorage);

/* –– Aktiivinen pelaaja + peli muistetaan, jotta sivun lataus osaa heti oikean tallennuksen –– */
var A=window.HKAcct={
uid:(_lsGet(‘hk_activeUid’)||‘local’),
slot:(_lsGet(‘hk_activeSlot’)||‘1’),
fbuid:null, user:null, db:null, auth:null, _pt:null,
slotsKey:function(){return ‘hk_slots::’+this.uid;},
getSlots:function(){try{return JSON.parse(_lsGet(this.slotsKey())||’[]’);}catch(e){return [];}},
saveSlots:function(arr){try{*lsSet(this.slotsKey(),JSON.stringify(arr));}catch(e){}
if(this.db&&this.fbuid&&this.uid===’u*’+this.fbuid)this.db.collection(‘users’).doc(this.fbuid).collection(‘meta’).doc(‘slots’).set({list:arr}).catch(function(){});},
ensureSlot:function(){var s=this.getSlots();if(!s.length){s=[{id:this.slot||‘1’,name:‘Peli 1’,created:Date.now(),lastPlayed:Date.now()}];this.saveSlots(s);}
if(!s.some(function(x){return x.id===A.slot;})){A.slot=s[0].id;*lsSet(‘hk_activeSlot’,A.slot);}},
newSlot:function(name){var s=this.getSlots();var id=‘g’+Date.now().toString(36)+Math.floor(Math.random()*900+99);
s.push({id:id,name:name||(‘Peli ‘+(s.length+1)),created:Date.now(),lastPlayed:Date.now()});this.saveSlots(s);return id;},
renameSlot:function(id,name){var s=this.getSlots(),it=s.filter(function(x){return x.id===id;})[0];if(it){it.name=name;this.saveSlots(s);}},
deleteSlot:function(id){var s=this.getSlots().filter(function(x){return x.id!==id;});this.saveSlots(s);
try{*lsDel(‘hatakeskus_code::’+this.uid+’::’+id);}catch(e){}
try{if(window.storage&&window.storage.delete)window.storage.delete(‘hatakeskus_v2::’+this.uid+’::’+id);}catch(e){}
if(this.db&&this.fbuid&&this.uid===’u*’+this.fbuid)this.db.collection(‘users’).doc(this.fbuid).collection(‘saves’).doc(id).delete().catch(function(){});},
/* Vaihda aktiivinen peli/pelaaja: tallenna nykyinen, muista valinta, lataa sivu uudelleen */
setActive:function(uid,slot){try{if(window.saveGame)saveGame(false);}catch(e){}
_lsSet(‘hk_activeUid’,uid);_lsSet(‘hk_activeSlot’,slot);
try{sessionStorage.removeItem(‘hk_pulledOnce’);}catch(e){}
location.reload();},
/* –– PILVI (Firestore) –– */
cloudDocSlot:function(slot){return this.db.collection(‘users’).doc(this.fbuid).collection(‘saves’).doc(slot);},
cloudPush:function(b64){if(!(this.db&&this.fbuid&&this.uid===’u*’+this.fbuid&&this.slot))return;var self=this;
clearTimeout(this.*pt);this.*pt=setTimeout(function(){self.cloudDocSlot(self.slot).set({data:b64,ts:Date.now()}).catch(function(){});},10000);},
cloudDeleteCur:function(){if(this.db&&this.fbuid&&this.uid===’u*’+this.fbuid&&this.slot)this.cloudDocSlot(this.slot).delete().catch(function(){});},
signIn:function(){if(!CONFIGURED){this.note(‘Google-kirjautuminen vaatii Firebase-asetukset (katso README).’);return;}
if(!this.auth){this.note(‘Hetki, kirjautuminen latautuu…’);return;}
var self=this;this.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(function(e){self.note(‘Kirjautuminen ei onnistunut: ‘+(e.message||e.code||’’));});},
signOut:function(){if(this.auth)this.auth.signOut();this.setActive(‘local’,*lsGet(‘hk_lastLocalSlot’)||‘1’);},
note:function(t){var n=document.getElementById(‘hkAccNote’);if(n)n.textContent=t||’’;},
uiNew:function(){var n=prompt(‘Uuden pelin nimi:’,‘Peli ‘+(this.getSlots().length+1));if(n===null)return;var id=this.newSlot((n||’’).trim());this.setActive(this.uid,id);},
uiRename:function(id){var it=this.getSlots().filter(function(x){return x.id===id;})[0];var n=prompt(‘Pelin nimi:’,it?it.name:’’);if(n===null)return;this.renameSlot(id,(n||’’).trim()||(it?it.name:‘Peli’));this.render();},
uiDelete:function(id){if(id===this.slot){this.note(‘Et voi poistaa peliä joka on nyt auki. Vaihda ensin toiseen.’);return;}var it=this.getSlots().filter(function(x){return x.id===id;})[0];if(!confirm(‘Poistetaanko peli “’+(it?it.name:’’)+’” pysyvästi?’))return;this.deleteSlot(id);this.render();},
open:function(){injectUI();this.render();document.getElementById(‘hkAccount’).style.display=‘flex’;},
close:function(){var el=document.getElementById(‘hkAccount’);if(el)el.style.display=‘none’;},
render:function(){
var slots=this.getSlots().slice().sort(function(a,b){return (b.lastPlayed||0)-(a.lastPlayed||0);});
var who=document.getElementById(‘hkAccWho’);
who.innerHTML=this.user
?’<span class="hk-dot ok"></span> Kirjautunut: <b>’+esc(this.user.displayName||this.user.email||‘Google-tili’)+’</b>’+(this.uid===’u*’+this.fbuid?’ · pelaat Google-pelejä’:’ · pelaat paikallisia pelejä’)
:’<span class="hk-dot"></span> Paikallinen pelaaja <span style="opacity:.6">(vain tällä laitteella)</span>’;
var list=document.getElementById(‘hkAccSlots’);
list.innerHTML=slots.length?slots.map(function(s){
var d=new Date(s.lastPlayed||s.created);
var dt=d.getDate()+’.’+(d.getMonth()+1)+’. klo ‘+String(d.getHours()).padStart(2,‘0’)+’:’+String(d.getMinutes()).padStart(2,‘0’);
var active=s.id===A.slot;
return ‘<div class="hk-slot'+(active?' hk-active':'')+'"><div class="hk-slot-main" onclick="HKAcct.setActive(HKAcct.uid,\''+s.id+'\')">’
+’<div class="hk-slot-name">’+esc(s.name)+(active?’ <span class="hk-now">· nyt auki</span>’:’’)+’</div><div class="hk-slot-meta">Viimeksi ‘+dt+’</div></div>’
+’<button class="hk-mini" title="Nimeä uudelleen" onclick="HKAcct.uiRename(\''+s.id+'\')">✎</button>’
+’<button class="hk-mini hk-danger" title="Poista" onclick="HKAcct.uiDelete(\''+s.id+'\')">🗑</button></div>’;
}).join(’’):’<div class="hk-empty">Ei vielä pelejä.</div>’;
var auth=document.getElementById(‘hkAccAuth’);
if(!CONFIGURED){auth.innerHTML=’<div class="hk-fb-off">☁ Google-synkronointi pois käytöstä. Pelit tallentuvat vain tähän laitteeseen. Ota Google käyttöön README-ohjeella.</div>’;}
else if(this.user){
var btn=’’;
if(this.uid!==’u*’+this.fbuid)btn=’<button class="hk-google" onclick="HKAcct.setActive(\'u_'+this.fbuid+'\',(HKAcct._firstCloudSlot||\'1\'))"><b>G</b> Siirry Google-peleihisi</button>’;
else btn=’<button class="hk-google" onclick="HKAcct.setActive(\'local\',(\''+(_lsGet('hk_lastLocalSlot')||'1')+'\'))">Siirry paikallisiin peleihin</button>’;
auth.innerHTML=btn+’<button class="hk-line" onclick="HKAcct.signOut()">Kirjaudu ulos</button>’;
}
else auth.innerHTML=’<button class="hk-google" onclick="HKAcct.signIn()"><b>G</b> Kirjaudu Google-tilillä</button><div class="hk-note">Kirjautuneena pelisi seuraavat sinua laitteelta toiselle.</div>’;
}
};

if(A.uid===‘local’)_lsSet(‘hk_lastLocalSlot’,A.slot);
A.ensureSlot();

/* –– TALLENNUSTILOJEN NIMEÄMINEN: jokainen peli/pelaaja oma erillinen –– */
function nk(key){return (typeof key===‘string’&&key.indexOf(‘hatakeskus_’)===0)?(key+’::’+A.uid+’::’+A.slot):key;}
localStorage.getItem=function(k){return _lsGet(nk(k));};
localStorage.setItem=function(k,v){var r=_lsSet(nk(k),v);try{if(typeof k===‘string’&&k.indexOf(‘hatakeskus_code’)===0)A.cloudPush(v);}catch(e){}return r;};
localStorage.removeItem=function(k){try{if(typeof k===‘string’&&k.indexOf(‘hatakeskus_code’)===0)A.cloudDeleteCur();}catch(e){}return _lsDel(nk(k));};
if(window.storage&&window.storage.get){
var _sg=window.storage.get.bind(window.storage),_ss=window.storage.set.bind(window.storage),_sd=window.storage.delete.bind(window.storage);
window.storage.get=function(k,sh){return _sg(nk(k),sh);};
window.storage.set=function(k,v,sh){return _ss(nk(k),v,sh);};
window.storage.delete=function(k,sh){return _sd(nk(k),sh);};
}

/* –– FIREBASE (valinnainen) –– */
function loadFirebase(){
if(window.firebase&&firebase.auth)return Promise.resolve();
var urls=[‘https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js’,
‘https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js’,
‘https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js’];
return urls.reduce(function(p,u){return p.then(function(){return new Promise(function(res,rej){
var s=document.createElement(‘script’);s.src=u;s.onload=res;s.onerror=rej;document.head.appendChild(s);});});},Promise.resolve());
}
function decode(b64){try{return JSON.parse(decodeURIComponent(escape(atob(b64))));}catch(e){return null;}}
function initFirebase(){
if(!CONFIGURED)return;
loadFirebase().then(function(){
try{
firebase.initializeApp(FIREBASE_CONFIG);A.auth=firebase.auth();A.db=firebase.firestore();
A.auth.onAuthStateChanged(function(u){
if(u){
A.user=u;A.fbuid=u.uid;
if(typeof G!==‘undefined’&&A.uid===‘u_’+u.uid)G.cloudEnabled=false; /* Firebase hoitaa pilven */
/* Hae käyttäjän pelilista pilvestä */
A.db.collection(‘users’).doc(u.uid).collection(‘meta’).doc(‘slots’).get().then(function(d){
if(d.exists&&d.data().list){try{*lsSet(’hk_slots::u*’+u.uid,JSON.stringify(d.data().list));}catch(e){}var l=d.data().list;A._firstCloudSlot=(l[0]&&l[0].id)||‘1’;}
else A._firstCloudSlot=‘1’;
A.render();
}).catch(function(){A.render();});
/* Jos pelaamme juuri tämän tilin peliä, hae uusin pilviversio (eri laite) */
if(A.uid===‘u_’+u.uid&&A.slot){
A.cloudDocSlot(A.slot).get().then(function(doc){
if(doc.exists&&doc.data().data){
var b64=doc.data().data;var cloud=decode(b64);
var localB64=_lsGet(‘hatakeskus_code::’+A.uid+’::’+A.slot);
var local=localB64?decode(localB64.length>0?atobSafe(localB64):’’):null;
var cloudTs=(cloud&&cloud.lastSaveTs)||0, localTs=(local&&local.lastSaveTs)||0;
if(cloud&&cloudTs>localTs+1000){
try{_lsSet(‘hatakeskus_code::’+A.uid+’::’+A.slot,b64);}catch(e){}
if(!sessionStorage.getItem(‘hk_pulledOnce’)){sessionStorage.setItem(‘hk_pulledOnce’,‘1’);location.reload();}
}
}
}).catch(function(){});
}
} else {
A.user=null;A.fbuid=null;A.render();
}
});
}catch(e){A.note(’Firebase-virhe: ’+e.message);}
}).catch(function(){A.note(‘Firebasen lataus ei onnistunut (offline?). Peli toimii paikallisesti.’);});
}
function atobSafe(s){try{return s;}catch(e){return ‘’;}}

/* –– UI –– */
function injectUI(){
if(document.getElementById(‘hkAccount’))return;
var css=document.createElement(‘style’);
css.textContent=` #hkAccount{position:fixed;inset:0;z-index:5000;background:radial-gradient(circle at 30% 18%,#12161c,#0a0c0f 72%);display:none;align-items:center;justify-content:center;padding:18px;font-family:var(--fui,system-ui)} #hkAccount .hk-card{width:100%;max-width:440px;background:var(--bg2,#12161c);border:1px solid var(--line2,#3a4b5c);border-radius:14px;box-shadow:0 24px 70px #000a;overflow:hidden;max-height:92vh;display:flex;flex-direction:column} #hkAccount .hk-top{padding:18px 20px 14px;border-bottom:1px solid var(--line2,#3a4b5c);background:linear-gradient(180deg,#141a21,#0e1217);position:relative;display:flex;align-items:center} #hkAccount .hk-top:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--acc,#ffb01f);box-shadow:0 0 12px var(--acc,#ffb01f)} #hkAccount .hk-logo{font-family:var(--fdisp,sans-serif);font-weight:700;letter-spacing:3px;font-size:22px;text-transform:uppercase;color:var(--txt,#eef3f7);flex:1} #hkAccount .hk-x{width:34px;height:34px;border:1px solid var(--line2,#3a4b5c);background:var(--bg3,#1a2129);color:var(--dim,#8696a6);border-radius:7px;cursor:pointer;font-size:16px} #hkAccount .hk-who{padding:11px 20px;font-size:13px;color:var(--dim,#8696a6);border-bottom:1px solid var(--line,#2b3947);display:flex;align-items:center;gap:8px} #hkAccount .hk-who b{color:var(--txt,#eef3f7)} #hkAccount .hk-dot{width:9px;height:9px;border-radius:50%;background:#5d6b79;flex:none} #hkAccount .hk-dot.ok{background:var(--acc2,#26d07c);box-shadow:0 0 8px var(--acc2,#26d07c)} #hkAccount .hk-body{padding:14px 16px;overflow-y:auto;flex:1} #hkAccount .hk-slot{display:flex;align-items:center;gap:6px;background:var(--bg3,#1a2129);border:1px solid var(--line,#2b3947);border-left:4px solid var(--acc,#ffb01f);border-radius:8px;padding:10px 11px;margin-bottom:8px} #hkAccount .hk-slot.hk-active{border-left-color:var(--acc2,#26d07c);background:#16241c} #hkAccount .hk-slot-main{flex:1;min-width:0;cursor:pointer} #hkAccount .hk-slot-name{font-weight:700;font-size:15px;color:var(--txt,#eef3f7)} #hkAccount .hk-now{color:var(--acc2,#26d07c);font-weight:600;font-size:12px} #hkAccount .hk-slot-meta{font-size:11.5px;color:var(--dim,#8696a6);font-family:var(--fmono,monospace);margin-top:2px} #hkAccount .hk-mini{width:38px;height:38px;flex:none;border:1px solid var(--line2,#3a4b5c);background:var(--bg2,#12161c);color:var(--dim,#8696a6);border-radius:7px;cursor:pointer;font-size:15px} #hkAccount .hk-mini:active{background:var(--acc,#ffb01f);color:#1a1200} #hkAccount .hk-mini.hk-danger:active{background:#ff3b3b;color:#fff} #hkAccount .hk-empty{color:var(--dim,#8696a6);text-align:center;padding:26px 8px;font-size:13.5px} #hkAccount .hk-foot{padding:12px 16px;border-top:1px solid var(--line2,#3a4b5c);background:#0e1217} #hkAccount .hk-new{width:100%;background:var(--acc2,#26d07c);color:#06210f;border:none;border-radius:9px;padding:14px 0;font-weight:800;font-size:16px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;box-shadow:0 0 18px #26d07c44} #hkAccount .hk-google{width:100%;display:flex;align-items:center;justify-content:center;gap:9px;background:#fff;color:#222;border:none;border-radius:9px;padding:12px 0;font-weight:700;font-size:14px;cursor:pointer;margin-top:10px} #hkAccount .hk-google b{display:inline-flex;width:22px;height:22px;align-items:center;justify-content:center;background:#4285F4;color:#fff;border-radius:50%;font-family:serif;font-weight:700} #hkAccount .hk-line{width:100%;background:var(--bg3,#1a2129);color:var(--dim,#8696a6);border:1px solid var(--line2,#3a4b5c);border-radius:8px;padding:10px 0;cursor:pointer;font-size:13px;margin-top:10px} #hkAccount .hk-fb-off{background:#1a1407;border:1px solid var(--acc,#ffb01f);border-radius:8px;padding:10px;color:#ffe9c2;font-size:12px;line-height:1.5;margin-top:10px} #hkAccount .hk-note{color:var(--dim,#8696a6);font-size:11.5px;text-align:center;margin-top:7px;line-height:1.5} #hkAccNote{color:#ff9a6a;font-size:12px;text-align:center;margin-top:8px;min-height:14px} #hkMenuBtn{position:fixed;left:8px;bottom:162px;z-index:559;background:#0d1217;border:1px solid var(--line2,#3a4b5c);color:var(--dim,#8696a6);border-radius:6px;padding:8px 11px;font-size:12px;cursor:pointer;font-weight:700;box-shadow:0 3px 12px #0009;font-family:var(--fui,sans-serif)} @media(min-width:900px){#hkMenuBtn{bottom:150px}}`;
document.head.appendChild(css);
var ov=document.createElement(‘div’);ov.id=‘hkAccount’;
ov.innerHTML=`<div class="hk-card"> <div class="hk-top"><span class="hk-logo">HÄTÄKESKUS</span><button class="hk-x" onclick="HKAcct.close()">&times;</button></div> <div class="hk-who" id="hkAccWho"></div> <div class="hk-body" id="hkAccSlots"></div> <div class="hk-foot"> <button class="hk-new" onclick="HKAcct.uiNew()">+ Uusi peli</button> <div id="hkAccAuth"></div> <div id="hkAccNote"></div> </div> </div>`;
document.body.appendChild(ov);
if(!document.getElementById(‘hkMenuBtn’)){
var mb=document.createElement(‘button’);mb.id=‘hkMenuBtn’;mb.textContent=‘👤 Pelit’;
mb.onclick=function(){HKAcct.open();};document.body.appendChild(mb);
}
}

function boot(){injectUI();initFirebase();}
if(document.readyState===‘loading’)document.addEventListener(‘DOMContentLoaded’,boot);
else boot();
})();
