---
name: advanced-reader
description: 高级文件读取技能。当主模型不支持视觉识别（如无法直接读取图片、PDF、扫描件等）时，使用此技能完成文件分析。
category: 工具
invocable: both
argument-hint: "<文件路径> [分析需求描述]"
---

# Advanced Reader（高级读取器）

当用户发送图片或 PDF 文件，需要描述、分析或提取内容时，**使用 execute_shell 工具执行 curl 命令调用微服务**。

## 使用场景

- 用户发送了图片（截图、照片、图表）
- 用户发送了 PDF 文档
- 主模型无法读取这些文件时

## 单文件分析

```bash
curl -X POST "http://localhost:8000/analyze" \
  -F "file=@<文件路径>" \
  -F "prompt=<分析需求>"
```

**使用示例：**
- 用户："帮我看看这张图" → `curl -X POST "http://localhost:8000/analyze" -F "file=@图片.png" -F "prompt=详细描述这张图"`
- 用户："总结这个 PDF" → `curl -X POST "http://localhost:8000/analyze" -F "file=@文档.pdf" -F "prompt=总结这个文档"`
- 用户："这是什么" → `curl -X POST "http://localhost:8000/analyze" -F "file=@文件路径" -F "prompt=描述这张图"`

## 批量分析

```bash
curl -X POST "http://localhost:8000/analyze/batch" \
  -F "files=@图1.png" \
  -F "files=@图2.png" \
  -F "files=@图3.png" \
  -F "prompt=<分析需求>"
```

## 配置

- 微服务地址默认 `http://localhost:8000`
- 可通过环境变量 `ADVANCED_READER_URL` 配置其他地址

**禁止**只回复而不执行！
