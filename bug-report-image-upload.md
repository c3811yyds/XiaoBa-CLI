# Bug Report: 图片上传失败 - invalid image type

**日期**: 2026-05-03
**严重程度**: High
**模块**: CatsCompany 通道 - 文件上传

---

## 问题描述

通过 XiaoBa CLI 的 `send_file` 工具上传 PNG 图片时，服务端返回 `400 {"error":"invalid image type"}`，图片发送失败。

---

## 环境信息

| 配置项 | 值 |
|--------|-----|
| XiaoBa 版本 | 1.0.3 |
| 上传端点 | `https://app.catsco.cc/api/upload?type=image` |
| 文件路径 | `/Users/zhuhanyuan/Desktop/截屏2026-05-03 19.30.23.png` |
| 文件大小 | 565409 bytes |
| 文件类型 | PNG (image/png) |
| 认证方式 | ApiKey (`cc_6c_f54c8c690245c3d4591c841bb368a42b4118265bbbd0c0f106dfffbdcf285b29`) |

---

## 复现步骤

1. 在 CatsCompany 群组中发送消息："查看桌面有什么文件"
2. XiaoBa 列出桌面文件，发现一张截图 `截屏2026-05-03 19.30.23.png`
3. 用户要求发送截图
4. XiaoBa 调用 `send_file` 工具，参数：`{"file_path":"/Users/zhuhanyuan/Desktop/截屏2026-05-03 19.30.23.png","file_name":"截屏2026-05-03 19.30.23.png"}`
5. 上传失败

---

## 完整错误日志

```
[DEBUG] 开始上传文件到: https://app.catsco.cc/api/upload?type=image, 大小: 565409 bytes
[DEBUG] Upload failed: 400 {"error":"invalid image type"}
[DEBUG] Upload error: Upload failed: 400 - {"error":"invalid image type"}
 undefined
✗ 文件发送失败 (截屏2026-05-03 19.30.23.png): Upload failed: Upload failed: 400 - {"error":"invalid image type"}

错误堆栈:
Error: Upload failed: Upload failed: 400 - {"error":"invalid image type"}
    at CatsClient.uploadFile (/Users/zhuhanyuan/Documents/XiaoBa-CLI/dist/catscompany/client.js:196:19)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async MessageSender.sendFile (/Users/zhuhanyuan/Documents/XiaoBa-CLI/dist/catscompany/message-sender.js:153:34)
    at async Object.sendFile (/Users/zhuhanyuan/Documents/XiaoBa-CLI/dist/catscompany/index.js:103:21)
    at async SendFileTool.execute (/Users/zhuhanyuan/Documents/XiaoBa-CLI/dist/tools/send-file-tool.js:53:13)
    at async ToolManager.executeTool (/Users/zhuhanyuan/Documents/XiaoBa-CLI/dist/tools/tool-manager.js:137:28)
    at async ConversationRunner.executeToolWithRetry (/Users/zhuhanyuan/Documents/XiaoBa-CLI/dist/core/conversation-runner.js:659:26)
    at async ConversationRunner.run (/Users/zhuhanyuan/Documents/XiaoBa-CLI/dist/core/conversation-runner.js:200:30)
    at async AgentTurnController.run (/Users/zhuhanyuan/Documents/XiaoBa-CLI/dist/core/agent-turn-controller.js:48:24)
    at async /Users/zhuhanyuan/Documents/XiaoBa-CLI/dist/core/agent-session.js:198:32)
```

---

## 客户端代码（相关部分）

**文件**: `src/catscompany/client.ts` 第 164-198 行

```typescript
async uploadFile(filePath: string, type: 'image' | 'file' = 'file'): Promise<UploadResult> {
  const httpBaseUrl = (this.config.httpBaseUrl || 'https://app.catsco.cc').replace(/\/$/, '');
  const url = `${httpBaseUrl}/api/upload?type=${type}`;

  const buffer = fs.readFileSync(filePath);
  const filename = path.basename(filePath);

  try {
    console.log(`[DEBUG] 开始上传文件到: ${url}, 大小: ${buffer.length} bytes`);

    const formData = new FormData();
    formData.append('file', new Blob([buffer]), filename);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `ApiKey ${this.config.apiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.log('[DEBUG] Upload failed:', res.status, errorText);
      throw new Error(`Upload failed: ${res.status} - ${errorText}`);
    }
    // ...
  }
}
```

---

## 可能的根因

1. **服务端不支持 PNG 格式**：API 可能只接受 jpg/jpeg 或 webp 格式
2. **图片尺寸限制**：服务端可能对图片尺寸有上限
3. **API 接口路径问题**：`/api/upload?type=image` 可能需要其他参数
4. **服务端验证逻辑错误**：服务端图片类型判断逻辑有 bug

---

## 期望行为

上传 PNG 图片应该成功，并在群组中显示图片。

---

## 附加信息

- 该问题在多次调用中稳定复现
- 相同的文件通过其他客户端（如果有）是否正常未知
- 测试过 7 次上传，均失败
