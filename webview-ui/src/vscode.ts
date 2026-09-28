import { StudioExtensionMessage, StudioWebviewMessage } from './types';

declare const acquireVsCodeApi: undefined | (() => {
  postMessage(message: StudioWebviewMessage): void;
  setState(state: unknown): void;
  getState<T>(): T | undefined;
});

const api = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;

export function postMessage(message: StudioWebviewMessage): void {
  api?.postMessage(message);
}

export function setPersistedState<T>(state: T): void {
  api?.setState(state);
}

export function getPersistedState<T>(): T | undefined {
  return api?.getState<T>();
}

export function onMessage(handler: (message: StudioExtensionMessage) => void): () => void {
  const listener = (event: MessageEvent<StudioExtensionMessage>) => handler(event.data);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}