/*
 * 键位映射。
 *
 * 重点盯两件事，都是真出过问题的：
 *   1. **⌘K = 收藏当前项**。09-15 一度把这条删了（理由写的是"收藏已经能从 Tab
 *      那一站到达"），但那是「切到收藏视图」，跟「把当前项加进收藏」是两回事 ——
 *      删掉之后收藏只剩鼠标点行尾 ☆ 一条路。老大当天让加回来，这里锁住。
 *   2. **不带修饰键的 k 什么都不是**。搜索框里打字随时会敲到 k，
 *      要是没这道判断，打两个字就把当前行收藏了。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { resolveKey } from '../src/lib/keys.ts'

/** 造一个够用的键盘事件 —— resolveKey 只读这四个字段 */
function ev(init: Partial<KeyboardEvent>): KeyboardEvent {
  return { metaKey: false, ctrlKey: false, shiftKey: false, key: '', ...init } as KeyboardEvent
}

test('⌘K / Ctrl+K 都是收藏当前项（两个修饰键都收，不做平台分支）', () => {
  assert.equal(resolveKey(ev({ metaKey: true, key: 'k' })), 'favorite')
  assert.equal(resolveKey(ev({ ctrlKey: true, key: 'k' })), 'favorite')
})

test('大写 K 也认（withMod 走 toLowerCase）', () => {
  assert.equal(resolveKey(ev({ metaKey: true, key: 'K' })), 'favorite')
})

test('不带修饰键的 k → null。不然打字就在收藏', () => {
  assert.equal(resolveKey(ev({ key: 'k' })), null)
})

test('⌘D 仍然映射到收藏 —— 宿主现在拦着它，但代码里这条路不能断', () => {
  assert.equal(resolveKey(ev({ metaKey: true, key: 'd' })), 'favorite')
})

test('Tab / ⇧Tab 切分类', () => {
  assert.equal(resolveKey(ev({ key: 'Tab' })), 'cycleType')
  assert.equal(resolveKey(ev({ key: 'Tab', shiftKey: true })), 'cycleTypeBack')
})

test('Delete 与 Backspace 都算删除', () => {
  assert.equal(resolveKey(ev({ key: 'Delete' })), 'remove')
  assert.equal(resolveKey(ev({ key: 'Backspace' })), 'remove')
})

/*
 * ⌘/ 开设置。**这条锁的不是一个便利键，是「全隐」那一档的唯一出路** ——
 * 底栏设成「全隐」之后鼠标没有任何入口，这条映射要是没了，
 * 选了那档的人连改回其他档都做不到。所以它必须一直在这儿。
 */
test('⌘/ / Ctrl+/ 开设置', () => {
  assert.equal(resolveKey(ev({ metaKey: true, key: '/' })), 'openSettings')
  assert.equal(resolveKey(ev({ ctrlKey: true, key: '/' })), 'openSettings')
})

test('不带修饰键的 / 仍然是「回到搜索框」，不是开设置', () => {
  assert.equal(resolveKey(ev({ key: '/' })), 'focusSearch')
})

/*
 * 底栏提示条里必须真的写着「⌘/ 设置」。
 *
 * 跟上面那条映射同一个理由，但锁的是**可发现性**：`⌘/` 原先在整个界面上
 * 一处都没写 —— 唯一提到它的地方是设置面板里「底栏 = 全隐」那句解释，
 * 而那要先进设置才看得到，等于藏起来的入口。09-16 老大指出后补进提示条，
 * 这条锁住它别哪天被当成"重复信息"删掉。
 *
 * 演示写法：`<kbd>{{ modKey('/') }}</kbd>设置`（修饰键按平台渲染成 ⌘ / Ctrl）。
 */
test('底栏键位提示里有 ⌘/ 设置这一项', () => {
  const sfc = readFileSync(fileURLToPath(new URL('../src/App.vue', import.meta.url)), 'utf8')
  // .hints 里没有嵌套 div，所以这里用非贪婪是准的（跟 styles.test.ts 抽 <template> 的贪婪规则不同）
  const hints = sfc.match(/<div class="hints">[\s\S]*?<\/div>/)
  assert.ok(hints, 'App.vue 里找不到底栏的 .hints 块')
  assert.match(hints[0], /\{\{\s*modKey\('\/'\)\s*\}\}<\/kbd>设置/, '提示条里没写 ⌘/ 设置')
})

/*
 * ★ 确认框开着时，Enter 必须是「确定」，**不能穿透成「复制当前项」**。
 *
 * 老大 09-17 真机报的：弹框问「删除这条记录？」时按 Enter ——
 * 结果复制了当前项、**插件窗口也一起关了**，而删除根本没执行。
 * 根因是 `onKeydown` 里没有「弹框优先」这一层，Enter 一路走到 `case 'enter'` → `pasteActive()`。
 *
 * 这段逻辑长在 App.vue 的键盘处理器里、不在可单测的纯函数里，所以只能做源码断言。
 * 锁三件事：守卫在、排在 `resolveKey` 之后（它要用 action）、排在 `case 'enter'` 之前。
 */
test('★ 确认框开着时 Enter = 确定（别让它穿透去 pasteActive）', () => {
  const sfc = readFileSync(fileURLToPath(new URL('../src/App.vue', import.meta.url)), 'utf8')
  const kd = sfc.slice(sfc.indexOf('function onKeydown('))
  const guard = kd.indexOf('if (confirmBox.value)')

  assert.ok(guard > 0, 'onKeydown 里找不到「确认框优先」的守卫')
  assert.ok(
    kd.indexOf('const action = resolveKey(e)') < guard,
    '守卫要排在 resolveKey 之后 —— 它得拿 action 判断，不是自己认 e.key'
  )
  assert.ok(
    guard < kd.indexOf("case 'enter':"),
    "守卫必须拦在 case 'enter' 前面，否则 Enter 照样会去粘贴并关窗"
  )

  const body = kd.slice(guard, kd.indexOf('if (!action)'))
  assert.match(body, /action === 'enter'/, '守卫里没把 Enter 接给「确定」')
  assert.match(body, /runConfirm\(\)/, '守卫里没调 runConfirm')
})
