# Message-Based Mode 测试计划

## 测试环境
- 分支: feat/message-based-mode
- 模式: GAUZ_MESSAGE_MODE=message

## 测试场景

### 1. 简单问答
**输入:** "你好"
**期望:**
- AI 直接输出文本
- 自动转发给用户
- 不调用 thinking 工具

### 2. 需要推理的任务
**输入:** "帮我分析一下 package.json 的依赖"
**期望:**
- AI 调用 thinking("先读取文件...")
- AI 调用 read("package.json")
- AI 调用 thinking("分析依赖...")
- AI 输出分析结果
- 自动转发给用户

### 3. 多步骤任务
**输入:** "读取 README.md 并总结要点"
**期望:**
- AI 调用 thinking("用户要总结 README")
- AI 调用 read("README.md")
- AI 调用 thinking("提取要点...")
- AI 输出总结
- 自动转发给用户

### 4. 文件操作
**输入:** "创建一个 test.txt 文件，内容是 hello"
**期望:**
- AI 调用 thinking("用户要创建文件")
- AI 调用 write("test.txt", "hello")
- AI 输出 "已创建文件"
- 自动转发给用户

## 验证点

### 功能验证
- [ ] thinking 工具正常工作
- [ ] thinking 内容不发送给用户
- [ ] 最终文本自动转发
- [ ] 不再调用 reply/pause_turn
- [ ] AI 能看到 thinking 历史

### 体验验证
- [ ] 交互自然流畅
- [ ] 响应及时
- [ ] 推理过程清晰（从 log 看）
- [ ] 不会提前输出文本

### 架构验证
- [ ] messages[] 包含完整历史
- [ ] thinking 保留在 session
- [ ] 压缩机制正常工作
- [ ] 没有 working/durable 分离

## 测试步骤

1. 编译项目: `npm run build`
2. 设置环境变量: `export GAUZ_MESSAGE_MODE=message`
3. 启动 bot: `npm run xiaoba:catscompany`
4. 在聊天界面测试上述场景
5. 查看 log 验证 thinking 调用
6. 记录测试结果和截图

## 预期问题

### 问题1: AI 提前输出文本
**现象:** AI 在调用工具前输出了文本
**原因:** Prompt 约束不够强
**解决:** 强化 system prompt

### 问题2: thinking 内容过多
**现象:** thinking 占用大量 token
**原因:** AI 过度使用 thinking
**解决:** 引导简洁 thinking

### 问题3: 不调用 thinking
**现象:** AI 直接调用工具，不 thinking
**原因:** 这是正常的，简单任务不需要 thinking
**解决:** 无需解决

## 成功标准

- ✅ 所有测试场景通过
- ✅ 用户体验自然
- ✅ Log 显示正确的工具调用顺序
- ✅ 没有 reply/pause_turn 调用
- ✅ thinking 工具正常工作
