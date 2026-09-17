/*
 * 设置的读取容错。
 *
 * 设置存在宿主库里、由插件自己写，所以库里的值**不受我们控制** ——
 * 可能是上一个版本写的（比如 `mark` 只有 border / tint 两种的时候），
 * 也可能被人手工改过。读的时候必须一类一类地看，认不出就退回默认，
 * 绝不把非法值原样带进界面（带进去就是"选了没反应"或者整块面板没颜色）。
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_SETTINGS,
  FOOT_MODES,
  MARK_MODES,
  normalizeSettings
} from '../src/lib/settings.ts'

test('空 / undefined → 全是默认值', () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS)
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS)
})

test('默认：详情关、强调色跟随、选中项描框、底色跟随窗口、底栏完整', () => {
  assert.equal(DEFAULT_SETTINGS.peek, false)
  assert.equal(DEFAULT_SETTINGS.accent, 'auto')
  assert.equal(DEFAULT_SETTINGS.mark, 'border')
  // 「跟随窗口」= 不画底。默认就该跟顶部那行零色差，不是配一个相近的色号
  assert.equal(DEFAULT_SETTINGS.bg, 'auto')
  // 底栏默认完整：键位提示是给刚开始用的人看的，先给上
  assert.equal(DEFAULT_SETTINGS.foot, 'full')
})

test('三种选中项都认（含 09-14 新加的实心）', () => {
  for (const m of MARK_MODES) {
    assert.equal(normalizeSettings({ mark: m }).mark, m)
  }
})

test('认不出的选中项退回描框，不是原样带进去', () => {
  assert.equal(normalizeSettings({ mark: 'rainbow' }).mark, 'border')
  assert.equal(normalizeSettings({ mark: 123 }).mark, 'border')
  // 老版本存过的值里没有第三种，读出来也不该崩
  assert.equal(normalizeSettings({ mark: 'solid' }).mark, 'solid')
})

test('强调色认那 12 个键，认不出退回跟随', () => {
  assert.equal(normalizeSettings({ accent: 'teal' }).accent, 'teal')
  assert.equal(normalizeSettings({ accent: 'slate' }).accent, 'slate')
  assert.equal(normalizeSettings({ accent: 'chartreuse' }).accent, 'auto')
})

test('peek 只认严格 true —— 字符串 "false" 不能算开', () => {
  assert.equal(normalizeSettings({ peek: true }).peek, true)
  assert.equal(normalizeSettings({ peek: 'false' }).peek, false)
  assert.equal(normalizeSettings({ peek: 1 }).peek, false)
})

test('底色认那几个键，认不出退回跟随窗口', () => {
  assert.equal(normalizeSettings({ bg: 'white' }).bg, 'white')
  assert.equal(normalizeSettings({ bg: 'warm' }).bg, 'warm')
  assert.equal(normalizeSettings({ bg: 'rainbow' }).bg, 'auto')
  assert.equal(normalizeSettings({ bg: 0 }).bg, 'auto')
})

test('底栏四档都认，认不出退回完整', () => {
  for (const f of FOOT_MODES) {
    assert.equal(normalizeSettings({ foot: f }).foot, f)
  }
  assert.equal(normalizeSettings({ foot: 'hidden' }).foot, 'full')
  assert.equal(normalizeSettings({ foot: null }).foot, 'full')
})

test('多余的键一律丢掉，不往界面里带', () => {
  const s = normalizeSettings({ peek: true, theme: 'dark', accent: 'blue', 乱写: 1 })
  assert.deepEqual(Object.keys(s).sort(), ['accent', 'bg', 'foot', 'mark', 'peek'])
})
