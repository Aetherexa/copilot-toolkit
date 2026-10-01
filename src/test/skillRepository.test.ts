import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PromptDefinition } from '../domain/prompt';
import { PromptAssembler } from '../prompts/PromptAssembler';
import { SkillRepository } from '../skills/SkillRepository';

function createWorkspace(t: Parameters<typeof test>[1] extends (context: infer C) => unknown ? C : never): {
  root: string;
  skillsFolder: string;
  instructionsFile: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-toolkit-skills-'));
  const skillsFolder = path.join(root, '.copilot', 'skills');
  const instructionsFile = path.join(root, '.github', 'copilot-instructions.md');
  fs.mkdirSync(skillsFolder, { recursive: true });
  fs.mkdirSync(path.dirname(instructionsFile), { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, skillsFolder, instructionsFile };
}

function makePrompt(skillIds: string[] = []): PromptDefinition {
  return {
    id: 'prompt-1',
    name: 'API Review',
    category: 'Review',
    tags: ['api'],
    body: 'Review the API implementation.',
    skillIds,
    context: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

test('SkillRepository discovers non-empty Markdown skills with workspace-relative paths', t => {
  const workspace = createWorkspace(t);
  fs.writeFileSync(path.join(workspace.skillsFolder, 'security.md'), '# Security\nCheck authentication and input validation.\n');
  fs.writeFileSync(path.join(workspace.skillsFolder, 'performance.md'), '# Performance\nReview latency and allocations.\n');
  fs.writeFileSync(path.join(workspace.skillsFolder, 'empty.md'), '   ');
  fs.writeFileSync(path.join(workspace.skillsFolder, 'notes.txt'), 'not a skill');

  const repository = new SkillRepository(() => ({
    workspaceRoot: workspace.root,
    skillsFolder: workspace.skillsFolder,
    projectInstructionsFile: workspace.instructionsFile,
  }));

  const skills = repository.list();

  assert.deepEqual(skills.map(skill => skill.id), ['performance', 'security']);
  assert.equal(skills[0].name, 'Performance');
  assert.equal(skills[0].description, 'Review latency and allocations.');
  assert.equal(skills[0].sourcePath, '.copilot/skills/performance.md');
});

test('SkillRepository resolves only selected skill IDs', t => {
  const workspace = createWorkspace(t);
  fs.writeFileSync(path.join(workspace.skillsFolder, 'security.md'), '# Security\nSecurity rules.');
  fs.writeFileSync(path.join(workspace.skillsFolder, 'performance.md'), '# Performance\nPerformance rules.');

  const repository = new SkillRepository(() => ({
    workspaceRoot: workspace.root,
    skillsFolder: workspace.skillsFolder,
  }));

  const selected = repository.resolve(['SECURITY', 'missing']);

  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, 'security');
  assert.equal(selected[0].content, '# Security\nSecurity rules.');
});

test('SkillRepository loads project instructions when configured', t => {
  const workspace = createWorkspace(t);
  fs.writeFileSync(workspace.instructionsFile, '# Project Instructions\nFollow repository conventions.\n');

  const repository = new SkillRepository(() => ({
    workspaceRoot: workspace.root,
    projectInstructionsFile: workspace.instructionsFile,
  }));

  assert.deepEqual(repository.loadProjectInstructions(), {
    sourcePath: '.github/copilot-instructions.md',
    content: '# Project Instructions\nFollow repository conventions.',
  });
});

test('SkillRepository gracefully handles missing skill paths', () => {
  const repository = new SkillRepository(() => ({}));

  assert.deepEqual(repository.list(), []);
  assert.deepEqual(repository.resolve(['security']), []);
  assert.equal(repository.loadProjectInstructions(), undefined);
});

test('PromptAssembler places project instructions and selected skills before the task', t => {
  const workspace = createWorkspace(t);
  fs.writeFileSync(workspace.instructionsFile, 'Follow repository conventions.');
  fs.writeFileSync(path.join(workspace.skillsFolder, 'security.md'), 'Review authentication and authorization.');

  const repository = new SkillRepository(() => ({
    workspaceRoot: workspace.root,
    skillsFolder: workspace.skillsFolder,
    projectInstructionsFile: workspace.instructionsFile,
  }));
  const assembler = new PromptAssembler(repository);

  const output = assembler.assemble(makePrompt(['security']), []);

  assert.match(output, /# Project Instructions\n\nFollow repository conventions\./);
  assert.match(output, /# Skills\n\n## Security\n\nReview authentication and authorization\./);
  assert.match(output, /# Task\n\nReview the API implementation\./);
  assert.ok(output.indexOf('# Project Instructions') < output.indexOf('# Skills'));
  assert.ok(output.indexOf('# Skills') < output.indexOf('# Task'));
});
