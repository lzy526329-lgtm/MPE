# Animal Flip Implementation Plan

**Goal:** 在已有桌宠工具箱内交付可游玩的象狮虎豹人机对战。
**Architecture:** 独立纯规则模块、仅可见状态 AI、页面生命周期/交互、相对路径资源映射、局部 CSS；接入现有导航。
**Tech Stack:** TypeScript, DOM/CSS, Vitest, Vite/Electron，无新增依赖。
**Spec:** ../specs/2026-09-22-animal-flip-design.md

## Global Constraints

用户已确认设计并授权执行。本次在当前目录功能分支实现；不发版、不推送。图片逐段编码并以 ./ 开头；红方先手、蓝方电脑、每回合仅一动作；同级消失；电脑不可获得暗牌身份。

## Tasks

- [ ] 1. 规则与 AI：创建 src/animalFlipEngine.ts 和 src/animalFlipAi.ts。先创建 src/__tests__/animalFlipEngine.test.ts，以手工局面断言翻牌换边、非法动作不变、正交移动、大小吃牌、鼠象例外、同级消失、暗牌计入存活和终局。API: createAnimalGame(rng?), playAnimalAction(state, actor, action), legalAnimalActions(state), observeAnimalGame(state), chooseAnimalAction(observation, rng?)。动作是 {type:'flip',at} 或 {type:'move',from,to}。运行 npm test -- src/__tests__/animalFlipEngine.test.ts，观察失败后实现并复测。
- [ ] 2. 素材与页面：创建 src/animalFlipAssets.ts, src/animalFlipPage.ts, src/animalFlip.css。API: animalCardImage(animal,side), ANIMAL_CARD_BACK, renderAnimalFlip(state,selected), mountAnimalFlipPage()。编写资源路径测试确认全部文件实际存在且 Windows/macOS URL 正确；页面渲染测试确认未翻牌不暴露动物/阵营且仅红方允许输入。生命周期测试用受控计时验证重开和暂停，不依赖真实延迟。
- [ ] 3. 入口：src/appPages.ts 注册 animal-flip-page；src/main.ts 添加 root 并挂载；electron/appPages.ts 加入 PET_GAME_MENU。更新现有导航测试验证菜单、进入/离开页面。
- [ ] 4. 验证交付：全套 npm test、tsc --noEmit、Vite 构建、构建资源和相对 URL 检查；实际浏览器点击翻牌/选择/移动/重开、窄屏截图、电脑等待期间输入保护。记录结果至设计文档并更新 README 玩法说明。保留可审阅的本地 diff。
