/* UMBRA / Roman architectural study — procedural vector-like canvas renderer.
 * Geometry and lighting are original, and work without WebGL.
 */
const PI = Math.PI, rad = d => d * PI / 180;
const V = (x,y,z) => ({x,y,z});
const add = (a,b) => V(a.x+b.x,a.y+b.y,a.z+b.z);
const sub = (a,b) => V(a.x-b.x,a.y-b.y,a.z-b.z);
const mul = (a,s) => V(a.x*s,a.y*s,a.z*s);
const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
const cross = (a,b) => V(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const norm = a => mul(a,1/(Math.hypot(a.x,a.y,a.z)||1));
const avg = a => mul(a.reduce((q,p)=>add(q,p),V(0,0,0)),1/a.length);
const PALETTES = {
  limestone:{sky:'#eae2d2',ground:'#eee6d5',lit:'#ede9dd',dark:'#28312b',ink:'#30342f',grid:'#797e70',fine:'#807f71'},
  terracotta:{sky:'#efd3bb',ground:'#efdbca',lit:'#f4d3b6',dark:'#704435',ink:'#563b33',grid:'#9b7965',fine:'#917664'},
  cyanotype:{sky:'#d9e2e5',ground:'#dce5e9',lit:'#dcecf0',dark:'#21465c',ink:'#294c5b',grid:'#7c9ba7',fine:'#7794a1'}
};

class Model {
  constructor(){this.faces=[];this.shadowCasters=[];this.lines=[];}
  polygon(vertices,normal=V(0,0,1),outline=true,shade=null){this.faces.push({vertices,normal,outline,shade,center:avg(vertices)});}
  quad(a,b,c,d,normal,outline=true){this.polygon([a,b,c,d],normal,outline);}
  box(cx,cy,cz,w,h,d,opts={}){
    if(w<=0||h<=0||d<=0)return;
    const x0=cx-w/2,x1=cx+w/2,y0=cy-h/2,y1=cy+h/2,z0=cz-d/2,z1=cz+d/2;
    const A=V(x0,y0,z0),B=V(x1,y0,z0),C=V(x1,y1,z0),D=V(x0,y1,z0),E=V(x0,y0,z1),F=V(x1,y0,z1),G=V(x1,y1,z1),H=V(x0,y1,z1);
    this.quad(E,F,G,H,V(0,0,1),opts.outline!==false);this.quad(B,A,D,C,V(0,0,-1),opts.outline!==false);
    this.quad(A,E,H,D,V(-1,0,0),opts.outline!==false);this.quad(F,B,C,G,V(1,0,0),opts.outline!==false);
    this.quad(D,H,G,C,V(0,1,0),opts.outline!==false);this.quad(A,B,F,E,V(0,-1,0),false);
    if(opts.shadow)this.shadowCasters.push({x:cx,z:cz,w,d,h:cy+h/2});
  }
  cylinder(cx,bottom,cz,r0,r1,h,n=18,opts={}){
    const top=bottom+h;
    for(let i=0;i<n;i++){
      const a=i/n*PI*2,b=(i+1)/n*PI*2,m=(a+b)/2;
      this.quad(V(cx+Math.cos(a)*r0,bottom,cz+Math.sin(a)*r0),V(cx+Math.cos(b)*r0,bottom,cz+Math.sin(b)*r0),V(cx+Math.cos(b)*r1,top,cz+Math.sin(b)*r1),V(cx+Math.cos(a)*r1,top,cz+Math.sin(a)*r1),V(Math.cos(m),0,Math.sin(m)),opts.outline!==false);
    }
    const cap=[];for(let j=0;j<n;j++)cap.push(V(cx+Math.cos(j/n*2*PI)*r1,top,cz+Math.sin(j/n*2*PI)*r1));
    this.polygon(cap,V(0,1,0),opts.outline!==false);
    if(opts.shadow)this.shadowCasters.push({x:cx,z:cz,w:r0*2,d:r0*2,h:top});
  }
  arch(cx,cz,inner=2.1,ring=.65,spring=4.7,thick=1.3,opts={}){
    const seg=12,outer=inner+ring,front=cz+thick/2,back=cz-thick/2;
    for(let i=0;i<seg;i++){
      const t0=i/seg*PI,t1=(i+1)/seg*PI;
      const circle=(r,t,z)=>V(cx+Math.cos(t)*r,spring+Math.sin(t)*r,z);
      this.polygon([circle(inner,t0,front),circle(outer,t0,front),circle(outer,t1,front),circle(inner,t1,front)],V(0,0,1),true);
      this.polygon([circle(outer,t1,back),circle(outer,t0,back),circle(outer,t0,front),circle(outer,t1,front)],V(Math.cos((t0+t1)/2),Math.sin((t0+t1)/2),0),false);
      this.polygon([circle(inner,t0,front),circle(inner,t1,front),circle(inner,t1,back),circle(inner,t0,back)],V(-Math.cos((t0+t1)/2),-Math.sin((t0+t1)/2),0),false);
      this.polygon([circle(outer,t0,back),circle(inner,t0,back),circle(inner,t1,back),circle(outer,t1,back)],V(0,0,-1),true);
    }
    // The solid wall surrounding the opening begins at either side, never across its clear span.
    if(opts.soffit!==false)for(const s of [-1,1]){
      const x=cx+s*(inner+ring*.52);
      this.box(x,spring/2,cz,ring*1.12,spring,thick,{shadow:true});
      this.box(x,spring+ring*.12,cz,ring*.92,ring*.35,thick+.13);
    }
  }
  column(x,z,h=5,r=.36,opts={}){
    const elev=opts.elevation||0;
    this.box(x,elev+.15,z,r*3.1,.30,r*3.1,{shadow:true});
    this.box(x,elev+.34,z,r*2.55,.12,r*2.55);
    this.cylinder(x,elev+.4,z,r*.91,r*.79,h-.89,16,{shadow:true,outline:false});
    // flute stroke lines from the near face; world anchored, stable while the camera moves
    for(let i=0;i<12;i++){
      const a=i/12*2*PI;
      this.lines.push({a:V(x+Math.cos(a)*r*.806,elev+.62,z+Math.sin(a)*r*.806),b:V(x+Math.cos(a)*r*.784,elev+h-.73,z+Math.sin(a)*r*.784),soft:true});
    }
    this.cylinder(x,elev+h-.5,z,r*.86,r*1.12,.32,16,{outline:false});
    this.box(x,elev+h-.23,z,r*2.8,.29,r*2.8);
    this.box(x,elev+h-.055,z,r*3.05,.10,r*3.05);
  }
  cypress(x,z,h=5.2){
    const rr=.72;
    this.cylinder(x,0,z,.10,.10,.7,8,{outline:false});
    this.cylinder(x,.55,z,rr,.04,h-.55,12,{outline:false,shadow:true});
  }
  steps(cx,z,w,d,n=4,height=.24){
    for(let i=0;i<n;i++)this.box(cx,height*(i+.5),z+i*d/n/2,w-i*.19,height,d-i*d/n,{shadow:i===n-1});
  }
  inscription(cx,y,cz,w,count=9){
    for(let i=0;i<count;i++)this.box(cx+(i-(count-1)/2)*w/(count+.25),y,cz,.11,.20,.08,{outline:false});
  }
  ceilingBorder(cx,y,cz,w,d){
    this.box(cx,y,cz,w,.16,d);this.box(cx,y+.12,cz,w+.2,.1,d+.18);this.box(cx,y-.11,cz,w-.1,.08,d-.08);
  }
}

function forum(){
  const m=new Model();
  // Forum porticoes flank a clear long axis. A single long set of columns collapses on a telephoto view.
  for(const side of [-1,1]){
    const x=side*7.6,depth=side===-1?19:13,front=side===-1?8:7,back=front-depth;
    m.steps(x,front+2,5.9,4,3,.20);
    for(let z=back+1;z<=front+.4;z+=2.45)for(const dx of [-1.63,1.63])m.column(x+dx,z,5.65,.30);
    m.box(x,6.02,(back+front)/2,5.48,.32,depth+1.0,{shadow:true});
    m.ceilingBorder(x,6.38,(back+front)/2,5.85,depth+1.3);
    m.box(x,6.11,(back+front)/2,5.55,.12,depth+1.1);
    // entablature notches / triglyph rhythm on the near and far fascia
    for(let z=back+1;z<front;z+=.75)for(const dx of [-2.4,2.4])m.box(x+dx,6.23,z,.08,.22,.26,{outline:false});
  }
  // The hero triumphal arch, behind the open central walkway.
  const z=-14;
  m.steps(0,z+2.4,9.2,4.9,3,.23);
  m.arch(0,z,2.10,.83,5.15,2.35);
  m.box(-3.23,4.32,z,1.42,8.65,2.35,{shadow:true});
  m.box(3.23,4.32,z,1.42,8.65,2.35,{shadow:true});
  for(const x of [-3.6,-2.72,2.72,3.6]){
    m.column(x,z+1.22,7.68,.30);
  }
  m.box(0,8.88,z,9.3,.48,3.10,{shadow:true});
  m.box(0,9.66,z,9.47,1.12,2.96,{shadow:true});
  m.ceilingBorder(0,10.38,z,9.95,3.18);
  m.inscription(0,9.48,z+1.55,3.7,10);
  for(let i=0;i<9;i++)m.box(-4.35+i*1.1,8.93,z+1.65,.14,.23,.07,{outline:false});
  // distant side wall and vegetation
  m.box(12.4,2.2,-19,10,4.4,2.1,{shadow:true});
  for(const [x,z,h] of [[13,-11.7,6.1],[15.2,-13.3,7.3],[18,-17.2,5.2]])m.cypress(x,z,h);
  m.box(-16,1.2,-18,6,2.4,4,{shadow:true});
  return m;
}
function pantheon(){
  const m=new Model();
  // The dome: an original low-poly hemispherical surface, articulated into horizontal bands.
  const R=7.5,cz=-7.6;
  m.cylinder(0,.4,cz,R,R,6.65,36,{outline:false,shadow:true});
  for(let j=0;j<7;j++){
    const t0=j/7*PI/2,t1=(j+1)/7*PI/2;
    const r0=R*Math.cos(t0),r1=R*Math.cos(t1),y0=7.1+R*.70*Math.sin(t0),y1=7.1+R*.70*Math.sin(t1);
    for(let i=0;i<36;i++){
      const a=i/36*2*PI,b=(i+1)/36*2*PI,mid=(a+b)/2;
      const vert=[V(r0*Math.cos(a),y0,cz+r0*Math.sin(a)),V(r0*Math.cos(b),y0,cz+r0*Math.sin(b)),V(r1*Math.cos(b),y1,cz+r1*Math.sin(b)),V(r1*Math.cos(a),y1,cz+r1*Math.sin(a))];
      m.polygon(vert,norm(V(Math.cos(mid)*.7,.4+Math.sin((t0+t1)/2),Math.sin(mid)*.7)),j%2===0&&i%3===0);
    }
  }
  m.cylinder(0,6.65,cz,R+.20,R+.20,.46,36,{outline:false});
  for(let i=0;i<18;i++){
    const a=i/18*2*PI;m.box(Math.cos(a)*(R+.10),6.10,cz+Math.sin(a)*(R+.1),.45,.35,.22,{outline:false});
  }
  // Monumental front porch at z=5. The triangular pediment reads as a classical temple.
  m.steps(0,9.2,16.5,7.5,6,.22);
  for(const z of [2.45,6.15])for(const x of [-6.45,-3.9,-1.3,1.3,3.9,6.45])m.column(x,z,7.35,.37,{elevation:1.12});
  m.box(0,8.60,4.3,15.4,.66,6.6,{shadow:true});
  m.box(0,9.33,4.3,16,1.01,6.75,{shadow:true});
  m.ceilingBorder(0,9.97,4.3,16.5,7);
  // Pediment sloped triangular front, with thick cornice strokes
  m.polygon([V(-8.3,10.05,8.0),V(8.3,10.05,8.0),V(0,12.5,8.0)],V(0,0,1),true);
  m.polygon([V(-8.3,10.05,8.0),V(0,12.5,8.0),V(0,12.5,6.2),V(-8.3,10.05,6.2)],norm(V(-.3,.9,0)),true);
  m.polygon([V(0,12.5,8),V(8.3,10.05,8),V(8.3,10.05,6.2),V(0,12.5,6.2)],norm(V(.3,.9,0)),true);
  m.inscription(0,9.35,8.0,8.0,16);
  m.box(-14.3,2.5,-10,5.2,5,5,{shadow:true});m.box(14.3,2.0,-11,4.3,4,5,{shadow:true});
  m.cypress(-17,-13,5.5);m.cypress(16,-15,7.7);
  return m;
}
function aqueduct(){
  const m=new Model(), z=-4.5,thick=2.4;
  for(const [level,spacing,r,ring,base] of [[0,5.3,1.75,.60,4.3],[1,4.18,1.36,.43,9.5]]){
    const count=level===0?7:9;
    for(let k=0;k<count;k++){
      const x=(k-(count-1)/2)*spacing;
      m.arch(x,z,r,ring,base,thick,{soffit:true});
    }
    const bandY=level===0?7.25:12.50;
    m.box(0,bandY,z,(count-1)*spacing+spacing*.97,.42,thick+.6,{shadow:true});
    m.ceilingBorder(0,bandY+.35,z,(count-1)*spacing+spacing,thick+.6);
  }
  for(const x of [-18.4,18.4])m.box(x,4.1,z,2.2,8.2,4.1,{shadow:true});
  // Small foreground remnants create a close/far reveal.
  for(const [x,z0,h] of [[-12.8,7,2.4],[-10,8.1,3.8],[15.6,5.6,3.1]]){
    m.box(x,h/2,z0,1.25,h,1.25,{shadow:true});m.box(x,h+.18,z0,1.6,.3,1.6);
  }
  for(const [x,z0,h] of [[-21,-13,7],[22,-11,5.2],[-23,-4,4.8],[25,-16,8]])m.cypress(x,z0,h);
  m.steps(0,12,11,6.2,3,.18);
  return m;
}
const MODELS=[forum(),pantheon(),aqueduct()];

function convexHull(points){
  const pts=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y);
  const cr=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lo=[],hi=[];for(const p of pts){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p)}
  for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(hi.length>=2&&cr(hi[hi.length-2],hi[hi.length-1],p)<=0)hi.pop();hi.push(p)}lo.pop();hi.pop();return lo.concat(hi);
}
export const SCENES=[
  {latin:'FORUM ROMANUM',title:'永恒柱廊',caption:'柱列交错，光穿过秩序。'},
  {latin:'SUB CUPOLA',title:'穹顶之下',caption:'把天空收进一座石质穹顶。'},
  {latin:'ARCADES TEMPORIS',title:'时间拱廊',caption:'重复的拱，丈量时间的回声。'}
];
export class RomanRenderer{
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.params={scene:0,palette:'limestone',azimuth:135,altitude:28,depth:65,yaw:-6,pitch:8};this.dpr=Math.min(window.devicePixelRatio||1,2);this.render();}
  set(next){Object.assign(this.params,next);this.render();}
  scene(){return MODELS[this.params.scene];}
  camera(width,height){
    const yaw=rad(this.params.yaw),pitch=rad(this.params.pitch),target=V(0,4.85,0),D=36;
    const eye=V(Math.sin(yaw)*D*Math.cos(pitch)+target.x,Math.sin(pitch)*D+target.y,Math.cos(yaw)*D*Math.cos(pitch)+target.z);
    const forward=norm(sub(target,eye)),right=norm(cross(forward,V(0,1,0))),up=norm(cross(right,forward));
    const scale=Math.min(width/35,height/15.95);
    return {eye,forward,right,up,target,D,scale,center:V(width*.50,height*.565,0),strength:this.params.depth/100};
  }
  project(v,c){
    const rel=sub(v,c.target),px=dot(rel,c.right),py=dot(rel,c.up),pz=dot(rel,c.forward);
    const perspective=c.D/(c.D + pz*c.strength*.95);
    const zoom=Math.max(.36,Math.min(3.6,perspective));
    return {x:c.center.x+px*c.scale*zoom,y:c.center.y-py*c.scale*zoom,dist:pz};
  }
  drawPolygon(ctx,coords,fill,stroke=null,line=1){
    if(coords.length<3)return;ctx.beginPath();ctx.moveTo(coords[0].x,coords[0].y);for(let i=1;i<coords.length;i++)ctx.lineTo(coords[i].x,coords[i].y);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.lineJoin='round';ctx.stroke();}
  }
  drawLine(ctx,a,b,color,line){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=color;ctx.lineWidth=line;ctx.stroke();}
  renderTo(ctx,width,height){
    const palette=PALETTES[this.params.palette],c=this.camera(width,height),m=this.scene(),s=Math.max(.5,width/1200);
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle=palette.sky;ctx.fillRect(0,0,width,height);
    const horizon=height*.333;
    ctx.fillStyle=palette.ground;ctx.fillRect(0,horizon,width,height-horizon);
    this.drawLine(ctx,{x:0,y:horizon},{x:width,y:horizon},palette.fine,.65*s);
    // Plaza: a sparse world-space construction grid, rather than a photograph texture.
    ctx.save();ctx.beginPath();ctx.rect(0,horizon,width,height-horizon);ctx.clip();
    ctx.globalAlpha=.55;
    for(let x=-52;x<=52;x+=3.8){this.drawLine(ctx,this.project(V(x,0,-33),c),this.project(V(x,0,33),c),palette.grid,.75*s);}
    for(let z=-30;z<=26;z+=3.8){this.drawLine(ctx,this.project(V(-52,0,z),c),this.project(V(52,0,z),c),palette.grid,.75*s);}
    ctx.restore();
    // Cast-shadow polygons are constructed from actual world-space caster bounds and sun direction.
    const az=rad(this.params.azimuth),alt=rad(this.params.altitude);
    const sun=norm(V(Math.cos(az)*Math.cos(alt),Math.sin(alt),Math.sin(az)*Math.cos(alt)));
    ctx.save();ctx.beginPath();ctx.rect(0,horizon,width,height-horizon);ctx.clip();
    for(const sh of m.shadowCasters){
      const dx=-(sun.x/sun.y)*sh.h,dz=-(sun.z/sun.y)*sh.h;
      const corners=[V(sh.x-sh.w/2,0,sh.z-sh.d/2),V(sh.x+sh.w/2,0,sh.z-sh.d/2),V(sh.x+sh.w/2,0,sh.z+sh.d/2),V(sh.x-sh.w/2,0,sh.z+sh.d/2)];
      const hull=convexHull([...corners,...corners.map(p=>V(p.x+dx,0,p.z+dz))].map(p=>this.project(p,c)));
      this.drawPolygon(ctx,hull,palette.dark,null);
    }
    ctx.restore();
    // Painter's algorithm on world-space polygons. Face normals receive a strict binary light mask.
    const faces=m.faces.filter(face=>dot(face.normal,sub(c.eye,face.center))>-1.1).map(face=>({face,depth:dot(sub(face.center,c.eye),c.forward)}));
    faces.sort((a,b)=>b.depth-a.depth);
    for(const {face} of faces){
      const bright=dot(face.normal,sun)>.1;
      const fill=face.shade || (bright?palette.lit:palette.dark);
      const outline=face.outline?(bright?palette.ink:palette.dark):null;
      const coords=face.vertices.map(v=>this.project(v,c));
      this.drawPolygon(ctx,coords,fill,outline,bright?.64*s:.25*s);
    }
    // Fluting: rendered only for the visible front half of each shaft.
    ctx.lineCap='round';ctx.globalAlpha=.48;
    for(const l of m.lines){
      const midpoint=mul(add(l.a,l.b),.5);
      if(dot(sub(c.eye,midpoint),V(l.a.x-Math.round(l.a.x),0,l.a.z-Math.round(l.a.z)))< -999)continue;
      const a=this.project(l.a,c),b=this.project(l.b,c);
      this.drawLine(ctx,a,b,palette.fine,.4*s);
    }
    ctx.globalAlpha=1;
    // Ink geometry in two shades, no overlays or UI baked into the export.
  }
  render(){
    const rect=this.canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const dpr=this.dpr,width=Math.max(1,Math.round(rect.width*dpr)),height=Math.max(1,Math.round(rect.height*dpr));
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    const ctx=this.ctx;ctx.setTransform(1,0,0,1,0,0);this.renderTo(ctx,width,height);
  }
  async exportPng(){
    const width=3840,height=Math.round(width/2.24),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{alpha:false});this.renderTo(ctx,width,height);
    return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG 输出失败')),'image/png'));
  }
}