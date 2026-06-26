"use client";

import * as React from "react";
import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 4000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type State = { toasts: ToasterToast[] };

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

function dispatch(toasts: ToasterToast[]) {
  memoryState = { toasts };
  listeners.forEach((l) => l(memoryState));
}

function toast(props: Omit<ToasterToast, "id">) {
  const id = genId();
  const newToast = { ...props, id, open: true };
  dispatch([...memoryState.toasts, newToast].slice(-TOAST_LIMIT));
  setTimeout(() => {
    dispatch(memoryState.toasts.map((t) => (t.id === id ? { ...t, open: false } : t)));
    setTimeout(() => dispatch(memoryState.toasts.filter((t) => t.id !== id)), 300);
  }, TOAST_REMOVE_DELAY);
  return id;
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);
  React.useEffect(() => {
    listeners.push(setState);
    return () => { const idx = listeners.indexOf(setState); if (idx > -1) listeners.splice(idx, 1); };
  }, []);
  return { ...state, toast };
}

export { useToast, toast };
