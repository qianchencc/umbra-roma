# UMBRA — 罗马光影工坊

交互式古罗马建筑二分光影艺术创作网站。以柱廊、穹顶与拱券为原型，将建筑转化为由高对比硬光、投影和克制色盘构成的版画式场景。

> **源码说明：恢复版。** 最早的 UMBRA 网站由 ChatGPT Sites 发布于 2026-11-10，但该部署对应的原始工程文件不在当前工具环境中。本仓库根据保留的 UI 截图和功能规格进行重新实现，**不是原部署代码的逐文件备份**。原网站地址：[umbra-roma-atelier.brisk-corgi-8205.chatgpt.site](https://umbra-roma-atelier.brisk-corgi-8205.chatgpt.site/)。

原始站点预览保留于创建 UMBRA 的 ChatGPT 对话附件中（该图片未附入此代码仓库）。

## 运行

无需下载第三方依赖，要求 Node.js 18+：

```bash
npm run dev
```

然后打开 http://localhost:4173 。页面也支持直接打开 `index.html`（无需服务端接口）。

## 功能

- 三套原创建筑场景：永恒柱廊、穹顶之下、时间拱廊。
- 互动控制：太阳方位、太阳高度、空间透视、三套双色色调、拖动观察视角。
- 缓慢巡游与全屏观看。
- 从当前作品构图导出 **长边 3840 像素** 的纯画面 PNG，不含 UI。
- Canvas 2D 几何渲染和阴影计算，无需 WebGL。兼容不同尺寸屏幕。

## 工程结构

- `index.html` — 页面语义结构
- `style.css` — 页面视觉和响应式布局
- `src/scene.js` — 程序化古罗马建筑网格、明暗与投影的二维画布绘制
- `src/app.js` — 交互控制、状态、导出与 UI 同步
- `server.mjs` — 零依赖本地开发服务

## 风格来源

参考 [dotslashsimran/simcraft](https://github.com/dotslashsimran/simcraft) 的 [perspective-illusion](https://github.com/dotslashsimran/simcraft/blob/main/skills/video/perspective-illusion/SKILL.md) 方法：重复物体造成空间纵深、硬光分面、两阶阴影与透视压缩。代码和建筑几何是独立重建的原创实现，不包含 Simcraft 模板代码。此作品为艺术实验，不是具体遗址的学术复原。

MIT License.