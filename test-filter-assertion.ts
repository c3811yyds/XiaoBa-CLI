/**
 * 测试：验证 filter + 类型断言是否会保留额外字段
 */

interface ImageBlockParam {
  type: 'image';
  source: any;
}

// 模拟带有 filePath 的 imageBlock
const blocks: any[] = [
  { type: 'text', text: '已读取图片' },
  { 
    type: 'image', 
    source: { type: 'base64', media_type: 'image/jpeg', data: 'xxx' },
    filePath: '/path/to/image.png'  // ← 额外字段
  }
];

// 模拟 anthropic-provider 的逻辑
const imageBlocks = blocks.filter((b: any) => b.type === 'image') as ImageBlockParam[];

console.log('=== Filter 后的 imageBlocks ===');
console.log(JSON.stringify(imageBlocks, null, 2));

console.log('\n=== 检查 ===');
console.log('imageBlocks[0] 有 filePath?', 'filePath' in imageBlocks[0]);
console.log('imageBlocks[0].filePath =', (imageBlocks[0] as any).filePath);

console.log('\n=== 结论 ===');
console.log('类型断言 (as ImageBlockParam[]) 不会移除运行时的额外字段！');
console.log('filePath 仍然存在于对象中，会被发送给 Anthropic API');
