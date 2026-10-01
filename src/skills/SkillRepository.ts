import * as fs from 'fs';
import * as path from 'path';
import { getConfigPath, getWorkspaceRoot } from '../app/workspace';
import {
  ProjectInstructions,
  SkillContentProvider,
  SkillDefinition,
  SkillSummary,
} from '../domain/skill';

export interface SkillRepositoryPaths {
  workspaceRoot?: string;
  skillsFolder?: string;
  projectInstructionsFile?: string;
}

function defaultPaths(): SkillRepositoryPaths {
  return {
    workspaceRoot: getWorkspaceRoot(),
    skillsFolder: getConfigPath('skillsFolder'),
    projectInstructionsFile: getConfigPath('skillFile'),
  };
}

function toSkillId(fileName: string): string {
  return path.basename(fileName, path.extname(fileName)).trim().toLowerCase();
}

function toSkillName(fileName: string): string {
  return path.basename(fileName, path.extname(fileName))
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function descriptionFrom(content: string): string | undefined {
  const firstContentLine = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.length > 0 && !line.startsWith('#'));

  if (!firstContentLine) {
    return undefined;
  }

  return firstContentLine.length > 140
    ? `${firstContentLine.slice(0, 137)}...`
    : firstContentLine;
}

export class SkillRepository implements SkillContentProvider {
  constructor(private readonly resolvePaths: () => SkillRepositoryPaths = defaultPaths) {}

  list(): SkillSummary[] {
    return this.loadSkills().map(({ content: _content, ...skill }) => skill);
  }

  resolve(skillIds: string[]): SkillDefinition[] {
    const ids = new Set(skillIds.map(id => id.trim().toLowerCase()).filter(Boolean));
    if (ids.size === 0) {
      return [];
    }

    return this.loadSkills().filter(skill => ids.has(skill.id));
  }

  loadProjectInstructions(): ProjectInstructions | undefined {
    const paths = this.resolvePaths();
    const filePath = paths.projectInstructionsFile;
    if (!filePath || !fs.existsSync(filePath)) {
      return undefined;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8').trim();
      if (!content) {
        return undefined;
      }

      return {
        sourcePath: this.displayPath(filePath, paths.workspaceRoot),
        content,
      };
    } catch {
      return undefined;
    }
  }

  private loadSkills(): SkillDefinition[] {
    const paths = this.resolvePaths();
    const folder = paths.skillsFolder;
    if (!folder || !fs.existsSync(folder)) {
      return [];
    }

    try {
      return fs.readdirSync(folder, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
        .sort((left, right) => left.name.localeCompare(right.name))
        .flatMap((entry): SkillDefinition[] => {
          const filePath = path.join(folder, entry.name);

          try {
            const content = fs.readFileSync(filePath, 'utf8').trim();
            if (!content) {
              return [];
            }

            const description = descriptionFrom(content);
            return [{
              id: toSkillId(entry.name),
              name: toSkillName(entry.name),
              ...(description ? { description } : {}),
              sourcePath: this.displayPath(filePath, paths.workspaceRoot),
              content,
            }];
          } catch {
            return [];
          }
        });
    } catch {
      return [];
    }
  }

  private displayPath(filePath: string, workspaceRoot?: string): string {
    if (!workspaceRoot) {
      return filePath;
    }

    const relative = path.relative(workspaceRoot, filePath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      return filePath;
    }

    return relative.split(path.sep).join('/');
  }
}
