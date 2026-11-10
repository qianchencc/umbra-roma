"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { buildRomanScene, ROMAN_FRAMING, type SceneId } from "../lib/roman-geometry";
import { createSoftwareRuntime } from "../lib/software-renderer";

export type StudioSettings = {
  scene: SceneId;
  palette: "limestone" | "terracotta" | "cyanotype";
  azimuth: number;
  altitude: number;
  perspective: number;
  autoRotate: boolean;
};

export type ViewerHandle = {
  exportPNG: () => Promise<void>;
  resetView: () => void;
};

type ViewerProps = {
  settings: StudioSettings;
  onReady?: () => void;
  onError?: (message: string) => void;
  onViewChange?: (yaw: number) => void;
};

type Runtime = {
  update: (settings: StudioSettings) => void;
  exportPNG: () => Promise<void>;
  reset: () => void;
  dispose: () => void;
};

const PALETTES = {
  limestone: { paper: "#e8e0cd", ink: "#31382f" },
  terracotta: { paper: "#f0d5ba", ink: "#8d432d" },
  cyanotype: { paper: "#e3e9df", ink: "#244c65" },
};

// Light is quantized after shadowing: both cast shadows and unlit faces belong
// to the same ink field. Depth and normal edges retain architectural detail.
const fragmentShader = `
  uniform sampler2D illumination, normals, depths;
  uniform vec2 resolution;
  uniform vec3 paper, ink;
  uniform float cameraNear, cameraFar, lineScale;
  varying vec2 vUv;
  float linearDepth(float d) {
    return cameraNear * cameraFar / (cameraFar - d * (cameraFar-cameraNear));
  }
  vec3 srgb(vec3 c) {
    return mix(c*12.92, 1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-.055,step(.0031308,c));
  }
  float architecturalEdge(vec2 uv) {
    float dc = texture2D(depths,uv).r;
    bool sky = dc > .99999;
    float zc = linearDepth(dc);
    vec3 nc = texture2D(normals,uv).xyz*2.0-1.0;
    float edge = 0.0;
    for (int axis=0;axis<2;axis++) {
      vec2 offset = (axis==0 ? vec2(1.,0.) : vec2(0.,1.)) * lineScale / resolution;
      float da = texture2D(depths,uv+offset).r;
      float db = texture2D(depths,uv-offset).r;
      bool sa = da > .99999, sb = db > .99999;
      if (sky != sa || sky != sb) { edge = 1.0; }
      else if (!sky) {
        float za = linearDepth(da), zb = linearDepth(db);
        float curvature = abs(za+zb-2.0*zc)/max(zc,1.0);
        edge = max(edge,smoothstep(.002,.012,curvature));
        vec3 na = texture2D(normals,uv+offset).xyz*2.0-1.0;
        vec3 nb = texture2D(normals,uv-offset).xyz*2.0-1.0;
        float discontinuity = 1.0-min(dot(nc,na),dot(nc,nb));
        edge = max(edge,smoothstep(.28,.70,discontinuity));
      }
    }
    return edge;
  }
  void main() {
    float depth = texture2D(depths,vUv).r;
    float lightValue = texture2D(illumination,vUv).r;
    float aa = max(fwidth(lightValue)*.65,.006);
    float lit = smoothstep(.19-aa,.19+aa,lightValue);
    if (depth > .99999) lit = 1.0;
    float edge = architecturalEdge(vUv);
    vec3 color = mix(ink,paper,lit*(1.0-edge));
    gl_FragColor = vec4(srgb(color),1.0);
  }
`;

function createRuntime(
  container: HTMLDivElement,
  initial: StudioSettings,
  callbacks: { ready: () => void; error: (text: string) => void; view: (yaw: number) => void },
): Runtime {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-label", "古罗马建筑光影作品。左右拖动或使用左右方向键旋转视角。");
  canvas.setAttribute("role", "img");
  canvas.tabIndex = 0;
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab;outline-offset:-4px";
  container.appendChild(canvas);

  let settings = { ...initial };
  let disposed = false;
  let exporting = false;
  let frame = 0;
  let width = 1, height = 1;
  let yaw = .34;
  let desiredYaw = yaw;
  let animationStart = 0;
  let animationBase = yaw;
  let currentPerspective = settings.perspective;
  let isVisible = true;
  let pointer: { id: number; x: number; yaw: number } | null = null;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30,1,1,1500);
  const light = new THREE.DirectionalLight(0xffffff,Math.PI*2);
  light.castShadow = true;
  light.shadow.mapSize.set(4096,4096);
  light.shadow.camera.left = -44;
  light.shadow.camera.right = 44;
  light.shadow.camera.top = 42;
  light.shadow.camera.bottom = -42;
  light.shadow.camera.near = 1;
  light.shadow.camera.far = 160;
  light.shadow.normalBias = .035;
  light.shadow.bias = -.00008;
  light.shadow.radius = 1;
  light.target.position.set(0,0,-8);
  scene.add(light,light.target);

  const materials = {
    stone: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    dark: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    ground: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    accent: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  };
  let architecture = buildRomanScene(settings.scene,materials);
  scene.add(architecture);
  const normalMaterial = new THREE.MeshNormalMaterial();
  const illuminationTarget = new THREE.WebGLRenderTarget(1,1,{ samples: 4, type: THREE.HalfFloatType });
  const normalTarget = new THREE.WebGLRenderTarget(1,1,{ type: THREE.HalfFloatType });
  normalTarget.depthTexture = new THREE.DepthTexture(1,1,THREE.FloatType);
  const postMaterial = new THREE.ShaderMaterial({
    uniforms: {
      illumination: { value: illuminationTarget.texture },
      normals: { value: normalTarget.texture },
      depths: { value: normalTarget.depthTexture },
      resolution: { value: new THREE.Vector2(1,1) },
      paper: { value: new THREE.Color(PALETTES[settings.palette].paper) },
      ink: { value: new THREE.Color(PALETTES[settings.palette].ink) },
      cameraNear: { value: camera.near },
      cameraFar: { value: camera.far },
      lineScale: { value: 1 },
    },
    vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  const postScene = new THREE.Scene();
  const quadGeometry = new THREE.PlaneGeometry(2,2);
  const quad = new THREE.Mesh(quadGeometry,postMaterial);
  quad.frustumCulled = false;
  postScene.add(quad);
  const postCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);

  function disposeArchitecture(group: THREE.Group) {
    group.traverse(object => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    scene.remove(group);
  }

  function placeLight() {
    const azimuth = THREE.MathUtils.degToRad(settings.azimuth);
    const altitude = THREE.MathUtils.degToRad(settings.altitude);
    light.position.set(Math.cos(azimuth)*68*Math.cos(altitude),68*Math.sin(altitude),Math.sin(azimuth)*68*Math.cos(altitude)-8);
    light.updateMatrixWorld();
    renderer.shadowMap.needsUpdate = true;
  }

  function placeCamera() {
    const aspect = width/height;
    const frameHeight = settings.scene === "pantheon" ? 26 : 25;
    const framedWidth = Math.max(ROMAN_FRAMING[settings.scene].width,frameHeight*aspect);
    const horizontalFov = THREE.MathUtils.degToRad(6+currentPerspective*38);
    const distance = framedWidth*.5/Math.tan(horizontalFov*.5);
    const focalZ = settings.scene === "aqueduct" ? -10 : -10;
    const eyeHeight = 13;
    camera.aspect = aspect;
    camera.fov = THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(horizontalFov*.5)/aspect));
    camera.near = Math.max(.5,distance-Math.max(140,framedWidth*5));
    camera.far = distance+700;
    camera.position.set(Math.sin(yaw)*distance,eyeHeight,focalZ+Math.cos(yaw)*distance);
    camera.lookAt(0,eyeHeight,focalZ);
    camera.updateProjectionMatrix();
    const actualHeight = framedWidth/aspect;
    // Lens shift instead of camera tilt keeps the columns vertical.
    camera.projectionMatrix.elements[9] = -2*(eyeHeight-5.8)/actualHeight;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld();
    postMaterial.uniforms.cameraNear.value = camera.near;
    postMaterial.uniforms.cameraFar.value = camera.far;
  }

  function draw() {
    if (disposed || width < 2 || height < 2) return;
    placeCamera();
    scene.overrideMaterial = null;
    renderer.setRenderTarget(illuminationTarget);
    renderer.setClearColor(0xffffff,1);
    renderer.clear();
    renderer.render(scene,camera);
    scene.overrideMaterial = normalMaterial;
    renderer.setRenderTarget(normalTarget);
    renderer.setClearColor(0x000000,1);
    renderer.clear();
    renderer.render(scene,camera);
    scene.overrideMaterial = null;
    renderer.setRenderTarget(null);
    renderer.render(postScene,postCamera);
  }

  function tick(time: number) {
    frame = 0;
    if (disposed || exporting) return;
    if (isVisible && settings.autoRotate && !pointer) {
      if (!animationStart) { animationStart=time; animationBase=desiredYaw; }
      // One complete, periodic camera movement; no stateful random motion.
      desiredYaw = animationBase+Math.sin((time-animationStart)/44000*Math.PI*2)*.30;
    }
    const factor = reducedMotion.matches ? 1 : .13;
    yaw += (desiredYaw-yaw)*factor;
    currentPerspective += (settings.perspective-currentPerspective)*factor;
    draw();
    if ((isVisible && settings.autoRotate) || Math.abs(desiredYaw-yaw)>.0001 || Math.abs(settings.perspective-currentPerspective)>.0001) requestDraw();
  }

  function requestDraw() {
    if (!frame && !disposed && !exporting) frame=requestAnimationFrame(tick);
  }

  function setSize(w: number,h: number,dpr: number) {
    width=w; height=h;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w,h,false);
    const rw=Math.round(w*dpr),rh=Math.round(h*dpr);
    illuminationTarget.setSize(rw,rh);
    normalTarget.setSize(rw,rh);
    postMaterial.uniforms.resolution.value.set(rw,rh);
    postMaterial.uniforms.lineScale.value=Math.max(.75,dpr*.68);
  }

  function resize() {
    if (disposed || exporting) return;
    const box=container.getBoundingClientRect();
    setSize(Math.max(1,Math.round(box.width)),Math.max(1,Math.round(box.height)),Math.min(window.devicePixelRatio||1,1.75));
    draw();
    if (settings.autoRotate && isVisible) requestDraw();
  }

  const resizeObserver=new ResizeObserver(resize);
  resizeObserver.observe(container);
  const intersectionObserver=new IntersectionObserver(entries=>{
    isVisible=entries[0].isIntersecting;
    if (isVisible) requestDraw();
  },{threshold:0});
  intersectionObserver.observe(container);

  const onDown=(event:PointerEvent)=>{
    if (event.button!==0) return;
    pointer={id:event.pointerId,x:event.clientX,yaw:desiredYaw};
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor="grabbing";
    animationStart=0;
  };
  const onMove=(event:PointerEvent)=>{
    if (!pointer || event.pointerId!==pointer.id) return;
    desiredYaw=THREE.MathUtils.clamp(pointer.yaw-(event.clientX-pointer.x)/Math.max(width,300)*1.6,-.8,.8);
    callbacks.view(desiredYaw);
    requestDraw();
  };
  const onUp=()=>{pointer=null;canvas.style.cursor="grab";animationStart=0;};
  const onKey=(event:KeyboardEvent)=>{
    if (event.key!=="ArrowLeft" && event.key!=="ArrowRight") return;
    event.preventDefault();
    desiredYaw=THREE.MathUtils.clamp(desiredYaw+(event.key==="ArrowLeft"?-.075:.075),-.8,.8);
    animationStart=0;requestDraw();
  };
  const onLost=(event:Event)=>{event.preventDefault();callbacks.error("画面暂时中断，请刷新页面重新加载。");};
  const onVisibility=()=>{
    isVisible=!document.hidden;
    if (isVisible) {animationStart=0;requestDraw();}
  };
  canvas.addEventListener("pointerdown",onDown);
  canvas.addEventListener("pointermove",onMove);
  canvas.addEventListener("pointerup",onUp);
  canvas.addEventListener("pointercancel",onUp);
  canvas.addEventListener("keydown",onKey);
  canvas.addEventListener("webglcontextlost",onLost);
  document.addEventListener("visibilitychange",onVisibility);

  placeLight();resize();draw();
  container.dataset.ready="true";
  callbacks.ready();

  return {
    update(next) {
      const changedScene=next.scene!==settings.scene;
      const changedLight=next.azimuth!==settings.azimuth||next.altitude!==settings.altitude;
      const changedAuto=next.autoRotate!==settings.autoRotate;
      settings={...next};
      if (changedScene) {
        disposeArchitecture(architecture);
        architecture=buildRomanScene(settings.scene,materials);
        scene.add(architecture);
        desiredYaw=settings.scene==="aqueduct"?.22:.34;
        animationStart=0;
      }
      if (changedScene||changedLight) placeLight();
      if (changedAuto) animationStart=0;
      postMaterial.uniforms.paper.value.set(PALETTES[settings.palette].paper);
      postMaterial.uniforms.ink.value.set(PALETTES[settings.palette].ink);
      requestDraw();
    },
    async exportPNG() {
      if (exporting) return;
      exporting=true;
      if (frame) cancelAnimationFrame(frame);
      frame=0;
      const oldW=width,oldH=height;
      const scale=3840/Math.max(oldW,oldH);
      try {
        setSize(Math.round(oldW*scale),Math.round(oldH*scale),1);
        postMaterial.uniforms.lineScale.value=Math.max(1.0,scale*.55);
        draw();
        const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("暂时无法保存画面，请重试。")),"image/png"));
        const url=URL.createObjectURL(blob);
        const anchor=document.createElement("a");
        anchor.href=url;
        anchor.download=`UMBRA-${settings.scene}-${settings.palette}-${width}x${height}.png`;
        document.body.appendChild(anchor);anchor.click();anchor.remove();
        window.setTimeout(()=>URL.revokeObjectURL(url),30000);
      } finally {
        exporting=false;
        if (!disposed) {resize();draw();requestDraw();}
      }
    },
    reset() {desiredYaw=.34;animationStart=0;requestDraw();},
    dispose() {
      disposed=true;
      if (frame) cancelAnimationFrame(frame);
      resizeObserver.disconnect();intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange",onVisibility);
      canvas.removeEventListener("pointerdown",onDown);canvas.removeEventListener("pointermove",onMove);
      canvas.removeEventListener("pointerup",onUp);canvas.removeEventListener("pointercancel",onUp);
      canvas.removeEventListener("keydown",onKey);canvas.removeEventListener("webglcontextlost",onLost);
      disposeArchitecture(architecture);
      Object.values(materials).forEach(material=>material.dispose());
      normalMaterial.dispose();illuminationTarget.dispose();normalTarget.dispose();
      postMaterial.dispose();quadGeometry.dispose();light.shadow.map?.dispose();
      renderer.dispose();canvas.remove();
    },
  };
}

const RomanViewer=forwardRef<ViewerHandle,ViewerProps>(function RomanViewer({settings,onReady,onError,onViewChange},ref){
  const container=useRef<HTMLDivElement>(null);
  const runtime=useRef<Runtime|null>(null);
  const latest=useRef({settings,onReady,onError,onViewChange});
  latest.current={settings,onReady,onError,onViewChange};
  useImperativeHandle(ref,()=>({
    exportPNG:async()=>{
      if (!runtime.current) throw new Error("画面还在准备中，请稍后再试。");
      return runtime.current.exportPNG();
    },
    resetView:()=>runtime.current?.reset(),
  }),[]);
  useEffect(()=>{
    if (!container.current) return;
    const callbacks={
      ready:()=>latest.current.onReady?.(),
      error:(text:string)=>latest.current.onError?.(text),
      view:(value:number)=>latest.current.onViewChange?.(value),
    };
    try {
      runtime.current=createRuntime(container.current,latest.current.settings,callbacks);
    } catch {
      try {
        runtime.current=createSoftwareRuntime(container.current,latest.current.settings,callbacks);
      } catch(error) {
        console.error("UMBRA could not initialize",error);
        latest.current.onError?.("画面暂时无法打开，请刷新页面重试。");
      }
    }
    return()=>{runtime.current?.dispose();runtime.current=null;};
  },[]);
  useEffect(()=>runtime.current?.update(settings),[settings]);
  return <div ref={container} className="roman-viewer" style={{width:"100%",height:"100%"}} />;
});

export default RomanViewer;
