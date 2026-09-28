import * as path from 'path';
import { GitService } from '../services/GitService';
import { GraphQueryService } from '../services/GraphQueryService';
import { WorkspaceFileInfo, WorkspaceIndexService } from '../services/WorkspaceIndexService';

export interface RankedFile {
  file: WorkspaceFileInfo;
  score: number;
  reason: string;
}

function sharedTokenCount(left: string[], right: string[]): number {
  const rightSet = new Set(right);
  return left.filter(token => rightSet.has(token)).length;
}

export class RelatedFilesEngine {
  constructor(
    private readonly workspaceIndex: WorkspaceIndexService,
    private readonly gitService: GitService,
    private readonly graphQuery: GraphQueryService,
  ) {}

  async rankRelatedFiles(targetPath: string, maxFiles: number): Promise<RankedFile[]> {
    const target = await this.workspaceIndex.getFileInfo(targetPath);
    if (!target) {
      return [];
    }

    const files = await this.workspaceIndex.getWorkspaceFiles();
    const targetImports = new Set(await this.workspaceIndex.resolveRelativeImports(target.absolutePath));
    const targetTokens = this.workspaceIndex.getNameTokens(target);
    const openFiles = new Set((await this.workspaceIndex.getOpenEditorFiles()).map(file => file.absolutePath));
    const dependencyIds = new Set(this.graphQuery.getDependencies(target.relativePath, 2));
    const reverseDependencyIds = new Set(this.graphQuery.getReverseDependencies(target.relativePath, 2));
    const referenceIds = new Set(this.graphQuery.getReferences(target.relativePath, 2));

    const ranked: RankedFile[] = [];
    for (const file of files) {
      if (file.absolutePath === target.absolutePath || file.isTest) {
        continue;
      }

      let score = 0;
      const reasons: string[] = [];

      if (targetImports.has(file.absolutePath)) {
        score += 50;
        reasons.push('Imported by active file');
      }

      if (dependencyIds.has(`file:${file.relativePath}`)) {
        score += 40;
        reasons.push('Direct dependency in code graph');
      }

      if (reverseDependencyIds.has(`file:${file.relativePath}`)) {
        score += 30;
        reasons.push('Reverse dependency in code graph');
      }

      if (referenceIds.has(`file:${file.relativePath}`)) {
        score += 18;
        reasons.push('Referenced in graph');
      }

      const reverseImports = new Set(await this.workspaceIndex.resolveRelativeImports(file.absolutePath));
      if (reverseImports.has(target.absolutePath)) {
        score += 35;
        reasons.push('References active file');
      }

      if (file.directory === target.directory) {
        score += 20;
        reasons.push('Same folder');
      } else {
        const targetSegments = target.directory.split('/').filter(Boolean);
        const fileSegments = file.directory.split('/').filter(Boolean);
        const sharedSegments = targetSegments.filter((segment, index) => fileSegments[index] === segment).length;
        if (sharedSegments > 0) {
          score += Math.min(12, sharedSegments * 4);
          reasons.push('Same feature path');
        }
      }

      const sharedTokens = sharedTokenCount(targetTokens, this.workspaceIndex.getNameTokens(file));
      if (sharedTokens > 0) {
        score += sharedTokens * 8;
        reasons.push('Filename similarity');
      }

      if (openFiles.has(file.absolutePath)) {
        score += 10;
        reasons.push('Currently open');
      }

      if (await this.gitService.wasFileRecentlyChanged(file.absolutePath)) {
        score += 10;
        reasons.push('Recently changed in Git');
      }

      if (file.isProjectMetadata) {
        score += 4;
        reasons.push('Project metadata');
      }

      if (score > 0) {
        ranked.push({
          file,
          score,
          reason: reasons.join(', '),
        });
      }
    }

    return ranked
      .sort((left, right) => right.score - left.score || left.file.relativePath.localeCompare(right.file.relativePath))
      .slice(0, maxFiles);
  }

  async rankRelatedTests(targetPath: string, maxFiles: number): Promise<RankedFile[]> {
    const target = await this.workspaceIndex.getFileInfo(targetPath);
    if (!target) {
      return [];
    }

    const targetTokens = this.workspaceIndex.getNameTokens(target);
    const files = await this.workspaceIndex.getWorkspaceFiles();
    return files
      .filter(file => file.isTest)
      .map(file => {
        let score = 0;
        const reasons: string[] = [];

        if (file.directory.startsWith(target.directory)) {
          score += 25;
          reasons.push('Nearby test folder');
        }

        if (this.graphQuery.getDependencies(target.relativePath, 2).includes(`file:${file.relativePath}`)) {
          score += 10;
          reasons.push('Dependency-adjacent test');
        }

        const sharedTokens = sharedTokenCount(targetTokens, this.workspaceIndex.getNameTokens(file));
        if (sharedTokens > 0) {
          score += sharedTokens * 15;
          reasons.push('Test name matches feature');
        }

        if (file.relativePath.toLowerCase().includes(target.baseName.toLowerCase())) {
          score += 20;
          reasons.push('Direct filename match');
        }

        return { file, score, reason: reasons.join(', ') || 'Detected by test naming pattern' };
      })
      .filter(result => result.score > 0)
      .sort((left, right) => right.score - left.score || left.file.relativePath.localeCompare(right.file.relativePath))
      .slice(0, maxFiles);
  }
}