# self-reliant-gym

weixin miniprogram for user in gym. help user to train in gym without trouble.

## 开发

```bash
pnpm install        # 安装依赖
pnpm format         # 格式化 wxml / wxss / json
pnpm format:check   # 只检查格式，不修改文件
pnpm format:wxml    # 只格式化 wxml
```

代码风格由 [Prettier](https://prettier.io) + [@tofrankie/prettier-plugin-wxml](https://www.npmjs.com/package/@tofrankie/prettier-plugin-wxml)
统一维护，配置见 `.prettierrc`：

- `.wxml` 使用 `wxml` 解析器，`htmlWhitespaceSensitivity: ignore`（避免把标签 `>` 挪到行首，保持可读）
- `.wxss` 使用 `css` 解析器，`.wxs` 使用 `babel` 解析器
- 行宽 100，缩进 2 空格

> 注意：该插件的宽度测量在第一遍会略微保守，`pnpm format` 因此执行两次以得到稳定结果；
> 如果编辑器保存时只格式化一次，`pnpm format:check` 可能仍提示个别超长标签行，再跑一次即可。

## 样式结构

样式按「全局基座 → 复用片段 → 页面/组件专属」三层组织，避免所有类堆在同一个全局命名空间：

```
app.wxss                    全局基座：page、.page、.title/.sub/.muted/.row、input/button
styles/card.wxss            卡片族片段：.card/.panel/.label/.grow
styles/interactive.wxss     交互片段：.primary/.chip/.on
pages/<page>/index.wxss     页面专属样式，按需 @import 上面的片段
```

（休息倒计时弹窗的样式跟着训练页走，写在 `pages/workout/index.wxss` 的 `.rest-*` 段；原先的 `components/rest-timer` 组件已并入该页。）

约定：

- 只在本页使用的类写进该页 `index.wxss`，不会外泄到其它页面
- 两个及以上页面共用的样式放 `styles/`，页面用 `@import "../../styles/xxx.wxss";` 引入（必须写在文件顶部）
- 排版原子（标题、正文、行距）留在 `app.wxss`，保证全站观感一致

## 自定义周计划（pages/custom）

排周计划是一个独立页面，计划库（`pages/plans`）只负责展示和跳转。入口有三种，都落在同一页：

- 空手新建：`/pages/custom/index`
- 调整已有计划：`/pages/custom/index?id=<计划 ID>`，保存时带 `ID` 原地覆盖
- 从模板或智能草案起稿：`?template=<模板下标>` / `?draft=1`。草案动作太多塞不进 URL，
  由计划库写进本地缓存 `plan:draft` 交接，编辑页读到即清掉

保存成功后弹「让我们马上开练吧」：确认则 `redirectTo` 去清单页（返回时直接回计划库，
不会退回已经保存过的编辑页），取消则 `navigateBack`。计划库的计划列表放在 `onShow` 里拉，
这样从编辑页退回时能立刻看到新增或改名后的计划。

## 动作库（pages/library）

全站统一用系统导航栏 + 白底，动作库这页也一样：浅灰搜索框、黑色选中态 chip、细线描边卡片，
不引入主题色。布局上有三点需要留意：

- **顶部（搜索 + 器材分类）固定**，下面左右两栏各自是独立的 `scroll-view`，互不影响。两栏高度由
  JS 算：`窗口高 − .top 实测高`，在 `onReady` 和「分类数据到达后」各量一次（分类行要等渲染完才有高度），
  不要改成写死的 rpx。
- **左侧是可折叠的两级菜单**：有细分的部位默认收起（只展开第一个），点部位＝展开/收起并选中整个部位，
  点细分＝只看该细分。收起靠给子项打 `hidden` 标记 + `wx:if` 控制显隐，不重建数组，展开状态才能留住。
- 侧栏与卡片的数据都来自 `/api/v1/exercises` 与 `/api/v1/categories`：部位顺序、细分肌群和器材
  分类由接口返回，页面里不硬编码；`kind=器材库` 时同一页面把左侧换成具体器材（`.side.wide` 放宽）。

其余二级页（含 `pages/agreement` 服务协议）也是系统导航栏 + `.page` 白底排版，标题用 `.title`，
条款用 `.block-title` + `.block-line`（圆点前缀），和「隐私说明」保持一致。

