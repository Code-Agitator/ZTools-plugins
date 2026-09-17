/*
 * 面板底色的预设表。
 *
 * 锁的是两条约定：
 *   1. `auto` 必须真的是「没画底」（`transparent`）—— 「跟顶部那行零色差」全靠这一条，
 *      一旦它变成某个具体色号，色差就又回来了（只是小一点）。
 *   2. 每个预设**都要有浅色和深色两版**，且浅的那版必须更浅 ——
 *      否则切主题时会出现「浅色面板配深色字」，那是 09-14 修过的同类错误。
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { BG_KEYS, BG_PRESETS, resolveBg, resolveFloatBg } from '../src/lib/surface.ts'

/** 三个通道直接相加，够用来比大小（这里只需要「谁更浅」） */
function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)
}

test('★ auto = 不画底 —— 零色差就靠它，不能被换成任何色号', () => {
  assert.equal(resolveBg('auto', false), 'transparent')
  assert.equal(resolveBg('auto', true), 'transparent')
})

test('预设：至少 4 个、键不重复、色值合法且不重复', () => {
  assert.ok(BG_PRESETS.length >= 4, '选项太少的话这个设置就没意义了')
  const keys = BG_PRESETS.map((p) => p.key)
  assert.equal(new Set(keys).size, keys.length, '键重复了')
  const vals = BG_PRESETS.flatMap((p) => [p.light, p.dark])
  assert.equal(new Set(vals).size, vals.length, '两个预设给了同一个色值')
  for (const p of BG_PRESETS) {
    assert.match(p.light, /^#[0-9a-f]{6}$/i, `${p.key} 的浅色版不是合法色值`)
    assert.match(p.dark, /^#[0-9a-f]{6}$/i, `${p.key} 的深色版不是合法色值`)
  }
})

test('★ 同一个预设：浅色那版一定比深色那版浅（标反了上面那条也救不回来）', () => {
  for (const p of BG_PRESETS) {
    assert.ok(lum(p.light) > lum(p.dark), `${p.key} 的浅深两版标反了`)
  }
})

test('认不出的当 transparent —— 不能给一个错的实底', () => {
  assert.equal(resolveBg('rainbow' as never, false), 'transparent')
})

test('BG_KEYS = auto + 全部预设，且 auto 排第一', () => {
  assert.equal(BG_KEYS[0], 'auto')
  assert.equal(BG_KEYS.length, BG_PRESETS.length + 1)
})

/*
 * 浮层（详情 / 设置 / 确认框 / 淡入底栏）的底色。
 *
 * **跟随底色是默认行为**，只有「默认」那一档是例外 —— 别把下面读成"浮层不跟随"：
 *   1. 实底预设（白 / 灰 / 暖 / 冷）→ **跟着面板同一个色号**。不跟的话就是老大最初那句
 *      「详情框的底色应该根据底色的设置来」——选个暖色面板、详情框还是冷白，像这设置没生效。
 *      **这一档老大确认过没问题。**
 *   2. `auto`（面板不画底）→ **`null` = 不覆盖**，浮层回落中性实底。
 *      这一档**没有颜色可跟**（面板自己就透明）；试过"跟到底"（浮层也 transparent + 模糊），
 *      真机上列表的密集文字**重影**、糊完是一团脏影子，老大否掉：「效果都确实不太好」。
 */
test('★ 实底预设下，浮层色号跟面板完全一致（差一点就等于没跟）', () => {
  for (const p of BG_PRESETS) {
    for (const dark of [false, true]) {
      const float = resolveFloatBg(p.key, dark)
      assert.ok(float, `${p.key} 的浮层没拿到色号`)
      assert.equal(float, resolveBg(p.key, dark), `${p.key}（${dark ? '深' : '浅'}）跟面板不一致`)
    }
  }
})

test('★ 「默认」档不覆盖（返回 null），绝不能返回 transparent —— 浮层必须自己立住', () => {
  assert.equal(resolveFloatBg('auto', false), null)
  assert.equal(resolveFloatBg('auto', true), null)
})

test('认不出的模式：浮层也不覆盖（跟 resolveBg 一样当 auto 处理）', () => {
  assert.equal(resolveFloatBg('never' as never, false), null)
})
