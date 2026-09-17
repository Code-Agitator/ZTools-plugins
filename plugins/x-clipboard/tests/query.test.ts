/*
 * 搜索框分类前缀的回归测试。
 *
 * 跑法（无需安装任何东西，用 Node 自带的 test runner + 类型剥离）：
 *   node --experimental-strip-types --test tests/query.test.ts
 *
 * 放在 src/ 外面是有意的：tsconfig 的 types 里没有 @types/node，
 * 文件进了 src/ 会让 `npm run build` 的 vue-tsc 报错。这里只给 Node 跑。
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CAT_PREFIX,
  catOf,
  cycleCat,
  isBareUrl,
  labelOf,
  parseQuery,
  prefixOf,
  TYPE_CYCLE,
  TYPE_LABEL,
  TYPE_PREFIX
} from '../src/lib/query.ts'

const J = (o: unknown): string => JSON.stringify(o)

test('空串 → 不过滤', () => {
  assert.equal(J(parseQuery('')), J({ type: null, text: '' }))
})

test('汉字前缀 + 半角冒号', () => {
  assert.equal(J(parseQuery('文本:剪贴板')), J({ type: 'text', text: '剪贴板' }))
  assert.equal(J(parseQuery('图像:截图')), J({ type: 'image', text: '截图' }))
  assert.equal(J(parseQuery('文件:报告')), J({ type: 'file', text: '报告' }))
})

test('汉字前缀 + 全角冒号（输入法直接打出来的）', () => {
  assert.equal(J(parseQuery('文本：剪贴板')), J({ type: 'text', text: '剪贴板' }))
  assert.equal(J(parseQuery('文件：报告')), J({ type: 'file', text: '报告' }))
})

test('汉字前缀 + 空格', () => {
  assert.equal(J(parseQuery('文本 报告')), J({ type: 'text', text: '报告' }))
  assert.equal(J(parseQuery('图片 假期')), J({ type: 'image', text: '假期' }))
})

test('全部: 等价于不过滤', () => {
  assert.equal(J(parseQuery('全部:报告')), J({ type: null, text: '报告' }))
  assert.equal(J(parseQuery('全部:')), J({ type: null, text: '' }))
})

test('前缀后面留空格 / 只有前缀', () => {
  assert.equal(J(parseQuery('文本:   foo')), J({ type: 'text', text: 'foo' }))
  assert.equal(J(parseQuery('文本:')), J({ type: 'text', text: '' }))
})

test('★ 字母前缀不再生效，就是普通搜索词', () => {
  assert.equal(J(parseQuery('t:剪贴板')), J({ type: null, text: 't:剪贴板' }))
  assert.equal(J(parseQuery('i love you')), J({ type: null, text: 'i love you' }))
  assert.equal(J(parseQuery('a good day')), J({ type: null, text: 'a good day' }))
})

test('★ 不误判：URL / Windows 路径 / 普通中文', () => {
  assert.equal(J(parseQuery('file:///Users/x')), J({ type: null, text: 'file:///Users/x' }))
  assert.equal(J(parseQuery('http://example.com')), J({ type: null, text: 'http://example.com' }))
  assert.equal(J(parseQuery('C:\\Users\\x')), J({ type: null, text: 'C:\\Users\\x' }))
  assert.equal(J(parseQuery('剪贴板')), J({ type: null, text: '剪贴板' }))
  assert.equal(J(parseQuery('全部')), J({ type: null, text: '全部' }))
  assert.equal(J(parseQuery('文件报告')), J({ type: null, text: '文件报告' }))
})

test('prefixOf：全部和收藏也有自己的前缀', () => {
  assert.equal(prefixOf(null), '全部:')
  assert.equal(prefixOf('all'), '全部:')
  assert.equal(prefixOf('text'), '文本:')
  assert.equal(prefixOf('image'), '图像:')
  assert.equal(prefixOf('file'), '文件:')
  assert.equal(prefixOf('favorites'), '收藏:')
})

test('★ catOf：分得清「全部」和「收藏」—— 它们的 type 都是 null，但分类不是一回事', () => {
  assert.equal(catOf(''), 'all')
  assert.equal(catOf('报告'), 'all')
  assert.equal(catOf('全部:'), 'all')
  assert.equal(catOf('文本:报告'), 'text')
  assert.equal(catOf('图像:'), 'image')
  assert.equal(catOf('图片 假期'), 'image')
  assert.equal(catOf('文件:'), 'file')
  assert.equal(catOf('收藏:'), 'favorites')
  assert.equal(catOf('收藏:笔记'), 'favorites')
})

/** 跟 App.vue 的 cycleType 调的是同一个函数 —— 这里只做一次转发，算法不重写 */
const tab = (box: string, delta = 1): string => cycleCat(box, delta)

test('Tab 循环：打开时框是空的，第一次 Tab 出「文本:」', () => {
  assert.equal(tab(''), '文本:')
  assert.equal(tab('文本:'), '图像:')
  assert.equal(tab('图像:'), '文件:')
  assert.equal(tab('文件:'), '收藏:')
  assert.equal(tab('收藏:'), '全部:')
  assert.equal(tab('全部:'), '文本:')
})

test('★ 收藏在循环里 —— 五站，收藏是最后一站', () => {
  assert.equal(TYPE_CYCLE.length, 5)
  assert.deepEqual(TYPE_CYCLE, ['全部:', '文本:', '图像:', '文件:', '收藏:'])
  assert.equal(TYPE_CYCLE[4], CAT_PREFIX.favorites)
})

test('⇧Tab 反向循环', () => {
  assert.equal(tab('', -1), '收藏:')
  assert.equal(tab('文本:', -1), '全部:')
  assert.equal(tab('全部:', -1), '收藏:')
  assert.equal(tab('收藏:', -1), '文件:')
})

test('切分类保住关键词', () => {
  assert.equal(tab('文本:报告'), '图像:报告')
  assert.equal(tab('图像:假期'), '文件:假期')
  assert.equal(tab('文件:日志'), '收藏:日志')
  assert.equal(tab('收藏:笔记'), '全部:笔记')
  assert.equal(tab('报告'), '文本:报告')
  assert.equal(tab('全部:报告'), '文本:报告')
})

test('每个前缀都能被解析回自己那一类', () => {
  for (const [t, p] of Object.entries(TYPE_PREFIX)) {
    assert.equal(parseQuery(p).type, t, `前缀 ${p} 解析不回 ${t}`)
  }
  assert.equal(parseQuery(TYPE_CYCLE[0]).type, null, '全部: 应解析为不过滤')
  // 五个分类成环：前缀 → 分类 → 前缀，转一圈得回到原地
  for (const p of TYPE_CYCLE) {
    assert.equal(prefixOf(catOf(p)), p, `前缀 ${p} 转一圈变成了 ${prefixOf(catOf(p))}`)
  }
})

test('空状态文案用中文分类名', () => {
  assert.deepEqual(TYPE_LABEL, { text: '文本', image: '图像', file: '文件' })
})

test('纯网址：带 http(s):// 或 www. 的整条内容才算', () => {
  assert.equal(isBareUrl('https://example.com'), true)
  assert.equal(isBareUrl('http://example.com/a/b?c=1#d'), true)
  assert.equal(isBareUrl('www.example.com'), true)
  assert.equal(isBareUrl('  https://example.com/x  '), true, '前后空白应忽略')
  assert.equal(isBareUrl('HTTPS://EXAMPLE.COM'), true, '大小写不敏感')
})

test('不是纯网址：夹在句子里、带空格的都不算', () => {
  assert.equal(isBareUrl('看这个 https://example.com'), false)
  assert.equal(isBareUrl('https://a.com https://b.com'), false, '两条链接不算一条')
  assert.equal(isBareUrl('https://a.com\nhttps://b.com'), false, '换行同理')
})

test('★ 裸域名不能认 —— 否则文件名全变成「链接」', () => {
  assert.equal(isBareUrl('example.com'), false)
  assert.equal(isBareUrl('readme.md'), false)
  assert.equal(isBareUrl('index.js'), false)
  assert.equal(isBareUrl('photo.png'), false)
  assert.equal(isBareUrl('v1.2.3'), false)
})

test('其他协议不是「网址」：file:/// 是本地路径，mailto 也不是', () => {
  assert.equal(isBareUrl('file:///Users/x/报告.pdf'), false)
  assert.equal(isBareUrl('mailto:a@b.com'), false)
})

test('非字符串一律不当网址，不炸', () => {
  assert.equal(isBareUrl(undefined), false)
  assert.equal(isBareUrl(null), false)
  assert.equal(isBareUrl(123), false)
})

test('行尾标签：纯网址的文本行显示「链接」', () => {
  assert.equal(labelOf({ type: 'text', content: 'https://example.com' }), '链接')
  assert.equal(labelOf({ type: 'text', content: '看这个 https://example.com' }), '文本')
  assert.equal(labelOf({ type: 'text', content: 'readme.md' }), '文本')
  assert.equal(labelOf({ type: 'text' }), '文本')
})

test('行尾标签：图片和文件不受影响', () => {
  assert.equal(labelOf({ type: 'image' }), '图像')
  assert.equal(labelOf({ type: 'file', content: 'https://example.com' }), '文件')
})
