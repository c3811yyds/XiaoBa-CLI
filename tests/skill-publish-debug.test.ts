/**
 * Skill-Publish 调试测试
 * 逐步执行 skill-publish 的各个步骤，定位 502 错误来源
 */

const SKILL_NAME = process.argv[2] || 'sc-analysis';

// 模拟 skill-publish 的各个步骤
async function runStep(name, command) {
  console.log(`\n========== Step: ${name} ==========`);
  console.log(`Command: ${command}`);
  console.log(`Command length: ${command.length}`);
  
  try {
    const { execSync } = require('child_process');
    const output = execSync(command, { 
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024
    });
    console.log(`Result: SUCCESS`);
    console.log(output.substring(0, 500));
    return { success: true, output };
  } catch (error) {
    console.log(`Result: FAILED`);
    console.log(`Error code: ${error.status}`);
    console.log(`Error message: ${error.message}`);
    return { success: false, error };
  }
}

async function testSkillPublishFlow() {
  console.log('=== Skill-Publish 调试测试 ===');
  console.log(`Skill to publish: ${SKILL_NAME}`);
  
  // Step 1: 检查 skill 目录
  const skillPath = `skills/${SKILL_NAME}`;
  await runStep(
    '检查 skill 目录是否存在',
    `test -d ${skillPath} && echo "EXISTS" || echo "NOT FOUND"`
  );
  
  // Step 2: 检查 SKILL.md
  await runStep(
    '检查 SKILL.md',
    `test -f ${skillPath}/SKILL.md && echo "EXISTS" || echo "NOT FOUND"`
  );
  
  // Step 3: 获取 GitHub 用户名
  await runStep(
    '获取 GitHub 用户名',
    'git config user.name'
  );
  
  // Step 4: 检查 GITHUB_TOKEN
  await runStep(
    '检查 GITHUB_TOKEN 是否存在',
    'echo "Token length: $(echo $GITHUB_TOKEN | wc -c)"'
  );
  
  // Step 5: 检查 GitHub CLI
  await runStep(
    '检查 gh CLI',
    'which gh && gh --version || echo "gh not found"'
  );
  
  // Step 6: 检查 skill 目录内容
  await runStep(
    '列出 skill 目录内容',
    `ls -la ${skillPath}/`
  );
  
  // Step 7: 测试 GitHub API 访问
  await runStep(
    '测试 GitHub API - 获取用户信息',
    `curl -s -H "Authorization: token ${process.env.GITHUB_TOKEN || ''}" https://api.github.com/user | head -20`
  );
  
  // Step 8: 测试创建仓库
  console.log('\n========== Step: 测试创建仓库 (dry run) ==========');
  console.log('Skipping actual repo creation to avoid side effects');
  
  // Step 9: 检查网络连通性
  await runStep(
    '测试 GitHub 网络连通性',
    'curl -sI https://github.com | head -5'
  );
  
  console.log('\n=== 测试完成 ===');
}

testSkillPublishFlow().catch(console.error);
