import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { Tool, ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../types/tool';
import { isReadPathAllowed } from '../utils/safety';
import { createImageBlock } from '../utils/image-utils';
import { ConfigManager } from '../utils/config';
import { isPrimaryModelVisionCapable } from '../utils/model-capabilities';
import { analyzeImageWithReaderProxy, ReaderProxyResult } from '../utils/reader-proxy';
import { Logger } from '../utils/logger';
import { formatPathForLog } from '../utils/log-redaction';
import { resolveLocalFileAccess, resolveLocalFileReference } from './local-file-gateway';
import { formatCatsCoVisiblePath } from './tool-gateway';
import { executeRouteIfRemote, resolveExecutionRoute, targetParameterDescription } from './execution-router';

export const DEFAULT_TEXT_READ_LIMIT = 200;
export const MAX_TEXT_READ_LIMIT = 2000;
export const MAX_TEXT_READ_BYTES = 256 * 1024;
export const DEFAULT_PDF_READ_PAGES = 10;
export const MAX_PDF_READ_PAGES = 30;
export const MAX_PDF_READ_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_OUTPUT_BYTES = 192 * 1024;

interface PdfParseOptions {
  max?: number;
  version?: string;
  pagerender?: (pageData: any) => Promise<string>;
}

interface PdfParseResult {
  numpages?: number;
  numrender?: number;
  text?: string;
  info?: Record<string, unknown>;
}

type PdfParse = (dataBuffer: Buffer, options?: PdfParseOptions) => Promise<PdfParseResult>;
const pdfParse: PdfParse = require('pdf-parse');

interface TextReadOptions {
  offset?: unknown;
  limit?: unknown;
}

interface NormalizedTextReadOptions {
  startLine: number;
  lineLimit?: number;
  requestedLimit?: number;
  isDefaultLimit: boolean;
  isUnlimitedRequest: boolean;
  limitWasCapped: boolean;
}

interface TextReadResult {
  lines: string[];
  totalLines: number;
  totalLinesKnown: boolean;
  readLines: number;
  startLine: number;
  endLine: number;
  reachedLineLimit: boolean;
  reachedByteLimit: boolean;
  limitWasCapped: boolean;
  isDefaultLimit: boolean;
  isUnlimitedRequest: boolean;
  requestedLimit?: number;
  nextOffset?: number;
}

interface PdfPageSelection {
  label: string;
  maxPageToRender: number;
  selectedPages?: Set<number>;
  warnings: string[];
}

/**
 * Read tool - reads local files and returns content to the model.
 */
export class ReadTool implements Tool {
  definition: ToolDefinition = {
    name: 'read_file',
    description: [
      '读取一个本地文件或当前用户轮次授权的 CatsCo 附件。',
      '支持文本/代码、PDF、图片和 Jupyter notebook。文本默认只读前若干行，可用 offset/limit 分页。',
      '图片会按当前模型能力处理：视觉模型收到图片块，非视觉模型收到 reader proxy 的文字解析结果。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: '要读取的文件路径或授权附件引用。支持绝对路径、相对当前目录路径、catsco_attachment:<id>。',
        },
        offset: {
          type: 'number',
          description: '从第几行开始读取，1-based，默认从第 1 行开始，仅适用于文本文件。',
        },
        limit: {
          type: 'number',
          description: `最多读取多少行，仅适用于文本文件。默认 ${DEFAULT_TEXT_READ_LIMIT} 行；设为 0 表示尝试读取全文，但仍受输出字节上限保护。`,
        },
        pages: {
          type: 'string',
          description: 'PDF 页码范围，例如 "1-5" 或 "3"。仅适用于 PDF。',
        },
        prompt: {
          type: 'string',
          description: '可选。读取图片时的分析目标；不传则使用当前用户请求作为分析目标。',
        },
        target: targetParameterDescription(),
      },
      required: ['file_path'],
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { file_path, offset, limit, pages, prompt, analysis_prompt } = args;

    if (!file_path || typeof file_path !== 'string') {
      return { ok: false, errorCode: 'TOOL_EXECUTION_ERROR', message: '文件路径不能为空' };
    }

    let absolutePath: string;
    let displayPath = file_path;
    let visiblePath: string;
    let visibleInputPath = file_path;
    let resolvedFromAttachmentRef = false;
    let authorizedByLocalFileGrant = false;

    const reference = resolveLocalFileReference(context, {
      operation: 'read_file',
      inputPath: file_path,
    });
    if (reference.matched) {
      if (!reference.ok) {
        return {
          ok: false,
          errorCode: reference.errorCode,
          message: reference.message,
        };
      }
      absolutePath = reference.absolutePath;
      displayPath = reference.displayPath;
      visiblePath = reference.displayPath;
      visibleInputPath = reference.displayPath;
      resolvedFromAttachmentRef = true;
      authorizedByLocalFileGrant = true;
    } else {
      absolutePath = path.isAbsolute(file_path)
        ? file_path
        : path.join(context.workingDirectory, file_path);
      visiblePath = absolutePath;
    }

    if (!resolvedFromAttachmentRef) {
      const localAccess = resolveLocalFileAccess(context, {
        operation: 'read_file',
        absolutePath,
      });
      if (!localAccess.ok) {
        return {
          ok: false,
          errorCode: localAccess.errorCode,
          message: localAccess.message,
        };
      }
      if (localAccess.displayPath) {
        displayPath = localAccess.displayPath;
        visiblePath = localAccess.displayPath;
        visibleInputPath = localAccess.displayPath;
      }
      authorizedByLocalFileGrant = Boolean(localAccess.grant);
    }

    if (!authorizedByLocalFileGrant) {
      const route = resolveExecutionRoute(context, {
        toolName: this.definition.name,
        operation: 'read_file',
        target: args.target,
      });
      if (!route.ok) {
        return {
          ok: false,
          errorCode: route.errorCode,
          message: route.message,
        };
      }
      const remoteResult = await executeRouteIfRemote(context, route, 'read_file', 'read_file', args);
      if (remoteResult) return remoteResult;

      const pathPermission = isReadPathAllowed(absolutePath, context.workingDirectory);
      if (!pathPermission.allowed) {
        return { ok: false, errorCode: 'PERMISSION_DENIED', message: `执行被阻止: ${pathPermission.reason}` };
      }
      displayPath = formatCatsCoVisiblePath(context, displayPath, { preserveRelative: true });
      visiblePath = formatCatsCoVisiblePath(context, visiblePath);
      visibleInputPath = formatCatsCoVisiblePath(context, file_path);
    }

    if (!fs.existsSync(absolutePath)) {
      return { ok: false, errorCode: 'FILE_NOT_FOUND', message: `错误：文件不存在: ${visiblePath}` };
    }

    try {
      const stats = fs.statSync(absolutePath);
      if (!stats.isFile()) {
        return {
          ok: false,
          errorCode: 'TOOL_EXECUTION_ERROR',
          message: [
            'Path is not a file.',
            `Input path: ${visibleInputPath}`,
            `Resolved path: ${visiblePath}`,
          ].join('\n'),
        };
      }
    } catch {
      return { ok: false, errorCode: 'FILE_NOT_FOUND', message: `错误：文件不存在: ${visiblePath}` };
    }

    const ext = path.extname(absolutePath).toLowerCase();

    if (ext === '.pdf') {
      const content = await this.readPDF(absolutePath, displayPath, visiblePath, pages);
      return { ok: true, content };
    }

    if (this.isImageExt(ext)) {
      const content = await this.readImage(absolutePath, displayPath, visiblePath, context, prompt || analysis_prompt);
      return { ok: true, content: content as any };
    }

    if (ext === '.ipynb') {
      const content = this.readNotebook(absolutePath, displayPath, visiblePath);
      return { ok: true, content };
    }

    const content = await this.readTextFile(absolutePath, displayPath, visiblePath, { offset, limit }, context);
    return { ok: true, content };
  }

  private normalizeTextReadOptions({ offset, limit }: TextReadOptions): NormalizedTextReadOptions {
    const parsedOffset = Number(offset);
    const startLine = Number.isFinite(parsedOffset) && parsedOffset > 0
      ? Math.floor(parsedOffset)
      : 1;

    if (limit === 0 || limit === '0') {
      return {
        startLine,
        isDefaultLimit: false,
        isUnlimitedRequest: true,
        limitWasCapped: false,
      };
    }

    const parsedLimit = Number(limit);
    const hasExplicitLimit = limit !== undefined && limit !== null && limit !== '';
    const requestedLimit = hasExplicitLimit && Number.isFinite(parsedLimit)
      ? Math.floor(parsedLimit)
      : undefined;

    if (!hasExplicitLimit || requestedLimit === undefined || requestedLimit <= 0) {
      return {
        startLine,
        lineLimit: DEFAULT_TEXT_READ_LIMIT,
        isDefaultLimit: true,
        isUnlimitedRequest: false,
        limitWasCapped: false,
      };
    }

    return {
      startLine,
      lineLimit: Math.min(requestedLimit, MAX_TEXT_READ_LIMIT),
      requestedLimit,
      isDefaultLimit: false,
      isUnlimitedRequest: false,
      limitWasCapped: requestedLimit > MAX_TEXT_READ_LIMIT,
    };
  }

  private trimToUtf8ByteLimit(value: string, maxBytes: number): string {
    if (maxBytes <= 0) return '';
    const buffer = Buffer.from(value, 'utf-8');
    if (buffer.length <= maxBytes) return value;
    return buffer.subarray(0, maxBytes).toString('utf-8');
  }

  private async collectTextLines(
    absolutePath: string,
    options: NormalizedTextReadOptions,
    context: ToolExecutionContext,
  ): Promise<TextReadResult> {
    const selectedLines: string[] = [];
    let totalLines = 0;
    let totalLinesKnown = true;
    let selectedBytes = 0;
    let reachedLineLimit = false;
    let reachedByteLimit = false;

    const input = fs.createReadStream(absolutePath, { encoding: 'utf-8' });
    const reader = readline.createInterface({ input, crlfDelay: Infinity });

    const abort = () => {
      input.destroy(new Error('读取已取消'));
      reader.close();
    };
    context.abortSignal?.addEventListener('abort', abort, { once: true });

    try {
      for await (const line of reader) {
        if (context.abortSignal?.aborted) {
          throw new Error('读取已取消');
        }

        totalLines += 1;

        if (totalLines < options.startLine) continue;

        const relativeLineIndex = totalLines - options.startLine;
        if (options.lineLimit !== undefined && relativeLineIndex >= options.lineLimit) {
          reachedLineLimit = true;
          totalLinesKnown = false;
          break;
        }

        const lineBytes = Buffer.byteLength(line, 'utf-8') + 1;
        const remainingBytes = MAX_TEXT_READ_BYTES - selectedBytes;
        if (lineBytes > remainingBytes) {
          const trimmed = this.trimToUtf8ByteLimit(line, Math.max(remainingBytes - 1, 0));
          if (trimmed) {
            selectedLines.push(trimmed);
            selectedBytes = MAX_TEXT_READ_BYTES;
          }
          reachedByteLimit = true;
          totalLinesKnown = false;
          break;
        }

        selectedLines.push(line);
        selectedBytes += lineBytes;
      }
    } finally {
      context.abortSignal?.removeEventListener('abort', abort);
    }

    const readLines = selectedLines.length;
    const endLine = readLines > 0 ? options.startLine + readLines - 1 : options.startLine - 1;
    const hasMoreAfterSelection = totalLines > endLine && endLine >= options.startLine;
    const nextOffset = hasMoreAfterSelection ? endLine + 1 : undefined;

    return {
      lines: selectedLines,
      totalLines,
      totalLinesKnown,
      readLines,
      startLine: options.startLine,
      endLine,
      reachedLineLimit,
      reachedByteLimit,
      limitWasCapped: options.limitWasCapped,
      isDefaultLimit: options.isDefaultLimit,
      isUnlimitedRequest: options.isUnlimitedRequest,
      requestedLimit: options.requestedLimit,
      nextOffset,
    };
  }

  private formatTextReadResult(filePath: string, displayPath: string, result: TextReadResult): string {
    const formattedLines = result.lines
      .map((line, index) => {
        const lineNumber = result.startLine + index;
        return `${lineNumber.toString().padStart(5, ' ')}→ ${line}`;
      });

    const displayRange = result.readLines > 0
      ? `${result.startLine}-${result.endLine}`
      : `无（从第 ${result.startLine} 行开始无内容）`;
    const totalLinesLabel = result.totalLinesKnown
      ? `${result.totalLines}`
      : `至少 ${result.totalLines}（已停止继续统计，避免超大文件读取耗时）`;

    const notes: string[] = [];
    if (result.limitWasCapped) {
      notes.push(`请求的 limit=${result.requestedLimit} 已限制为 ${MAX_TEXT_READ_LIMIT} 行。`);
    }
    if (result.isDefaultLimit && result.nextOffset) {
      notes.push(`默认只显示 ${DEFAULT_TEXT_READ_LIMIT} 行，避免超大文件占满上下文。`);
    }
    if (result.reachedByteLimit) {
      notes.push(`输出达到 ${(MAX_TEXT_READ_BYTES / 1024).toFixed(0)} KB 上限，已停止追加内容。`);
    }
    if (result.nextOffset) {
      const nextLimit = result.isUnlimitedRequest
        ? DEFAULT_TEXT_READ_LIMIT
        : (result.limitWasCapped ? MAX_TEXT_READ_LIMIT : (result.requestedLimit || DEFAULT_TEXT_READ_LIMIT));
      notes.push(`继续读取请调用 read_file，参数 offset=${result.nextOffset}, limit=${nextLimit}。`);
    }

    return [
      `文件: ${filePath}`,
      `Path: ${displayPath}`,
      `总行数: ${totalLinesLabel}`,
      `显示: ${displayRange}`,
      '',
      formattedLines.join('\n'),
      notes.length > 0 ? ['', ...notes].join('\n') : '',
    ].filter(part => part !== '').join('\n');
  }

  private async readTextFile(
    absolutePath: string,
    filePath: string,
    visiblePath: string,
    options: TextReadOptions,
    context: ToolExecutionContext,
  ): Promise<string> {
    const normalizedOptions = this.normalizeTextReadOptions(options);
    const result = await this.collectTextLines(absolutePath, normalizedOptions, context);
    return this.formatTextReadResult(filePath, visiblePath, result);
  }

  private parsePdfPages(pages?: string): PdfPageSelection {
    const warnings: string[] = [];
    const raw = typeof pages === 'string' ? pages.trim() : '';

    if (!raw) {
      return {
        label: `前 ${DEFAULT_PDF_READ_PAGES} 页`,
        maxPageToRender: DEFAULT_PDF_READ_PAGES,
        warnings,
      };
    }

    const selected = new Set<number>();
    for (const part of raw.split(',').map(item => item.trim()).filter(Boolean)) {
      const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end <= 0 || end < start) {
          warnings.push(`已忽略无效页码范围: ${part}`);
          continue;
        }
        for (let page = start; page <= end; page += 1) selected.add(page);
        continue;
      }

      const page = Number(part);
      if (Number.isInteger(page) && page > 0) {
        selected.add(page);
      } else {
        warnings.push(`已忽略无效页码: ${part}`);
      }
    }

    if (selected.size === 0) {
      warnings.push(`pages="${raw}" 未匹配到有效页码，已改为默认读取前 ${DEFAULT_PDF_READ_PAGES} 页。`);
      return {
        label: `前 ${DEFAULT_PDF_READ_PAGES} 页`,
        maxPageToRender: DEFAULT_PDF_READ_PAGES,
        warnings,
      };
    }

    const sorted = Array.from(selected).sort((a, b) => a - b);
    const capped = sorted.slice(0, MAX_PDF_READ_PAGES);
    if (sorted.length > capped.length) {
      warnings.push(`请求页数 ${sorted.length} 页，已限制为前 ${MAX_PDF_READ_PAGES} 个页码。`);
    }

    return {
      label: capped.join(', '),
      maxPageToRender: Math.max(...capped),
      selectedPages: new Set(capped),
      warnings,
    };
  }

  private async extractPdfText(absolutePath: string, selection: PdfPageSelection): Promise<PdfParseResult> {
    const data = fs.readFileSync(absolutePath);
    const selectedPages = selection.selectedPages;
    const options: PdfParseOptions = {
      max: selection.maxPageToRender,
      pagerender: async (pageData: any) => {
        const pageNumber = typeof pageData?.pageIndex === 'number' ? pageData.pageIndex + 1 : undefined;
        if (selectedPages && pageNumber && !selectedPages.has(pageNumber)) return '';

        const textContent = await pageData.getTextContent({
          normalizeWhitespace: false,
          disableCombineTextItems: false,
        });

        let lastY: number | undefined;
        let text = '';
        for (const item of textContent.items || []) {
          const value = typeof item?.str === 'string' ? item.str : '';
          const y = Array.isArray(item?.transform) ? item.transform[5] : undefined;
          if (!value) continue;
          if (lastY === undefined || y === lastY) {
            text += value;
          } else {
            text += `\n${value}`;
          }
          lastY = y;
        }
        return text;
      },
    };

    return pdfParse(data, options);
  }

  private async readPDF(absolutePath: string, filePath: string, visiblePath: string, pages?: string): Promise<string> {
    const stats = fs.statSync(absolutePath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    const selection = this.parsePdfPages(pages);

    const lines = [
      `文件: ${filePath}`,
      `Path: ${visiblePath}`,
      '类型: PDF',
      `大小: ${sizeMB} MB`,
    ];

    if (stats.size > MAX_PDF_READ_BYTES) {
      lines.push(
        '',
        `PDF 文件超过 ${(MAX_PDF_READ_BYTES / 1024 / 1024).toFixed(0)} MB，read_file 不会自动解析，避免占满内存和上下文。`,
        '请先指定更小文件，或使用 shell 中的文档解析工具做分段提取。',
      );
      return lines.join('\n');
    }

    try {
      const parsed = await this.extractPdfText(absolutePath, selection);
      const rawText = String(parsed.text || '').trim();
      const text = this.trimToUtf8ByteLimit(rawText, MAX_PDF_OUTPUT_BYTES);
      const wasTruncated = Buffer.byteLength(rawText, 'utf-8') > Buffer.byteLength(text, 'utf-8');

      lines.push(
        `总页数: ${parsed.numpages ?? '未知'}`,
        `已解析页: ${selection.label}`,
      );

      if (selection.warnings.length > 0) {
        lines.push('', ...selection.warnings);
      }

      if (!rawText) {
        lines.push(
          '',
          '未提取到可用文本。这个 PDF 可能是扫描件/图片型 PDF、加密文档，或文本层为空。',
          '如果用户需要读内容，建议改用图片 OCR、截图读图，或 shell 中更专业的文档解析工具。',
        );
        return lines.join('\n');
      }

      lines.push('', '文本内容:', text);
      if (wasTruncated) {
        lines.push(
          '',
          `输出达到 ${(MAX_PDF_OUTPUT_BYTES / 1024).toFixed(0)} KB 上限，后续内容已省略。`,
          '如需继续读取，请用 pages 参数指定更小页码范围，例如 pages="11-20"。',
        );
      } else if (!pages && parsed.numpages && parsed.numpages > DEFAULT_PDF_READ_PAGES) {
        lines.push(
          '',
          `默认只解析前 ${DEFAULT_PDF_READ_PAGES} 页。`,
          `如需继续读取，请调用 read_file 并指定 pages="${DEFAULT_PDF_READ_PAGES + 1}-${Math.min(parsed.numpages, DEFAULT_PDF_READ_PAGES * 2)}"。`,
        );
      }

      return lines.join('\n');
    } catch (error: any) {
      const rawMessage = String(error?.message || error || 'unknown error').trim();
      const message = rawMessage.length > 500 ? `${rawMessage.slice(0, 500)}...` : rawMessage;
      lines.push(
        '',
        'PDF 解析失败，read_file 未能提取正文。',
        `原因: ${message}`,
        '可以尝试重新上传 PDF、改发截图，或使用 shell 中可用的文档解析库/系统工具处理。',
      );
      return lines.join('\n');
    }
  }

  private isImageExt(ext: string): boolean {
    return ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(ext);
  }

  private getLatestUserText(context: ToolExecutionContext): string {
    for (let i = context.conversationHistory.length - 1; i >= 0; i--) {
      const message = context.conversationHistory[i];
      if (!message || message.role !== 'user') continue;

      if (typeof message.content === 'string') {
        const text = message.content.trim();
        if (text) return text;
      }

      if (Array.isArray(message.content)) {
        const text = message.content
          .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
          .map((block: any) => block.text.trim())
          .filter(Boolean)
          .join('\n')
          .trim();
        if (text) return text;
      }
    }

    return '';
  }

  private getImageReadPrompt(context: ToolExecutionContext, prompt?: string): string {
    const explicit = typeof prompt === 'string' ? prompt.trim() : '';
    return explicit || this.getLatestUserText(context);
  }

  private formatImageMetadata(absolutePath: string, filePath: string, visiblePath: string): string {
    const stats = fs.statSync(absolutePath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    return [`文件: ${filePath}`, `Path: ${visiblePath}`, '类型: 图片文件', `大小: ${sizeKB} KB`].join('\n');
  }

  private formatReaderProxyFailure(proxyResult: ReaderProxyResult, visionCapable: boolean): string {
    const status = proxyResult.status;
    const attempts = proxyResult.attempts && proxyResult.attempts > 1
      ? `已自动重试 ${proxyResult.attempts} 次。`
      : '';
    const rawError = String(proxyResult.error || 'unknown error').trim();
    const shortError = rawError.length > 500 ? `${rawError.slice(0, 500)}...` : rawError;

    let title = '读图失败：读图服务暂时没有返回可用结果。';
    let action = '可以稍后重试，或先把图片里的关键文字/区域用文字补充一下。';

    if (/requires CATSCOMPANY_API_KEY|READER_PROXY_API_KEY|apiKey/i.test(rawError)) {
      title = '读图失败：读图服务配置缺失。';
      action = '请检查 CatsCo API Key / Reader Proxy API Key 是否已配置到 CatsCo 桌面端。';
    } else if (status === 400) {
      title = '读图失败：图片请求格式不被服务接受。';
      action = '请确认上传的是常见图片格式（png/jpg/jpeg/webp/gif/bmp），必要时重新截图后再发。';
    } else if (status === 401 || status === 403) {
      title = '读图失败：读图服务鉴权失败。';
      action = '请检查 CatsCo API Key 是否正确、是否仍然有效，以及当前机器人是否有权限调用读图服务。';
    } else if (status === 404) {
      title = '读图失败：读图服务地址不正确。';
      action = '请检查 Reader Proxy URL / CatsCo HTTP Base URL 是否指向正确服务。';
    } else if (status === 413) {
      title = '读图失败：图片太大，服务拒绝处理。';
      action = '请压缩图片、裁剪重点区域，或改发更小的截图。';
    } else if (status === 415) {
      title = '读图失败：图片格式暂不支持。';
      action = '请转成 png 或 jpg 后重试。';
    } else if (status === 429) {
      title = '读图失败：读图服务正在忙。';
      action = '当前同一客户端并发读图太多，请等上一张图片处理完后再试。';
    } else if (status === 502 || status === 503 || status === 504) {
      title = '读图失败：读图服务临时不可用。';
      action = '可能是服务重启、上游模型繁忙或网关超时，请稍后重试。';
    } else if (/timeout|ECONNRESET|ECONNABORTED|EAI_AGAIN|ENOTFOUND|network|socket/i.test(rawError)) {
      title = '读图失败：CatsCo 桌面端连接读图服务失败。';
      action = '请检查本机网络、代理、DNS，或 CatsCo 服务是否能访问。';
    }

    return [
      visionCapable
        ? '主模型图片块生成失败，CatsCo 桌面端已尝试改用读图服务。'
        : '当前主模型不能直接读取图片内容，CatsCo 桌面端已尝试调用读图服务。',
      title,
      action,
      attempts,
      `排查信息: ${status ? `HTTP ${status}; ` : ''}${shortError}`,
    ].filter(Boolean).join('\n');
  }

  private async readImage(
    absolutePath: string,
    filePath: string,
    visiblePath: string,
    context: ToolExecutionContext,
    prompt?: string,
  ): Promise<any> {
    const config = ConfigManager.getConfigReadonly();
    const imagePrompt = this.getImageReadPrompt(context, prompt);
    const visionCapable = isPrimaryModelVisionCapable(config);
    const modelName = config.model || 'unknown';

    if (visionCapable) {
      const imageBlock = await createImageBlock(absolutePath);
      const logFile = formatPathForLog(absolutePath || filePath);
      if (imageBlock) {
        Logger.info(`[CatsCo] vision_direct model=${modelName} tool=read_file file=${logFile} bytes_base64=${((imageBlock as any).source as any)?.data?.length || 0}`);
        return {
          _imageForNewMessage: true,
          imageBlock: { ...imageBlock, filePath },
          filePath,
        };
      }
      Logger.warning(`[CatsCo] vision_fallback_read_file model=${modelName} tool=read_file file=${logFile} reason=image_block_create_failed path=${logFile}`);
    } else {
      Logger.info(`[CatsCo] vision_fallback_read_file model=${modelName} tool=read_file file=${formatPathForLog(absolutePath || filePath)} reason=model_not_vision_capable`);
    }

    const proxyResult = await analyzeImageWithReaderProxy({
      filePath: absolutePath,
      prompt: imagePrompt,
      config,
    });

    if (proxyResult.ok && proxyResult.analysis) {
      return [
        this.formatImageMetadata(absolutePath, filePath, visiblePath),
        '',
        visionCapable
          ? '主模型图片块生成失败，已自动改用 Cats reader proxy 解析：'
          : '读图结果（由 Cats reader proxy 解析，已作为 read_file 结果返回给当前非多模态主模型）：',
        proxyResult.analysis,
      ].join('\n');
    }

    return [
      this.formatImageMetadata(absolutePath, filePath, visiblePath),
      '',
      this.formatReaderProxyFailure(proxyResult, visionCapable),
    ].join('\n');
  }

  private readNotebook(absolutePath: string, filePath: string, visiblePath: string): string {
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const notebook = JSON.parse(content);

    let result = `文件: ${filePath}\nPath: ${visiblePath}\nJupyter Notebook\n单元格数量: ${notebook.cells?.length || 0}\n\n`;

    if (notebook.cells && Array.isArray(notebook.cells)) {
      notebook.cells.forEach((cell: any, index: number) => {
        result += `\n=== Cell ${index + 1} (${cell.cell_type}) ===\n`;

        if (cell.source) {
          const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
          result += source + '\n';
        }

        if (cell.outputs && Array.isArray(cell.outputs) && cell.outputs.length > 0) {
          result += '\n--- Output ---\n';
          cell.outputs.forEach((output: any) => {
            if (output.text) {
              const text = Array.isArray(output.text) ? output.text.join('') : output.text;
              result += text + '\n';
            } else if (output.data && output.data['text/plain']) {
              const text = Array.isArray(output.data['text/plain'])
                ? output.data['text/plain'].join('')
                : output.data['text/plain'];
              result += text + '\n';
            }
          });
        }
      });
    }

    return result;
  }
}
