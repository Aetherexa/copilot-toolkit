import * as fs from 'fs';
import * as path from 'path';
import { getConfigPath } from '../app/workspace';
import { ProjectInstructions, SkillContentProvider, SkillDefinition, SkillSummary } from '../domain/skill';

function humanizeSkillName(fileName: string): string {
  return fileName
    .replace(/\.md$/i, '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toSkillId(fileName: string): string {
  return path.basename(fileName, '.md').trim().toLowerCase();
}

function extractDescription(content: string): string | undefined {
  const line = content
    .split(/\r?\n/)
    .map(item => item.trim())
    .find(item => item.length > 0 && !item.startsWith('#'));

  if (!line) {
    return undefined;
  }

  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

export class SkillRepository implements SkillContentProvider {
  list(): SkillSummary[] {
    return this.loadSkills().map(({ content: _content, ...summary }) => summary);
  }

  resolve(skillIds: string[]): SkillDefinition[] {
    const selectedIds = new Set(skillIds.map(id => id.trim().toLowerCase()).filter(Boolean));
    if (selectedIds.size === 0) {
      return [];
    }

    return this.loadSkills().filter(skill => selectedIds.has(skill.id));
  }

  loadProjectInstructions(): ProjectInstructions | undefined {
    const instructionFile = getConfigPath('skillFile');
    if (!instructionFile || !fs.existsSync(instructionFile)) {
      return undefined;
    }

    try {
      const content = fs.readFileSync(instructionFile, 'utf8').trim();
      if (!content) {
        return undefined;
      }

      return {
        sourcePath: this.relativeWorkspacePath(instructionFile) ?? instructionFile,
        content,
      };
    } catch {
      return undefined;
    }
  }

  private loadSkills(): SkillDefinition[] {
    const skillsFolder = getConfigPath('skillsFolder');
    if (!skillsFolder || !fs.existsSync(skillsFolder)) {
      return [];
    }

    try {
      return fs.readdirSync(skillsFolder, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(entry => {
          const filePath = path.join(skillsFolder, entry.name);
          try {
            const content = fs.readFileSync(filePath, 'utf8').trim();
            if (!content) {
              return undefined;
            }

            return {
              id: toSkillId(entry.name),
              name: humanizeSkillName(entry.name),
              description: extractDescription(content),
              sourcePath: this.relativeWorkspacePath(filePath) ?? entry.name,
              content,
            };
          } catch {
            return undefined;
          }
        })
        .filter((skill): skill is SkillDefinition => Boolean(skill));
    } catch {
      return [];
    }
  }

  private relativeWorkspacePath(filePath: string): string | undefined {
    const skillsFolder = getConfigPath('skillsFolder');
    const instructionFile = getConfigPath('skillFile');
    const basePath = skillsFolder ? path.dirname(path.dirname(skillsFolder)) : instructionFile ? path.dirname(path.dirname(instructionFile)) : undefined;
    if (!basePath) {
      return undefined;
    }

    const relative = path.relative(basePath, filePath);
    return relative && !relative.startsWith('..') ? relative.split(path.sep).join('/') : undefined;
  }
}
