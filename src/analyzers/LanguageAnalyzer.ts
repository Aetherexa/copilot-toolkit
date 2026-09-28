import { WorkspaceFileInfo } from '../services/WorkspaceIndexService';
import { GraphFileAnalysis } from '../domain/graph';

export interface LanguageAnalyzer {
  supports(languageId: string, file: WorkspaceFileInfo): boolean;
  analyze(file: WorkspaceFileInfo, content: string): Promise<GraphFileAnalysis>;
}