/*
 * 当前行的落位规则。
 * 这几条都是真机上踩出来的 —— 尤其「切回全部」那条。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveSelection, type Selection } from '../src/lib/selection.ts'

const sel = (active: string): Selection => ({ active })

const KEYS = ['a', 'b', 'c', 'd']

test('范围变了 → 无条件落回第一条，哪怕旧选中项还活着', () => {
  // 就是「文件 → 全部」：旧那条 d 在全部里当然还在，但必须落到 a
  const next = resolveSelection(KEYS, sel('d'), true)
  assert.deepEqual(next, { active: 'a' })
})

test('只是刷新 → 选中项还活着就原地不动（别人复制东西不该把光标踢走）', () => {
  const next = resolveSelection(KEYS, sel('c'), false)
  assert.equal(next.active, 'c')
})

test('刷新后选中项没了 → 落回第一条', () => {
  const next = resolveSelection(['b', 'c'], sel('a'), false)
  assert.deepEqual(next, { active: 'b' })
})

test('空列表 → 落成空串，不留一个指向空气的键', () => {
  assert.deepEqual(resolveSelection([], sel('a'), false), { active: '' })
})

test('空列表 + 范围变了 → 同样是空', () => {
  assert.deepEqual(resolveSelection([], sel('a'), true), { active: '' })
})

test('单条列表 → 就选那一条', () => {
  assert.deepEqual(resolveSelection(['only'], sel('x'), true), { active: 'only' })
})

test('范围变了 + 旧键恰好还在 + 列表非空 → 仍然落第一条', () => {
  // 「文本 → 全部」且旧项是全部里的第一条时，两条规则给的结果一样，
  // 容易以为是"原地不动"过了，其实走的是 forceTop 那条路
  assert.deepEqual(resolveSelection(['d', 'a'], sel('d'), true), { active: 'd' })
  assert.deepEqual(resolveSelection(['a', 'd'], sel('d'), true), { active: 'a' })
})
