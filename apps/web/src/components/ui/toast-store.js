import { create } from 'zustand';

/**
 * @typedef {'success' | 'info' | 'error'} ToastTone
 *
 * @typedef {object} ToastInput
 * @property {string} title Déjà traduit.
 * @property {string} [description]
 * @property {ToastTone} [tone]
 *
 * @typedef {ToastInput & { id: number }} ToastItem
 */

/**
 * File des notifications : un état client, donc dans Zustand. Séparée de leur affichage
 * (Toast.jsx, primitive Radix) : ce module est minuscule et peut être dans le bundle initial,
 * l'affichage n'est chargé qu'à la première notification (`active`).
 *
 * @type {import('zustand').UseBoundStore<import('zustand').StoreApi<{
 *   toasts: ToastItem[],
 *   active: boolean,
 *   push: (toast: ToastInput) => number,
 *   dismiss: (id: number) => void,
 * }>>}
 */
export const useToastStore = create((set) => {
  let nextId = 1;
  return {
    toasts: [],
    active: false,
    push: (toast) => {
      const id = nextId++;
      set((state) => ({ active: true, toasts: [...state.toasts, { ...toast, id }] }));
      return id;
    },
    dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  };
});

/**
 * Affiche une notification, depuis n'importe quel code (un composant, une mutation...).
 *
 * @param {ToastInput} toast
 * @returns {number} Son identifiant.
 */
export function toast(toast) {
  return useToastStore.getState().push(toast);
}
