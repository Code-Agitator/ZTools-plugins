/*
 * 单文件组件的样式卫生。
 *
 * 起因是一个很难看的 bug：清空历史的确认框只显示一句话、**按钮不见了**。
 * 不是按钮没渲染，是被"串味"了 —— 行尾那两枚收藏/删除按钮的容器叫 `.acts`，
 * 带 `opacity: 0; pointer-events: none; position: absolute`；确认框的按钮容器也叫 `.acts`。
 * scoped 样式只给**选择器最后一个复合选择器**加 `[data-v-x]`，
 * 于是两条规则编译出来都是 `.acts[data-v-x]`，同时命中同一个元素 —— 按钮被自己的亲戚藏了。
 *
 * 这种 bug 不看界面发现不了，所以拿两个便宜的断言把它钉住：
 *   1. 顶层"单个类名"选择器不允许重名（就是上面那种撞车）；
 *   2. 模板里用到的每个类，样式表里都得有出处（防改名改一半）。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const SFC = fileURLToPath(new URL('../src/App.vue', import.meta.url))
const src = readFileSync(SFC, 'utf8')

/*
 * 取 SFC 里某一个顶层块的内容。
 *
 * ⚠️ **`[\s\S]*` 必须是贪婪的**：模板里可以合法地出现**嵌套的 `<template v-if>`**
 * （底栏那段就有一个）。用非贪婪 `*?` 的话，抽到的"模板"会在第一个内层 `</template>`
 * 就断掉 —— 后半段整个消失，`dlgacts` 那种断言全部落空。
 * 09-16 加底栏那档设置时真踩到了：测试红了，但红的是"找不到 dlgacts"，
 * 跟实际改动八竿子打不着，差点当成自己把确认框改坏了。
 * 整个 SFC 只有一个顶层块，所以贪婪匹配到**最后一个**闭合标签才是它。
 * 同一个函数还被拿去抽 `<style>`，那边只有一个块，贪婪同样安全。
 */
function block(tag: string): string {
  const m = src.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*)</${tag}>`))
  assert.ok(m, `App.vue 里找不到 <${tag}>`)
  return m[1]
}

/** 去掉注释，别把注释里写的类名算进来 */
const css = block('style').replace(/\/\*[\s\S]*?\*\//g, '')
const template = block('template')

test('样式表里没有重名的顶层单类选择器（.acts 那种串味）', () => {
  const seen = new Map<string, number>()
  for (const group of css.match(/[^{}]+\{/g) ?? []) {
    for (const one of group.slice(0, -1).split(',')) {
      const sel = one.trim()
      // 只盯"就一个类名"的选择器：`.acts { ... }`
      // 后代 / 伪类 / 属性选择器天然带上下文，不算撞车
      if (!/^\.[A-Za-z][\w-]*$/.test(sel)) continue
      seen.set(sel, (seen.get(sel) ?? 0) + 1)
    }
  }

  const dup = [...seen].filter(([, n]) => n > 1).map(([sel]) => sel)
  assert.deepEqual(dup, [], `顶层单类选择器重名：${dup.join(', ')}`)
})

test('模板里用的类，样式表里都有', () => {
  const inCss = new Set([...css.matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => m[1]))

  const used = new Set<string>()
  // 静态：class="a b c"。
  // 前面加 `(?<![:-\w])` 是必须的 —— 不然 `:class="{ on: x === false }"` 里的
  // `class="…"` 片段也会被当成静态类名，拆出一堆 `false`、`k` 这种假货。
  for (const m of template.matchAll(/(?<![:-\w])class="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (/^[a-z][\w-]*$/.test(c)) used.add(c)
  }
  // 动态：:class="{ on: x, 'mark-': y }"
  for (const m of template.matchAll(/:class="\{([^}]*)\}"/g)) {
    for (const part of m[1].split(',')) {
      const key = part.split(':')[0].trim()
      const lit = key.match(/^'([\w-]+)'$/)
      if (lit) used.add(lit[1])
      else if (/^[a-z][\w-]*$/.test(key)) used.add(key)
    }
  }

  const missing = [...used].filter((c) => !inCss.has(c)).sort()
  assert.deepEqual(missing, [], `模板用了但样式里没有：${missing.join(', ')}`)
})

test('★ 详情浮层的 box-sizing 必须是 border-box（宽度是 JS 内联给的，只有这一处能兜）', () => {
  /*
   * 老大 09-16 报的「详情框左边跟行对齐、右边却填满窗口」的真凶就是这个：
   * 宽度由 `peekGeom()` 算好内联写上去（正好等于行宽），而 `.peek` 自己又有横向 padding，
   * 本项目**没有全局 box-sizing**（默认 content-box）—— 于是实际盒子 = 行宽 + 2×padding，
   * 右边一路冲出窗口被裁掉。**别把这一行删掉。**
   *
   * 这条只能这么测：宽度不在样式表里（是 JS 内联的），所以机械扫描"width + padding"扫不到它。
   */
  const rule = css.match(/\.peek\s*\{([^}]*)\}/)
  assert.ok(rule, '样式表里找不到 .peek')
  assert.match(rule[1], /box-sizing:\s*border-box/, '.peek 少了 box-sizing: border-box')
  assert.match(rule[1], /padding:/, '.peek 不再有 padding 了？那这条断言该改写')

  // 确认框同理：同样有 width + 横向 padding
  const box = css.match(/\.box\s*\{([^}]*)\}/)
  assert.ok(box, '样式表里找不到 .box')
  assert.match(box[1], /box-sizing:\s*border-box/, '.box 少了 box-sizing: border-box')
})

test('确认框的按钮容器不再是 .acts（这条就是本次 bug 的碑）', () => {
  assert.match(template, /class="dlgacts"/)
  assert.match(css, /\.dlgacts\s*\{/)
  // 行尾那条必须带上 .row 前缀，否则又会串到确认框上
  assert.match(css, /\.row\s+\.acts\s*\{/)
  assert.doesNotMatch(css, /^\.acts\s*\{/m)
})

/*
 * 底栏两颗按钮（设置 / 清空）的悬停效果，必须跟「选中项」那套走。
 *
 * 老大 09-16 提的：在设置里调「选中项 / 强调色」时，底栏这两颗也该同步 ——
 * 不然同一屏里两套规矩（行是实心块、按钮只是换了个字色）。
 * 所以三档 × 两颗 = 6 条规则都得在：**形状随 mark、颜色随 accent**
 * （清空走 danger 红 —— 它是要删东西的，红是它的语义；但形状跟设置一模一样）。
 */
test('★ 底栏按钮的效果跟 mark 三档 + 强调色走（别退回"只变字色"）', () => {
  for (const mark of ['mark-border', 'mark-tint', 'mark-solid']) {
    assert.match(css, new RegExp(`\\.root\\.${mark} \\.clr:hover`), `${mark} 档：清空那颗没有规则`)
    assert.match(
      css,
      new RegExp(`\\.root\\.${mark} \\.clr\\.set:hover`),
      `${mark} 档：设置那颗没有规则`
    )
  }
  assert.match(css, /\.root\.mark-border \.clr\.set:hover\s*\{[^}]*var\(--accent\)/)
  assert.match(css, /\.root\.mark-solid \.clr\.set:hover\s*\{[^}]*var\(--row-on-tx\)/)
  // 危险色已经收进 `--danger`，App.vue 里不该再有硬编码的红
  assert.doesNotMatch(css, /#ff453a/i, 'danger 收进 --danger 了，别在 App.vue 里再硬写')
  // 「设置」不是危险操作，永远别跟着红
  assert.doesNotMatch(css, /\.clr\.set:hover\s*\{[^}]*--danger/)
})

/*
 * 按钮上的 UA 焦点环必须被掐掉。
 *
 * 老大 09-16 报的：点「设置」→ 弹出面板 → 按 Esc 关掉，那两个字上还围着一圈橙线
 * （Chromium 的 UA focus 环，颜色取自系统强调色，所以是琥珀色）。
 * 根因是点完焦点留在按钮上没走；而本插件**没有键盘聚焦按钮的路**
 * （Tab 被「切分类」占了），那圈环只有"鼠标点完的残留"这一种来源。
 */
test('★ 按钮的 UA 焦点环已掐掉（base.css 的 button:focus）', () => {
  const base = readFileSync(fileURLToPath(new URL('../src/styles/base.css', import.meta.url)), 'utf8')
  const rule = base.match(/button:focus[\s\S]{0,140}?\{([^}]*)\}/)
  assert.ok(rule, 'base.css 里找不到 button:focus 规则')
  assert.match(rule[1], /outline:\s*none/, '按钮的焦点环又回来了')
})

/*
 * ★ 确认框居中 —— 位置由 CSS 给，**不是 JS 算的**。
 *
 * 老大 09-17 要求：删除弹框从「跟着鼠标弹（下面不够翻上方）」改成**居中**。
 * 定位于是整块从 JS 挪进 CSS（`.mask` 的 flex），`lib/popover.ts` 和它的测试一并删掉 ——
 * 那套「先 visibility:hidden 渲染一帧、量到尺寸再放出来」本来只为判断下面够不够，
 * 居中了就完全没有意义。
 *
 * 下面两条 `doesNotMatch` 是防回退：谁要是把 popover 那套加回来，先在这里红一次。
 */
test('★ 确认框居中：位置由 .mask 的 flex 给，别再让 JS 算坐标', () => {
  const mask = css.match(/\.mask\s*\{([^}]*)\}/)
  assert.ok(mask, '样式表里找不到 .mask')
  assert.match(mask[1], /display:\s*flex/, '.mask 不是 flex 容器了')
  assert.match(mask[1], /align-items:\s*center/, '.mask 少了纵向居中')
  assert.match(mask[1], /justify-content:\s*center/, '.mask 少了横向居中')

  assert.doesNotMatch(src, /placePopover|anchorAtPointer|confirmPos/, 'popover 那套定位又回来了？')
  assert.doesNotMatch(template, /:style="popStyle/, '模板里又在给确认框内联坐标了')
})
