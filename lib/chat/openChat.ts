/** LayoutContent opens the existing chat panel when it hears this. */
export const OPEN_CHAT_EVENT = 'snapie:open-chat';

export function requestOpenChat() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT));
}
