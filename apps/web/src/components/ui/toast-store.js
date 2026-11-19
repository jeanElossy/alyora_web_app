import { create } from 'zustand';

/**
 * @typedef {'success' | 'info' | 'error'} ToastTone
 *
 * Une notification survit au rendu qui l'a créée : ses textes sont donc des clés de traduction,
 * traduites à l'affichage, pour suivre un changement de langue. C'est la seule exception à la
 * règle du design system (« les textes arrivent traduits »).
 *
 * @typedef {object} ToastInput
 * @property {string} ns Espace de noms i18next des clés.
 * @property {string} title Clé de traduction du titre.
 * @property {string} [description] Clé de traduction de la description.
 * @property {Record<string, unknown>} [values] Valeurs d'interpolation, communes aux deux textes.
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
