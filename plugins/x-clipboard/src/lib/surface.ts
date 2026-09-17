/*
 * 面板底色。
 *
 * 起因是「顶部那行」和「下面的列表」有色差。查实之后发现一个关键事实：
 * **上面那行根本没有画底色** —— 宿主渲染层里 `.search-box` / `.search-input` 都是透明的，
 * 而且宿主创建插件视图时明确写了 `view.setBackgroundColor('#00000000')`，
 * 主窗口在 macOS 上又是 `transparent + vibrancy: 'fullscreen-ui'` 的毛玻璃。
 * 所以我们看到的那层颜色是**窗口材质透出来的**，不是一个色号。
 *
 * ⇒ 想跟它零色差，唯一的正解是**自己也别画**，而不是去配一个相近的颜色。
 *    这就是默认值 `auto`（透明）。它还白送两件事：
 *      ① 顶部那行和列表天然同色，永远不会有色差；
 *      ② 深浅色直接跟着窗口材质走 —— 不用我们再判断主题，也不会出现「宿主深色、面板还是白的」。
 *
 * 其余几个预设是给「就是想要一块实底」的人准备的。每个预设都有浅色 / 深色两版
 * （跟 accent.ts 一个套路：**名字说的是风格，不是某个具体色号**），
 * 这样切主题时不会变成「浅色面板配深色字」。
 */

export type BgMode = 'auto' | 'white' | 'gray' | 'warm' | 'cool'

export interface BgPreset {
  key: BgMode
  light: string
  dark: string
}

/** 顺序就是设置面板里的显示顺序 */
export const BG_PRESETS: readonly BgPreset[] = [
  { key: 'white', light: '#ffffff', dark: '#1e1f22' },
  { key: 'gray', light: '#f2f2f4', dark: '#26272b' },
  { key: 'warm', light: '#faf6f0', dark: '#232120' },
  { key: 'cool', light: '#f1f4f7', dark: '#1e2226' }
]

/** 合法值列一份，校验用它（跟 MARK_MODES / ACCENT_KEYS 一个写法） */
export const BG_KEYS: readonly BgMode[] = ['auto', ...BG_PRESETS.map((p) => p.key)]

function presetOf(mode: BgMode): BgPreset | undefined {
  return BG_PRESETS.find((x) => x.key === mode)
}

/**
 * 算出真正要写进 `--surface`（面板）的值。
 *
 * 认不出的一律当 `auto`（透明）—— 透明只是「没画底」，
 * 比给一个错的实底安全得多（错的实底会让整个面板跟顶部撞色）。
 */
export function resolveBg(mode: BgMode, isDark: boolean): string {
  const p = presetOf(mode)
  return p ? (isDark ? p.dark : p.light) : 'transparent'
}

/**
 * 浮层（详情 `.peek` / 设置 `.sheet` / 确认框 `.box` / 淡入底栏 `.foot.fade`）该用哪个底色。
 *
 * **返回 `null` = 不覆盖** —— 让 `base.css` 里那层中性实底（浅 `#ffffff` / 深 `#1e1f22`）说话。
 *
 * 两条规则，**都试过、都定下来了**：
 *   - **面板选了实底预设（白 / 灰 / 暖 / 冷）** → 跟着面板**同一个色号**。
 *     不跟的话，选个暖色面板、详情框还是冷白，看着就像这个设置没生效
 *     （老大 09-16 原话：「详情框的底色应该根据底色的设置来」）。**这一档他确认过没问题。**
 *   - **面板是「默认」（不画底）** → **`null`，浮层自己用中性实底**。
 *     这一档**没有颜色可跟**：面板本身就是透明的。
 *     试过"跟到底"——浮层也 `transparent`（再配 `backdrop-filter` 把底下糊掉）：
 *     列表是密集文字，跟着透明就**重影**，糊完也仍是一团灰影加绿影，
 *     详情框和设置面板都脏兮兮的，老大否掉（「效果都确实不太好」）。
 *     ⇒ **只在「默认」这一档，浮层自己立住；预设档照旧跟随。**
 *       别把这条读成"浮层不跟随底色"——跟随是默认行为，「默认」档只是没得跟。
 */
export function resolveFloatBg(mode: BgMode, isDark: boolean): string | null {
  const p = presetOf(mode)
  return p ? (isDark ? p.dark : p.light) : null
}
