/*
 * 键盘映射。
 *
 * 这里只有「按键 → 动作名」的翻译，动作本身由 App.vue 决定。
 * 这么切是为了让键位可以单独看、单独改：**下面的 `resolveKey` 就是键位的唯一说明处**。
 *
 * 原来这里还摆着一张手写的 `KEYMAP` 表（label/desc/action 三列），但它界面上根本不展示，
 * 只有一条测试在断言它自己 —— 等于把同一套键位写了两遍，两份还可能对不上
 * （它里面把上下合成一条 `↑ ↓`、又没有 Backspace，跟 `resolveKey` 已经有出入）。
 * 删掉之后，要看全部键位就读 `resolveKey` 那个 switch，只有一处可错。
 *
 * 修饰键：`resolveKey` **两个都收**（metaKey / ctrlKey），不做平台分支 ——
 * 因为对插件来说它们本来就是同一个动作。但**展示**必须分平台，
 * Windows 的键盘上根本没有 ⌘ 键。界面上统一走 `platform.ts` 的 `modKey()`，
 * 下面 `label` 里那个 ⌘ 只是「修饰键」的占位写法。
 *
 * 切分类为什么用 Tab / ⇧Tab 而不是 ⌘1~5：宿主那个搜索框握着焦点时，渲染层只把
 * `←→↑↓EnterTab` 六个键投给插件，`⌘1~5` 根本进不来。而 Tab 天然没有平台差异。
 * （⌘K / ⌘C / ⌘L 这些能用的前提是**焦点已经在插件里** —— 按一下 ↑↓ 就会过去，
 *  见 App.vue 的 takeKeyboard()；Esc 抢跑靠的是捕获监听器。）
 */

export type KeyAction =
  | 'up'
  | 'down'
  | 'enter'
  | 'escape'
  | 'remove'
  | 'focusSearch'
  | 'copy'
  | 'favorite'
  | 'toggleFavoritesView'
  | 'cycleType'
  | 'cycleTypeBack'
  | 'openSettings'

function withMod(key: string): KeyAction | null {
  switch (key) {
    case 'f':
      return 'focusSearch'
    case 'c':
      return 'copy'
    /*
     * ⚠️ ⌘D 宿主收不到：它被绑给了「分离插件」，插件视图下
     * `before-input-event` 直接拦掉并 preventDefault()（已核对宿主行为）。
     * 这个分支仍然留着 —— 既不碍事，哪天宿主改了行为它自己就活过来。
     * **但别把它当可靠入口**：收藏走下面的 ⌘K。
     */
    case 'd':
      return 'favorite'
    /*
     * 收藏当前项。
     *
     * 这个键的来龙去脉值得留着看 —— 围着它错了整整一天：
     *   ① 09-15 一度删掉过（理由写的是"收藏已经能从 Tab 那一站到达"），但那只说的是
     *      「切到收藏视图」，跟「把当前项加进收藏」是两件事；删了之后收藏就只剩
     *      鼠标点行尾 ☆ 一条路。老大当天让加回来，所以留着。
     *   ② 同一天老大报「用键盘收藏完全没反应」。**真因是宿主那个搜索框一直握着焦点**
     *      （真机上看得见：按 ↑↓ 时光标还在框里闪）—— 渲染层只把 ←→↑↓EnterTab 六个键
     *      投给插件，`⌘K` 在渲染层就被丢了。**是按键没进插件，不是没实现。**
     *      修法见 App.vue 的 takeKeyboard()：按 ↑↓ 时用 `ztools.subInputBlur()`
     *      把焦点让给插件视图，之后 ⌘ 组合键全部直达。
     *   ③ 排查途中还误判过两次（"页面没重载"、"⇧Enter 才是唯一到得了的键"），
     *      两条都已作废。**教训：别用推出来的机制去否掉真机现象。**
     */
    case 'k':
      return 'favorite'
    case 'l':
      return 'toggleFavoritesView'
    /*
     * ⌘/ 开设置。
     *
     * 为什么它必须存在：底栏可以设成「全隐」—— 那一档下鼠标**没有任何**入口，
     * 这条键就是唯一的出路。**别哪天觉得它没人用就删掉**，删了等于把
     * 选了「全隐」的人锁死（连改回其他档都做不到）。
     *
     * 跟 ⌘K / ⌘C / ⌘L 同一个前提：**焦点得先在插件里**。
     * 搜索框握着焦点时宿主只投那六个键，⌘ 组合键在渲染层就被丢掉了 ——
     * 所以按之前先按一下 ↑↓ 把焦点要过来（App.vue 的 takeKeyboard()）。
     */
    case '/':
      return 'openSettings'
    default:
      return null
  }
}

export function resolveKey(e: KeyboardEvent): KeyAction | null {
  if (e.metaKey || e.ctrlKey) return withMod(e.key.toLowerCase())

  switch (e.key) {
    case 'ArrowUp':
      return 'up'
    case 'ArrowDown':
      return 'down'
    case 'Enter':
      return 'enter'
    case 'Escape':
      return 'escape'
    case 'Tab':
      // Tab 是极少数「搜索框有焦点时宿主也会转发给插件」的键，靠它才切得动分类
      return e.shiftKey ? 'cycleTypeBack' : 'cycleType'
    case 'Backspace':
    case 'Delete':
      return 'remove'
    case '/':
      return 'focusSearch'
    default:
      return null
  }
}
