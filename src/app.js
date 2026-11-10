import { RomanRenderer, SCENES } from './scene.js';
const $ = q => document.querySelector(q);
const $$ = q => [...document.querySelectorAll(q)];
const art=$('#art'),frame=$('#art-frame'),renderer=new RomanRenderer(art);
const defaults={azimuth:135,altitude:28,depth:65,yaw:-6,pitch:8,scene:0,palette:'limestone'};
const toast = (message) => { const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>el.classList.remove('show'),2700); };
function syncLabels(){
  for(const [key,suffix] of [['azimuth','°'],['altitude','°'],['depth','%']]){$('#'+key).value=renderer.params[key];$('#'+key+'-value').textContent=renderer.params[key]+suffix;}
  const s=renderer.params.scene,info=SCENES[s];
  $('#plaque-number').textContent=['I.','II.','III.'][s];$('#plaque-latin').textContent=info.latin;$('#plaque-zh').textContent=info.title;
  $('#scene-caption').textContent=info.caption;$('#art-counter').textContent=String(s+1).padStart(2,'0');
  $$('.scene-tab').forEach((b,i)=>{let active=i===s;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
  $$('.palette-choice').forEach(b=>{let active=b.dataset.palette===renderer.params.palette;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
}
for(const key of ['azimuth','altitude','depth']){
  $('#'+key).addEventListener('input',e=>{renderer.set({[key]:Number(e.target.value)});syncLabels();});
}
$$('.scene-tab').forEach((b,i)=>{
  b.addEventListener('click',()=>{renderer.set({scene:i});syncLabels();});
  b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const s=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;$$('.scene-tab')[s].focus();renderer.set({scene:s});syncLabels();});
});
$$('.palette-choice').forEach(b=>b.addEventListener('click',()=>{renderer.set({palette:b.dataset.palette});syncLabels();}));
$('#reset').addEventListener('click',()=>{renderer.set(defaults);syncLabels();stopTour();toast('光影参数已恢复初始构图');});
let drag=null;
art.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,yaw:renderer.params.yaw,pitch:renderer.params.pitch};art.setPointerCapture(e.pointerId);art.style.cursor='grabbing';});
art.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const yaw=Math.max(-70,Math.min(70,drag.yaw+(e.clientX-drag.x)*.20));const pitch=Math.max(-5,Math.min(24,drag.pitch+(e.clientY-drag.y)*.13));renderer.set({yaw,pitch});});
function endDrag(e){if(drag&&e.pointerId===drag.id){drag=null;art.style.cursor='grab';}}
art.addEventListener('pointerup',endDrag);art.addEventListener('pointercancel',endDrag);art.addEventListener('lostpointercapture',()=>{drag=null;art.style.cursor='grab';});
let touring=false,tourRAF=0,tourStart=0,tourBase=0;
function tourStep(ts){if(!touring)return;renderer.set({yaw:Math.max(-70,Math.min(70,tourBase+Math.sin((ts-tourStart)*.00018)*13))});tourRAF=requestAnimationFrame(tourStep);}
function stopTour(){touring=false;cancelAnimationFrame(tourRAF);$('#tour').setAttribute('aria-pressed','false');$('#tour-symbol').textContent='▶';$('#tour-label').textContent='缓慢巡游';}
$('#tour').addEventListener('click',()=>{if(touring){stopTour();return;}touring=true;tourBase=renderer.params.yaw;tourStart=performance.now();$('#tour').setAttribute('aria-pressed','true');$('#tour-symbol').textContent='Ⅱ';$('#tour-label').textContent='停止巡游';tourRAF=requestAnimationFrame(tourStep);});
$('#fullscreen').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else if(frame.requestFullscreen)await frame.requestFullscreen();else frame.classList.toggle('is-fullscreen');}
  catch{frame.classList.toggle('is-fullscreen');}
  renderer.render();
});
document.addEventListener('fullscreenchange',()=>renderer.render());
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&frame.classList.contains('is-fullscreen')){frame.classList.remove('is-fullscreen');renderer.render();}});
async function exportArtwork(){
  const buttons=$$('[data-action="export"]');buttons.forEach(b=>{b.disabled=true;b.style.opacity='.6';});
  try{
    toast('正在生成 3840px PNG 作品…');
    const blob=await renderer.exportPng();const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`UMBRA-${SCENES[renderer.params.scene].latin.toLowerCase().replace(/\W+/g,'-')}-${renderer.params.palette}-3840.png`;
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);toast('已导出 3840px 高清光影作品');
  }catch(err){console.error(err);toast('导出失败，请检查浏览器存储空间并重试');}
  finally{buttons.forEach(b=>{b.disabled=false;b.style.opacity='';});}
}
$$('[data-action="export"]').forEach(b=>b.addEventListener('click',exportArtwork));
new ResizeObserver(()=>renderer.render()).observe(frame);
window.addEventListener('resize',()=>renderer.render(),{passive:true});
syncLabels();