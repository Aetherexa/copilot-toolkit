import * as vscode from 'vscode';
import { ServiceContainer } from './serviceContainer';
import { PromptStudioPanel } from '../studio/PromptStudioPanel';

export function registerStudioCommands(context: vscode.ExtensionContext, services: ServiceContainer): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-toolkit.openStudio', () => {
      PromptStudioPanel.createOrReveal(services);
    }),
  );
}