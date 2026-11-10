"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import RomanViewer, { type StudioSettings, type ViewerHandle } from "../components/RomanViewer";

const INITIAL_SETTINGS: StudioSettings = { scene: "forum", palette: "limestone", azimuth: 135, altitude: 28, perspective: 0.65, autoRotate: false };
const SCENES = [
  { id: "forum", numeral: "I", name: "永恒柱廊", latin: "FORUM ROMANUM", note: "柱列交错，光穿过秩序。" },
  { id: "pantheon", numeral: "II", name: "穹顶之下", latin: "SUB DOMO", note: "一道弧线，容纳一整个天空。" },
  { id: "aqueduct", numeral: "III", name: "时间拱廊", latin: "AQUA ET TEMPUS", note: "拱券延伸，阴影替时间落笔。" },
] as const;
const PALETTES = [
  { id: "limestone", name: "石灰", light: "#e8e0cd", dark: "#31382f" },
  { id: "terracotta", name: "赤陶", light: "#f0d5ba", dark: "#8d432d" },
  { id: "cyanotype", name: "蓝晒", light: "#e3e9df", dark: "#244c65" },
] as const;

function ArrowIcon({ diagonal = false }: { diagonal?: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d={diagonal ? "M5 15 15 5M5 5h10v10" : "M3 10h13m-5-5 5 5-5 5"} stroke="currentColor" strokeWidth="1.4" /></svg>;
}
function SunIcon() {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="3.4" stroke="currentColor" strokeWidth="1.15" /><path d="M10 1v2m0 14v2M1 10h2m14 0h2M3.6 3.6 5 5m10 10 1.4 1.4M3.6 16.4 5 15M15 5l1.4-1.4" stroke="currentColor" strokeWidth="1.15" /></svg>;
}
function ResetIcon() {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.1 6a7 7 0 1 1-1 6M4 2v4.5h4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function FrameIcon({ expanded }: { expanded: boolean }) {
  return <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d={expanded ? "M7 2v5H2m11-5v5h5M2 13h5v5m6 0v-5h5" : "M2 7V2h5m6 0h5v5M2 13v5h5m6 0h5v-5"} stroke="currentColor" strokeWidth="1.2" /></svg>;
}

export default function Home() {
  const [settings, setSettings] = useState<StudioSettings>(INITIAL_SETTINGS);
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const viewerRef = useRef<ViewerHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLDialogElement>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentScene = SCENES.find((scene) => scene.id === settings.scene) ?? SCENES[0];

  const notify = useCallback((text: string) => {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    setMessage(text);
    messageTimer.current = setTimeout(() => setMessage(""), 5000);
  }, []);
  const handleReady = useCallback(() => { setReady(true); setError(null); }, []);
  const handleError = useCallback((text: string) => { setError(text); setReady(false); }, []);

  useEffect(() => {
    return () => { if (messageTimer.current) clearTimeout(messageTimer.current); };
  }, []);
  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const exit = (event: KeyboardEvent) => { if (event.key === "Escape") setFullscreen(false); };
    document.addEventListener("keydown", exit);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", exit); };
  }, [fullscreen]);
  useEffect(() => {
    const dialog = notesRef.current;
    if (!dialog) return;
    if (notesOpen && !dialog.open) dialog.showModal();
    if (!notesOpen && dialog.open) dialog.close();
  }, [notesOpen]);

  function update<K extends keyof StudioSettings>(key: K, value: StudioSettings[K]) { setSettings((previous) => ({ ...previous, [key]: value })); }
  async function exportArtwork() {
    if (!ready || exporting || !viewerRef.current) return;
    setExporting(true);
    try { await viewerRef.current.exportPNG(); notify("作品已导出，留住这一刻的光。"); }
    catch { notify("导出暂未完成，请稍后再试。"); }
    finally { setExporting(false); }
  }
  function toggleFullscreen() { setFullscreen((expanded) => !expanded); }
  function resetSettings() { setSettings(INITIAL_SETTINGS); viewerRef.current?.resetView(); notify("已回到最初的构图。"); }

  return (
    <main id="top" className="atelier">
      <a href="#studio" className="skip-link">进入光影工坊</a>
      <header className="site-header">
        <a href="#top" className="brand" aria-label="UMBRA 罗马光影工坊首页"><span className="brand-emblem" aria-hidden="true"><span /></span><span className="brand-name">UMBRA<span className="brand-caption">罗马光影工坊</span></span></a>
        <nav className="site-nav" aria-label="主导航"><a href="#studio" className="nav-link is-current" aria-current="page">光影工坊</a><button className="nav-link" onClick={() => setNotesOpen(true)}>创作札记</button></nav>
        <button className="export-button" title="PNG · 长边 3840 px" onClick={exportArtwork} disabled={!ready || exporting}><span>{exporting ? "正在导出" : "导出作品"}</span><ArrowIcon diagonal /></button>
      </header>

      <section className="introduction" aria-labelledby="page-title">
        <div><p className="eyebrow intro-eyebrow"><svg className="small-star" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1v12M1 7h12M2.8 2.8l8.4 8.4M2.8 11.2l8.4-8.4" fill="none" stroke="currentColor" strokeWidth="1" /></svg> ARCHITECTURE IN TWO TONES <span className="eyebrow-divider">/</span> VOL. 01</p><h1 id="page-title">光，塑造永恒。</h1></div>
        <div className="intro-aside"><p>在明与暗之间，<br />重新看见罗马。</p><span className="intro-note">一场关于建筑与光的自由习作</span></div>
      </section>

      <section id="studio" className="studio" aria-label="交互式罗马建筑光影工坊">
        <div className={"art-stage" + (fullscreen ? " is-expanded" : "")} ref={stageRef}>
          <div className="art-renderer"><RomanViewer ref={viewerRef} settings={settings} onReady={handleReady} onError={handleError} /></div>
          <div className="art-title" aria-live="polite"><span className="art-title-number">{currentScene.numeral}.</span><div><p>{currentScene.latin}</p><span>{currentScene.name}</span></div></div>
          <button className="frame-button" onClick={toggleFullscreen} aria-label={fullscreen ? "退出全屏" : "全屏观看作品"} title={fullscreen ? "退出全屏" : "沉浸观看"}><FrameIcon expanded={fullscreen} /></button>
          {!ready && !error && <div className="canvas-status" role="status"><span className="loading-sun" aria-hidden="true" /><p>光正在抵达。</p></div>}
          {error && <div className="canvas-status canvas-error" role="alert"><p>这束光还没有抵达。</p><span>{error}</span><button onClick={() => window.location.reload()}>重新加载 <ArrowIcon /></button></div>}
          <div className="canvas-hint"><svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2 10h16M5 7l-3 3 3 3m10-6 3 3-3 3" stroke="currentColor" strokeWidth="1.1" /></svg><span>拖动，探索空间</span></div>
          <button className="tour-button" onClick={() => update("autoRotate", !settings.autoRotate)} disabled={!ready} aria-pressed={settings.autoRotate}>{settings.autoRotate ? <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M3 2h2v8H3zm4 0h2v8H7z" /></svg> : <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m4 2 6 4-6 4V2Z" fill="currentColor" /></svg>}<span>{settings.autoRotate ? "暂停巡游" : "缓慢巡游"}</span></button>
          <div className="art-corner art-corner-tl" aria-hidden="true" /><div className="art-corner art-corner-br" aria-hidden="true" />
        </div>

        <div className="scene-bar">
          <div className="scene-tabs" role="group" aria-label="选择建筑场景">{SCENES.map((scene) => <button key={scene.id} className={"scene-tab " + (settings.scene === scene.id ? "is-selected" : "")} aria-pressed={settings.scene === scene.id} onClick={() => update("scene", scene.id)}><span className="scene-numeral">{scene.numeral}</span>{scene.name}<span className="scene-dot" aria-hidden="true" /></button>)}</div>
          <p className="scene-caption">{currentScene.note}</p>
        </div>

        <div className="control-rail" aria-label="作品参数">
          <div className="control-group sun-control"><div className="control-heading"><label htmlFor="sun-azimuth"><SunIcon />光的方向</label><output htmlFor="sun-azimuth">{Math.round(settings.azimuth)}<span>°</span></output></div><input id="sun-azimuth" aria-label="光的方向" aria-valuetext={`${settings.azimuth} 度`} type="range" min="0" max="360" step="1" value={settings.azimuth} onChange={(event) => update("azimuth", Number(event.target.value))} /><div className="range-endpoints"><span>0°</span><span>360°</span></div></div>
          <div className="control-group altitude-control"><div className="control-heading"><label htmlFor="sun-altitude">太阳高度</label><output htmlFor="sun-altitude">{Math.round(settings.altitude)}<span>°</span></output></div><input id="sun-altitude" aria-label="太阳高度" aria-valuetext={`${settings.altitude} 度`} type="range" min="15" max="70" step="1" value={settings.altitude} onChange={(event) => update("altitude", Number(event.target.value))} /><div className="range-endpoints"><span>长影</span><span>短影</span></div></div>
          <div className="control-group perspective-control"><div className="control-heading"><label htmlFor="perspective">空间的深度</label><output htmlFor="perspective">{Math.round(settings.perspective * 100)}<span>%</span></output></div><input id="perspective" aria-label="空间的深度" aria-valuetext={`${Math.round(settings.perspective * 100)}% 纵深`} type="range" min="0" max="1" step="0.01" value={settings.perspective} onChange={(event) => update("perspective", Number(event.target.value))} /><div className="range-endpoints"><span>平面</span><span>纵深</span></div></div>
          <div className="control-group palette-control"><div className="control-heading"><span>作品色调</span><span className="palette-caption">DUOTONE</span></div><div className="palette-options" role="group" aria-label="选择作品配色">{PALETTES.map((palette) => <button key={palette.id} className={"palette-option " + (settings.palette === palette.id ? "is-selected" : "")} aria-pressed={settings.palette === palette.id} aria-label={palette.name + "配色"} onClick={() => update("palette", palette.id)}><span className="swatch" style={{ backgroundColor: palette.light }}><span style={{ backgroundColor: palette.dark }} /></span><span>{palette.name}</span></button>)}</div></div>
          <button className="reset-button" onClick={resetSettings} title="恢复初始构图" aria-label="恢复初始构图"><ResetIcon /><span>重置</span></button>
        </div>
      </section>

      <section className="colophon" aria-label="作品介绍"><div className="colophon-heading"><span className="colophon-index">01 — 03</span><p>让建筑退回形体，<br /><em>让光成为语言。</em></p></div><div className="colophon-body"><p>一道柱廊，一座穹顶，一段拱券。<br />把复杂留给时间，把画面交给明暗。</p><button onClick={() => setNotesOpen(true)}>关于这次光影习作 <ArrowIcon /></button></div><div className="colophon-stamp" aria-hidden="true"><span>LUCE</span><i /><span>ET OMBRA</span></div></section>
      <footer className="site-footer"><span>UMBRA <span className="footer-divider">/</span> 光与影的建筑诗</span><a href="https://github.com/dotslashsimran/simcraft/blob/main/skills/video/perspective-illusion/SKILL.md" target="_blank" rel="noreferrer">CRAFTED WITH SIMCRAFT <ArrowIcon diagonal /></a><span className="footer-end">ROMA, REIMAGINED.</span></footer>
      <div className={"toast " + (message ? "is-visible" : "")} role="status" aria-live="polite">{message}</div>

      <dialog className="notes-dialog" ref={notesRef} onClose={() => setNotesOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setNotesOpen(false); }} aria-labelledby="notes-title"><div className="notes-inner">
        <div className="notes-topline"><span className="eyebrow">NOTES ON LIGHT / 创作札记</span><button onClick={() => setNotesOpen(false)} className="close-button" aria-label="关闭创作札记"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="1.2" /></svg></button></div>
        <h2 id="notes-title">建筑，是光的容器。</h2><p className="notes-lead">UMBRA，意为阴影。这里是一组以古罗马建筑语言为灵感的原创空间习作。</p>
        <div className="notes-section"><span>I.</span><div><h3>只留下明与暗</h3><p>柱式、穹顶与连续的拱券，在一束硬光中分成清晰的两面。拿走繁复的材质，建筑的轮廓和比例便浮现出来。</p></div></div>
        <div className="notes-section"><span>II.</span><div><h3>在平面与空间之间</h3><p>移动「空间的深度」，观察重复柱列如何从平面般的排列展开成真实的纵深。拖动作品，可以寻找自己的观看位置。</p></div></div>
        <div className="notes-section"><span>III.</span><div><h3>留住你的光</h3><p>改变太阳方向与高度，挑选石灰、赤陶或蓝晒色调。找到喜欢的构图后，点击「导出作品」，保存不含界面的 PNG 画面，长边为 3840 px。</p></div></div>
        <p className="notes-footnote">本作借鉴 Simcraft 的透视与二分光影方法，以代码构建原创场景；并非具体遗址的考古复原。</p><button className="notes-return" onClick={() => setNotesOpen(false)}>回到光影之中 <ArrowIcon /></button>
      </div></dialog>
    </main>
  );
}
