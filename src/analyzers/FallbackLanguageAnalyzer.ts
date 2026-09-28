import { GraphFileAnalysis } from '../domain/graph';
import { WorkspaceFileInfo } from '../services/WorkspaceIndexService';
import { LanguageAnalyzer } from './LanguageAnalyzer';

export class FallbackLanguageAnalyzer implements LanguageAnalyzer {
  supports(): boolean {
    return true;
  }

  async analyze(file: WorkspaceFileInfo): Promise<GraphFileAnalysis> {
    const entityId = `file:${file.relativePath}`;
    return {
      entities: [
        {
          id: entityId,
          type: 'file',
          name: file.name,
          file: file.relativePath,
          language: file.extension.replace('.', '') || 'unknown',
          metadata: {
            directory: file.directory,
          },
        },
      ],
      relations: [],
    };
  }
}