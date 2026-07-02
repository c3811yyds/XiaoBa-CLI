/**
 * read-tool 测试：验证 ToolExecutionResult 结构
 */
import { describe, test, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { DEFAULT_PDF_READ_PAGES, DEFAULT_TEXT_READ_LIMIT, ReadTool } from '../src/tools/read-tool';
import { ToolExecutionContext } from '../src/types/tool';

describe('ReadTool - ToolExecutionResult', () => {
  let tool: ReadTool;
  let testRoot: string;
  let context: ToolExecutionContext;

  beforeEach(() => {
    tool = new ReadTool();
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'read-tool-test-'));
    context = { workingDirectory: testRoot, conversationHistory: [] };
  });

  test('成功读取文本文件返回 ok=true', async () => {
    const filePath = path.join(testRoot, 'sample.txt');
    fs.writeFileSync(filePath, 'line1\nline2\nline3');
    const result = await tool.execute({ file_path: filePath }, context);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(typeof result.content, 'string');
    const content = result.content as string;
    assert.ok(content.includes('sample.txt'));
    assert.ok(content.includes('line1'));
  });

  test('默认只读取文本文件开头窗口', async () => {
    const filePath = path.join(testRoot, 'large.txt');
    const lines = Array.from({ length: DEFAULT_TEXT_READ_LIMIT + 5 }, (_, index) => `line${index + 1}`);
    fs.writeFileSync(filePath, lines.join('\n'));

    const result = await tool.execute({ file_path: filePath }, context);

    assert.strictEqual(result.ok, true);
    const content = result.content as string;
    assert.ok(content.includes(`显示: 1-${DEFAULT_TEXT_READ_LIMIT}`));
    assert.ok(content.includes(`默认只显示 ${DEFAULT_TEXT_READ_LIMIT} 行`));
    assert.ok(content.includes(`offset=${DEFAULT_TEXT_READ_LIMIT + 1}`));
    assert.ok(content.includes(`总行数: 至少 ${DEFAULT_TEXT_READ_LIMIT + 1}`));
    assert.ok(content.includes('line200'));
    assert.ok(!content.includes('line201'));
  });

  test('达到默认窗口后不继续扫描完整文件统计总行数', async () => {
    const filePath = path.join(testRoot, 'huge.txt');
    const lines = Array.from({ length: DEFAULT_TEXT_READ_LIMIT + 5000 }, (_, index) => `line${index + 1}`);
    fs.writeFileSync(filePath, lines.join('\n'));

    const result = await tool.execute({ file_path: filePath }, context);

    assert.strictEqual(result.ok, true);
    const content = result.content as string;
    assert.ok(content.includes(`总行数: 至少 ${DEFAULT_TEXT_READ_LIMIT + 1}`));
    assert.ok(content.includes('已停止继续统计'));
    assert.ok(!content.includes(`总行数: ${DEFAULT_TEXT_READ_LIMIT + 5000}`));
    assert.ok(!content.includes('line201'));
  });

  test('使用 1-based offset 和 limit 返回 ok=true', async () => {
    const filePath = path.join(testRoot, 'long.txt');
    fs.writeFileSync(filePath, 'line1\nline2\nline3\nline4\nline5');
    const result = await tool.execute({ file_path: filePath, offset: 2, limit: 2 }, context);
    assert.strictEqual(result.ok, true);
    const content = result.content as string;
    assert.ok(content.includes('显示: 2-3'));
    assert.ok(content.includes('    2→ line2'));
    assert.ok(!content.includes('    1→ line1'));
  });

  test('显式小 limit 达到窗口后停止扫描并提示至少行数', async () => {
    const filePath = path.join(testRoot, 'small-window.txt');
    fs.writeFileSync(filePath, [
      'before-window',
      'window-first',
      'window-second',
      'after-window',
      'never-scanned-exact-total',
    ].join('\n'));

    const result = await tool.execute({ file_path: filePath, offset: 2, limit: 2 }, context);

    assert.strictEqual(result.ok, true);
    const content = result.content as string;
    assert.ok(content.includes('显示: 2-3'));
    assert.ok(content.includes('    2→ window-first'));
    assert.ok(content.includes('    3→ window-second'));
    assert.ok(content.includes('总行数: 至少 4'));
    assert.ok(content.includes('offset=4, limit=2'));
    assert.ok(content.includes('已停止继续统计'));
    assert.ok(!content.includes('before-window'));
    assert.ok(!content.includes('after-window'));
    assert.ok(!content.includes('never-scanned-exact-total'));
    assert.ok(!content.includes('总行数: 5'));
  });

  test('limit=0 对小文本文件读取全文', async () => {
    const filePath = path.join(testRoot, 'full.txt');
    fs.writeFileSync(filePath, 'line1\nline2\nline3');
    const result = await tool.execute({ file_path: filePath, limit: 0 }, context);
    assert.strictEqual(result.ok, true);
    const content = result.content as string;
    assert.ok(content.includes('显示: 1-3'));
    assert.ok(content.includes('line3'));
    assert.ok(!content.includes('默认只显示'));
  });

  test('文件不存在返回 ok=false + FILE_NOT_FOUND', async () => {
    const result = await tool.execute({ file_path: '/nope/not/exist.txt' }, context);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errorCode, 'FILE_NOT_FOUND');
    assert.ok(result.message.includes('文件不存在'));
  });

  test('PDF 文件会提取正文文本', async () => {
    const fixturePath = path.join(
      path.dirname(require.resolve('pdf-parse')),
      'test',
      'data',
      '01-valid.pdf',
    );
    const filePath = path.join(testRoot, 'fixture.pdf');
    fs.copyFileSync(fixturePath, filePath);

    const result = await tool.execute({ file_path: filePath, pages: '1' }, context);

    assert.strictEqual(result.ok, true);
    const content = result.content as string;
    assert.ok(content.includes('类型: PDF'));
    assert.ok(content.includes('总页数:'));
    assert.ok(content.includes('已解析页: 1'));
    assert.ok(content.includes('文本内容:'));
    assert.ok(content.includes('Trace-based'));
    assert.ok(!content.includes('不再做 PDF 全文解析'));
  });

  test('PDF 默认只读取前若干页并提示继续读取', async () => {
    const fixturePath = path.join(
      path.dirname(require.resolve('pdf-parse')),
      'test',
      'data',
      '01-valid.pdf',
    );
    const filePath = path.join(testRoot, 'fixture-default.pdf');
    fs.copyFileSync(fixturePath, filePath);

    const result = await tool.execute({ file_path: filePath }, context);

    assert.strictEqual(result.ok, true);
    const content = result.content as string;
    assert.ok(content.includes(`已解析页: 前 ${DEFAULT_PDF_READ_PAGES} 页`));
    assert.ok(content.includes(`默认只解析前 ${DEFAULT_PDF_READ_PAGES} 页`));
    assert.ok(content.includes('pages="11-14"'));
  });

  test('PDF pages 参数只返回指定页内容', async () => {
    const fixturePath = path.join(
      path.dirname(require.resolve('pdf-parse')),
      'test',
      'data',
      '01-valid.pdf',
    );
    const filePath = path.join(testRoot, 'fixture-page-filter.pdf');
    fs.copyFileSync(fixturePath, filePath);

    const result = await tool.execute({ file_path: filePath, pages: '2' }, context);

    assert.strictEqual(result.ok, true);
    const content = result.content as string;
    assert.ok(content.includes('已解析页: 2'));
    assert.ok(content.includes('Every compiled trace'));
    assert.ok(!content.includes('Trace-based Just-in-Time Type Specialization'));
  });

  test('损坏 PDF 返回解析失败提示', async () => {
    const filePath = path.join(testRoot, 'dummy.pdf');
    fs.writeFileSync(filePath, '%PDF-1.4 fake content');
    const result = await tool.execute({ file_path: filePath }, context);
    assert.strictEqual(result.ok, true);
    const content = result.content as string;
    assert.ok(content.includes('PDF'));
    assert.ok(content.includes('PDF 解析失败'));
    assert.ok(content.includes('未能提取正文'));
    assert.ok(!content.includes('paper-analysis'));
  });
});
