import * as path from 'path';
import * as vscode from 'vscode';
import { Workflow, WorkflowExportPayload, WorkflowRepositorySnapshot, WorkflowStep } from '../domain/workflow';
import { getBuiltInWorkflows } from './BuiltInWorkflows';

const WORKFLOWS_KEY = 'copilotToolkit.workflows';

function timestamp(): number {
  return Date.now();
}

function createId(prefix: string): string {
  return `${prefix}-${timestamp()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStep(step: WorkflowStep): WorkflowStep {
  return {
    ...step,
    id: step.id || createId('workflow-step'),
    name: step.name || 'Workflow Step',
    enabled: step.enabled !== false,
    continueOnFailure: Boolean(step.continueOnFailure),
    inputFromPreviousStep: Boolean(step.inputFromPreviousStep),
    contextBindings: step.contextBindings?.map(binding => ({
      ...binding,
      options: binding.options ? { ...binding.options } : undefined,
    })) ?? [],
  };
}

function normalizeWorkflow(workflow: Workflow): Workflow {
  const now = timestamp();
  return {
    ...workflow,
    id: workflow.id || createId('workflow'),
    name: workflow.name || 'Untitled Workflow',
    description: workflow.description ?? '',
    source: workflow.source ?? 'workspace',
    steps: (workflow.steps ?? []).map(normalizeStep),
    createdAt: workflow.createdAt || now,
    updatedAt: now,
  };
}


function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*]+/g, '-').trim() || 'copilot-toolkit-workflow';
}

function validateWorkflow(payload: unknown): payload is Workflow {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const candidate = payload as Partial<Workflow>;
  return typeof candidate.name === 'string' && Array.isArray(candidate.steps);
}

export class WorkflowRepository {
  constructor(private readonly state: vscode.Memento) {}

  async loadSnapshot(): Promise<WorkflowRepositorySnapshot> {
    const stored = this.state.get<Workflow[]>(WORKFLOWS_KEY, []).map(normalizeWorkflow);
    const merged = new Map<string, Workflow>();

    for (const workflow of getBuiltInWorkflows()) {
      merged.set(workflow.id, workflow);
    }
    for (const workflow of stored) {
      merged.set(workflow.id, workflow);
    }

    return { workflows: [...merged.values()] };
  }

  async createWorkflow(name = 'Untitled Workflow'): Promise<{ snapshot: WorkflowRepositorySnapshot; workflow: Workflow }> {
    const workflow = normalizeWorkflow({
      id: createId('workflow'),
      name,
      description: '',
      source: 'workspace',
      steps: [{ id: createId('workflow-step'), name: 'Step 1', enabled: true }],
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });
    const snapshot = await this.loadSnapshot();
    snapshot.workflows.unshift(workflow);
    await this.saveSnapshot(snapshot);
    return { snapshot, workflow };
  }

  async saveWorkflow(workflow: Workflow): Promise<{ snapshot: WorkflowRepositorySnapshot; workflow: Workflow }> {
    const snapshot = await this.loadSnapshot();
    const normalized = normalizeWorkflow(workflow);
    const index = snapshot.workflows.findIndex(item => item.id === normalized.id);
    if (index >= 0) {
      snapshot.workflows[index] = normalized;
    } else {
      snapshot.workflows.unshift(normalized);
    }
    await this.saveSnapshot(snapshot);
    return { snapshot, workflow: normalized };
  }

  async deleteWorkflow(workflowId: string): Promise<WorkflowRepositorySnapshot> {
    const snapshot = await this.loadSnapshot();
    snapshot.workflows = snapshot.workflows.filter(workflow => workflow.id !== workflowId);
    await this.saveSnapshot(snapshot);
    return snapshot;
  }

  async duplicateWorkflow(workflowId: string): Promise<{ snapshot: WorkflowRepositorySnapshot; workflow: Workflow }> {
    const snapshot = await this.loadSnapshot();
    const source = snapshot.workflows.find(workflow => workflow.id === workflowId);
    if (!source) {
      throw new Error('Workflow not found.');
    }
    const duplicate = normalizeWorkflow({
      ...source,
      id: createId('workflow'),
      name: `${source.name} Copy`,
      source: 'workspace',
      steps: source.steps.map(step => ({ ...step, id: createId('workflow-step') })),
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });
    snapshot.workflows.unshift(duplicate);
    await this.saveSnapshot(snapshot);
    return { snapshot, workflow: duplicate };
  }

  async importFromJson(): Promise<{ snapshot: WorkflowRepositorySnapshot; workflow: Workflow }> {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { JSON: ['json'] },
      openLabel: 'Import Copilot Toolkit Workflow JSON',
    });
    if (!picked || picked.length === 0) {
      throw new Error('Import cancelled.');
    }

    const raw = await vscode.workspace.fs.readFile(picked[0]);
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(raw).toString('utf8')) as unknown;
    } catch {
      throw new Error('Selected file is not valid JSON.');
    }

    const payload = parsed as Partial<WorkflowExportPayload>;
    if (payload.schemaVersion !== 1 || payload.kind !== 'workflow' || !validateWorkflow(payload.workflow)) {
      throw new Error('Workflow export is malformed.');
    }

    const imported = normalizeWorkflow({
      ...payload.workflow,
      id: createId('workflow'),
      name: payload.workflow.name,
      source: 'workspace',
      steps: payload.workflow.steps.map(step => ({ ...step, id: createId('workflow-step') })),
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });
    const snapshot = await this.loadSnapshot();
    if (snapshot.workflows.some(workflow => workflow.name === imported.name)) {
      imported.name = `${imported.name} Imported`;
    }
    snapshot.workflows.unshift(imported);
    await this.saveSnapshot(snapshot);
    return { snapshot, workflow: imported };
  }

  async exportWorkflow(workflowId: string): Promise<string> {
    const snapshot = await this.loadSnapshot();
    const workflow = snapshot.workflows.find(item => item.id === workflowId);
    if (!workflow) {
      throw new Error('Workflow not found.');
    }

    const target = await vscode.window.showSaveDialog({
      saveLabel: 'Export Copilot Toolkit Workflow JSON',
      defaultUri: vscode.Uri.file(path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(), `${sanitizeFileName(workflow.name)}.json`)),
      filters: { JSON: ['json'] },
    });
    if (!target) {
      throw new Error('Export cancelled.');
    }

    const payload: WorkflowExportPayload = {
      schemaVersion: 1,
      kind: 'workflow',
      workflow,
    };
    await vscode.workspace.fs.writeFile(target, Buffer.from(JSON.stringify(payload, null, 2), 'utf8'));
    return target.fsPath;
  }

  private async saveSnapshot(snapshot: WorkflowRepositorySnapshot): Promise<void> {
    await this.state.update(WORKFLOWS_KEY, snapshot.workflows);
  }
}