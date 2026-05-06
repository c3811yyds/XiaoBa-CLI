import { CatsClient } from './client';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

const MAX_MSG_LENGTH = 4000;

export class MessageSender {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private bot: CatsClient, baseUrl?: string, apiKey?: string) {
    this.baseUrl = baseUrl || 'https://app.catsco.cc';
    this.apiKey = apiKey || '';
  }

  /**
   * 统一的消息发送接口：WebSocket 优先，HTTP 兜底。
   */
  private async send(
    topic: string,
    type: 'thinking' | 'tool_use' | 'tool_result' | 'text',
    content: string,
    metadata?: any
  ): Promise<{ seq_id: number }> {
    // WebSocket 优先
    try {
      const seq = await this.bot.sendPubMessage({
        topic,
        content,
        type,
        metadata,
      });
      return { seq_id: seq };
    } catch (err: any) {
      Logger.warning(`WebSocket 发送失败，使用 HTTP 兜底: ${err.message}`);
      return this.sendViaHttp(topic, type, content, metadata);
    }
  }

  /**
   * HTTP 兜底发送（当 WebSocket 不可用时）
   */
  private async sendViaHttp(
    topic: string,
    type: string,
    content: string,
    metadata?: any
  ): Promise<{ seq_id: number }> {
    try {
      const url = `${this.baseUrl}/api/messages/send`;
      const body: Record<string, unknown> = {
        topic_id: topic,
        type,
        content,
      };
      if (metadata) body.metadata = metadata;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `ApiKey ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const errText = await res.text();
        Logger.error(`消息发送失败: HTTP ${res.status} - ${errText}`);
        throw new Error(`Failed to send message: ${res.status}`);
      }

      const result = await res.json() as { seq_id: number };
      Logger.info(`HTTP 兜底发送成功, seq_id=${result.seq_id}`);
      return result;
    } catch (err: any) {
      Logger.error(`HTTP 兜底发送也失败: ${err.message}`);
      throw err;
    }
  }

  /**
   * 发送 thinking
   */
  async sendThinking(topic: string, thinking: string): Promise<void> {
    await this.send(topic, 'thinking', thinking);
    Logger.info(`Thinking 已发送: ${thinking.slice(0, 50)}...`);
  }

  /**
   * 发送 tool_use
   */
  async sendToolUse(topic: string, toolUseId: string, name: string, input: any): Promise<void> {
    await this.send(topic, 'tool_use', name, { id: toolUseId, input });
    Logger.info(`Tool use 已发送: ${name}, id=${toolUseId}`);
  }

  /**
   * 发送 tool_result
   */
  async sendToolResult(
    topic: string,
    toolUseId: string,
    content: string,
    isError = false
  ): Promise<void> {
    await this.send(topic, 'tool_result', content, {
      tool_use_id: toolUseId,
      is_error: isError,
    });
    Logger.info(`Tool result 已发送: tool_use_id=${toolUseId}`);
  }

  /**
   * 发送普通文本消息
   */
  async sendText(topic: string, text: string): Promise<void> {
    await this.send(topic, 'text', text);
    Logger.info(`Text 已发送: ${text.slice(0, 50)}...`);
  }

  async reply(topic: string, text: string): Promise<void> {
    const segments = this.splitText(text, MAX_MSG_LENGTH);
    for (const seg of segments) {
      await this.sendText(topic, seg);
    }
  }

  sendTyping(topic: string): void {
    try {
      this.bot.sendTyping(topic);
    } catch {}
  }


  private splitText(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];

    const segments: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        segments.push(remaining);
        break;
      }

      let cutAt = remaining.lastIndexOf('\n', maxLen);
      if (cutAt <= 0) cutAt = maxLen;

      segments.push(remaining.slice(0, cutAt));
      remaining = remaining.slice(cutAt).replace(/^\n/, '');
    }

    return segments;
  }

  async sendFile(topic: string, filePath: string, fileName: string): Promise<void> {
    try {
      if (!fs.existsSync(filePath)) {
        Logger.error(`文件不存在: ${filePath}`);
        throw new Error(`文件不存在: ${filePath}`);
      }

      const ext = path.extname(fileName).toLowerCase();
      const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext.slice(1));
      const uploadType = isImage ? 'image' as const : 'file' as const;

      const fileSize = fs.statSync(filePath).size;
      Logger.info(`开始上传文件: ${fileName} (${fileSize} bytes, type: ${uploadType})`);

      const uploadResult = await this.bot.uploadFile(filePath, uploadType);
      Logger.info(`文件上传成功: ${uploadResult.url}`);

      if (isImage) {
        await this.bot.sendImage(topic, uploadResult);
      } else {
        await this.bot.sendFile(topic, uploadResult);
      }

      Logger.info(`CatsCo 文件已发送: ${fileName}`);
    } catch (err: any) {
      Logger.error(`文件发送失败 (${fileName}): ${err.message}`);
      Logger.error(`错误堆栈: ${err.stack}`);
      throw err;
    }
  }

  async downloadFile(url: string, fileName: string): Promise<string | null> {
    try {
      const tmpDir = path.join(process.cwd(), 'tmp', 'downloads');
      fs.mkdirSync(tmpDir, { recursive: true });

      // 处理相对路径，拼接完整 URL
      const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;

      const localPath = path.join(tmpDir, `${Date.now()}_${fileName}`);
      const res = await fetch(fullUrl);
      if (!res.ok) {
        Logger.error(`文件下载失败: HTTP ${res.status} - ${url}`);
        return null;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(localPath, buffer);
      Logger.info(`文件已下载: ${fileName} → ${localPath} (${buffer.length} bytes)`);
      return localPath;
    } catch (err: any) {
      Logger.error(`文件下载失败: ${err.message}`);
      return null;
    }
  }

}
