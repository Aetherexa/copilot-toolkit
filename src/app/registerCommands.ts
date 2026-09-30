import * as vscode from 'vscode';
import { ServiceContainer } from './serviceContainer';
import { PromptStudioPanel } from '../studio/PromptStudioPanel';

export type ServiceContainerProvider = () => ServiceContainer;

export function registerStudioCommands(
  context: vscode.ExtensionContext,
  getServices: ServiceContainerProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-toolkit.openStudio', async () => {
      try {
        PromptStudioPanel.createOrReveal(getServices());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Copilot Toolkit: failed to initialize AI Workflow Studio.', error);
        await vscode.window.showErrorMessage(
          `Copilot Toolkit: AI Workflow Studio failed to initialize. ${message}`,
        );
      }
    }),
  );
}
