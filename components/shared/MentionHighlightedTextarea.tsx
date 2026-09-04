'use client';
import {
  Box,
  Text,
  Textarea,
  type BoxProps,
  type TextareaProps,
} from '@chakra-ui/react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type UIEvent as ReactUIEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { MENTION_REGEX, normalizeMentionToken } from '@/lib/chat/mentions';
import { useMentionAutocomplete } from '@/hooks/useMentionAutocomplete';
import { useMentionValidation } from '@/hooks/useMentionValidation';

export interface MentionHighlightedTextareaProps extends Omit<TextareaProps, 'onChange'> {
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
  /** Layout for the outer wrapper — margin, width, flex, overall footprint
   *  among siblings. Kept separate from the props spread onto the two inner
   *  layers (which must match each other exactly, or the invisible textarea
   *  and its colored backdrop drift apart): a stray `mb` landing on both
   *  absolutely-positioned inner layers would inset their content by that
   *  same margin, silently shrinking the visible/typeable area. */
  wrapperProps?: BoxProps;
}

/** Text-rendering props only — everything that affects glyph position or the
 *  border-box math around them, and therefore must be identical between the
 *  backdrop and the real textarea. Layout props (margin, width, flex sizing)
 *  are deliberately excluded; see `wrapperProps` above. `border`/`borderWidth`
 *  are included for their effect on box sizing, not appearance — the
 *  backdrop's border color is always forced transparent separately, since it
 *  must never draw a second, visible border on top of the real one. */
const PADDING_KEYS = [
  'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr',
  'padding', 'paddingX', 'paddingY', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
] as const;

const TEXT_STYLE_KEYS = [
  'fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing',
  ...PADDING_KEYS,
  'textAlign', 'border', 'borderWidth', 'borderStyle',
] as const;

/**
 *  Chakra's Textarea theme defaults (size="md", the default) — a caller that
 *  never overrides these (the snap composer doesn't) still renders with
 *  them, so the backdrop needs the same fallback or it silently renders at
 *  Box's zero-padding default instead and drifts out of alignment.
 *
 *  Padding specifically is applied only when the caller specified NONE of the
 *  padding-family props at all — mixing an explicit `p` with a leftover
 *  default `px`/`py` would fight over the same physical edges (e.g. the blog
 *  composer's `p={4}` should mean 4 on every side, not 4 horizontal fighting
 *  a defaulted 2 vertical).
 */
function pickTextStyle(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of TEXT_STYLE_KEYS) {
    if (props[key] !== undefined) out[key] = props[key];
  }
  if (!PADDING_KEYS.some(key => props[key] !== undefined)) {
    out.px = 4;
    out.py = 2;
  }
  if (props.fontSize === undefined) out.fontSize = 'md';
  if (props.lineHeight === undefined) out.lineHeight = 'short';
  return out;
}

/** Splits `text` into segments for the backdrop: plain runs, and @mention
 *  runs colored by what `validity` knows about them — blue once confirmed
 *  real, muted red once confirmed not real, plain while still unresolved
 *  (including anything under Hive's 3-character minimum). */
function renderSegments(text: string, validity: Map<string, boolean>) {
  if (!text) return null;
  const nodes: React.ReactNode[] = [];
  const regex = new RegExp(MENTION_REGEX.source, 'gi');
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    const mention = match[0];
    const start = match.index;
    if (start > lastIndex) nodes.push(<Text as="span" key={key++}>{text.slice(lastIndex, start)}</Text>);

    const known = validity.get(normalizeMentionToken(mention));
    nodes.push(
      <Text
        as="span"
        key={key++}
        // Color and (non-metric) decoration ONLY. Anything that changes glyph
        // advance width — a bolder weight, a different family, letter-spacing —
        // makes the backdrop's copy of the text a different physical width than
        // the real textarea's, which lays the same characters out in the plain
        // weight it always uses. The caret is positioned by that real layout,
        // so a 600-weight mention (measured ~11px wider than 400 for a 15-char
        // handle) shoves every glyph after it on that line out of step with the
        // caret. Underline is safe; weight is not.
        color={known === true ? 'primary' : known === false ? 'red.400' : undefined}
        textDecoration={known === false ? 'underline dotted' : undefined}
      >
        {mention}
      </Text>
    );
    lastIndex = start + mention.length;
  }
  if (lastIndex < text.length) nodes.push(<Text as="span" key={key++}>{text.slice(lastIndex)}</Text>);
  // A trailing newline needs something to actually render as extra height in
  // a pre-wrap div, the way it does natively in a textarea.
  if (text.endsWith('\n')) nodes.push(<Text as="span" key={key++}>&nbsp;</Text>);
  return nodes;
}

/**
 *  A plain textarea that (a) suggests real Hive usernames as you type an
 *  @mention, sourced from condenser_api.lookup_accounts, and (b) colors a
 *  completed mention once confirmed to be a real account.
 *
 *  Native textareas can't style individual words, so this layers a real
 *  textarea (made invisible except for its caret) on top of a backdrop `div`
 *  that renders the same text with colored mention spans — the standard
 *  "syntax-highlighted textarea" trick. The real element still owns focus,
 *  typing, selection, and scrolling; everything a caller already does with a
 *  ref to a plain Textarea (read `.value`, call `.focus()`, `.setSelectionRange()`,
 *  manipulate `.selectionStart/End` for toolbar formatting) keeps working
 *  unchanged, since the forwarded ref points at that same real DOM node.
 */
const MentionHighlightedTextarea = forwardRef<HTMLTextAreaElement, MentionHighlightedTextareaProps>(
  function MentionHighlightedTextarea(
    { value, defaultValue, onChange, onKeyDown, onScroll, wrapperProps, ...rest },
    forwardedRef
  ) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    const backdropRef = useRef<HTMLDivElement | null>(null);
    /** Last textarea content width the backdrop was pinned to. */
    const syncedWidthRef = useRef(0);
    useImperativeHandle(forwardedRef, () => innerRef.current as HTMLTextAreaElement);

    const [text, setText] = useState<string>(String(value ?? defaultValue ?? ''));

    // Controlled updates (e.g. the blog composer's toolbar formatting, which
    // flows through React state) don't fire a native input event on the
    // textarea — sync from the prop whenever the parent changes it.
    useEffect(() => {
      if (value !== undefined) setText(String(value));
    }, [value]);

    // Typing itself, and any direct `.value =` write elsewhere (the snap
    // composer's resnap-prefill, meme insertion, and post-submit clear) that
    // dispatches a synthetic 'input' event afterward, both flow through here —
    // but only in uncontrolled mode. In controlled mode (the blog composer),
    // this listener's setText fires as a raw DOM callback outside React's
    // event handling, synchronously re-rendering this component with the
    // *stale* `value` prop mid-bubble — before the real onChange (which would
    // update the parent's state to the new value) ever runs. React then
    // resets the controlled textarea's DOM value back to that stale prop
    // right then, wiping out the keystroke before onChange even sees it
    // (every character, silently — this is what broke typing entirely in the
    // blog composer). Controlled mode already syncs `text` correctly via the
    // effect above, once the parent's state update flows back down.
    useEffect(() => {
      const el = innerRef.current;
      if (!el || value !== undefined) return;
      const handleInput = () => setText(el.value);
      el.addEventListener('input', handleInput);
      return () => el.removeEventListener('input', handleInput);
    }, [value]);

    /** Pins the backdrop to the real textarea's content box: same scroll
     *  offset, and same width for line breaking (see the width note below).
     *  Every path that can change either one funnels through here. */
    const syncBackdrop = useCallback(() => {
      const el = innerRef.current;
      const backdrop = backdropRef.current;
      if (!el || !backdrop) return;
      // clientWidth excludes the scrollbar but includes padding; the backdrop
      // mirrors this element's padding and border, so matching border-box
      // widths here is what makes the two content boxes identical. A zero
      // width means the editor is currently hidden (preview-only mode) or not
      // laid out yet — pinning the backdrop to 0 then would wrap every line to
      // a single character; leave it alone and let the ResizeObserver below
      // re-sync the moment it has a real box again.
      // This runs on every scroll event too, so re-read the (comparatively
      // expensive) computed border widths only when the content width has
      // actually moved.
      if (el.clientWidth > 0 && el.clientWidth !== syncedWidthRef.current) {
        syncedWidthRef.current = el.clientWidth;
        const style = window.getComputedStyle(el);
        const borders =
          (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
        backdrop.style.width = `${el.clientWidth + borders}px`;
      }
      backdrop.scrollTop = el.scrollTop;
      backdrop.scrollLeft = el.scrollLeft;
    }, []);

    // Keeps the backdrop's scroll position glued to the real textarea's
    // whenever the text itself changes — not just on the textarea's own
    // `scroll` event (handleScroll below), which the browser doesn't
    // reliably fire for the auto-scroll it does on its own to keep the caret
    // in view while typing past the visible area. Without this, once
    // content overflows the fixed-height wrapper, the backdrop (the only
    // thing rendering visible text — the real textarea's own text is
    // transparent) permanently stops following the real textarea's scroll,
    // so the visible text drifts away from the invisible caret's actual
    // position: every further keystroke visually lands somewhere else on
    // screen than where it was actually typed. Confirmed live: typing enough
    // to overflow the wrapper left the real textarea scrolled while the
    // backdrop stayed pinned at scrollTop 0, with no `scroll` event ever
    // firing in between.
    useEffect(() => {
      syncBackdrop();
    }, [text, syncBackdrop]);

    // The other half of "the backdrop must occupy exactly the real textarea's
    // content box": its WIDTH. A textarea with overflowY="auto" (the blog
    // composer) grows a classic scrollbar the moment the text overflows, and
    // Chrome takes that scrollbar's ~15px out of the textarea's content box —
    // so from that keystroke on, the real textarea wraps its lines ~2
    // characters earlier than the backdrop, which has no scrollbar and stays
    // full width. Same text, two different sets of line breaks: the caret is
    // drawn where the *real* textarea's layout puts it, the letters are drawn
    // where the backdrop's layout puts them, and the two run apart by however
    // much the wrap points have diverged (measured live: up to ~65px, ~8
    // characters, and on 137 of 200 sample paragraphs). That's the "cursor
    // runs ahead of my typing, but the letters still land in the right place"
    // bug — and why it appears out of nowhere partway into a post (that's the
    // scrollbar arriving) rather than from the first paragraph.
    //
    // ResizeObserver's default box is the content box, which is exactly the
    // thing the scrollbar shrinks, so it fires on the scrollbar appearing and
    // disappearing as well as on ordinary layout/resize.
    useLayoutEffect(() => {
      const el = innerRef.current;
      if (!el || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(syncBackdrop);
      observer.observe(el);
      return () => observer.disconnect();
    }, [syncBackdrop]);

    const validity = useMentionValidation(text);
    const mention = useMentionAutocomplete();

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      mention.handleTextChange(e.target.value, e.target.selectionStart ?? e.target.value.length);
      onChange?.(e);
    }, [mention, onChange]);

    const commit = useCallback((next: { text: string; cursorPos: number }) => {
      const el = innerRef.current;
      if (!el) return;
      // A plain `el.value = ...` is silently overwritten on next render if
      // this textarea is controlled (React tracks the value it last set
      // through the property setter) — going through the native setter
      // first, then dispatching input, is the standard way to make a
      // programmatic change look exactly like a real keystroke to both React
      // and this component's own input listener above.
      //
      // The dispatch above only *schedules* the parent's state update — in
      // controlled mode the real DOM value comes back down through the
      // `value` prop on its own render pass. Restoring the caret before that
      // render lands (it used to be deferred a whole animation frame) was
      // exactly the "possessed cursor" bug: type fast enough after accepting
      // a mention (or the next render is merely slow, e.g. a busy tab) and
      // the deferred `setSelectionRange` fires *after* the next keystroke,
      // yanking the caret back to the mention-insertion point mid-word.
      // `flushSync` forces that render through synchronously so the caret
      // restore below always lands after the real value is already in the
      // DOM — no window where a keystroke can race it.
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      flushSync(() => {
        setter ? setter.call(el, next.text) : (el.value = next.text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      el.setSelectionRange(next.cursorPos, next.cursorPos);
    }, []);

    const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      const currentText = innerRef.current?.value ?? text;
      const outcome = mention.handleKeyDown(e.key, currentText);
      if (outcome.handled) {
        e.preventDefault();
        if (outcome.result) commit(outcome.result);
        return;
      }
      onKeyDown?.(e);
    }, [mention, commit, text, onKeyDown]);

    const handleScroll = useCallback((e: ReactUIEvent<HTMLTextAreaElement>) => {
      syncBackdrop();
      onScroll?.(e);
    }, [syncBackdrop, onScroll]);

    const handleSelect = useCallback((name: string) => {
      const el = innerRef.current;
      if (!el) return;
      const result = mention.applySuggestion(el.value, name);
      if (result) commit(result);
      el.focus();
    }, [mention, commit]);

    const segments = useMemo(() => renderSegments(text, validity), [text, validity]);
    const textStyle = useMemo(() => pickTextStyle(rest as Record<string, unknown>), [rest]);

    return (
      <Box position="relative" {...wrapperProps}>
        <Box
          ref={backdropRef}
          aria-hidden
          position="absolute"
          inset={0}
          overflow="hidden"
          pointerEvents="none"
          whiteSpace="pre-wrap"
          // Match a textarea's own line-breaking exactly: Chrome gives it
          // `word-break: normal; overflow-wrap: break-word`. `wordBreak="break-word"`
          // here computed to a different pair, one more place the two layers
          // could disagree about where a line ends.
          wordBreak="normal"
          overflowWrap="break-word"
          color="text"
          borderRadius={rest.borderRadius}
          {...textStyle}
          borderColor="transparent"
        >
          {segments}
        </Box>
        <Textarea
          {...rest}
          ref={innerRef}
          value={value}
          defaultValue={defaultValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          position="absolute"
          inset={0}
          // Chakra's Textarea theme sets an explicit height (a CSS variable
          // resolving to a fixed size, not "100%") — CSS gives an explicit
          // height priority over the auto-height an absolutely positioned
          // element would otherwise get from opposing top/bottom insets, so
          // without this override the real textarea renders at its own
          // ~80px theme default instead of filling the wrapper (and the
          // backdrop underneath, sized by ordinary flow, ends up taller —
          // exactly the mismatch that let clicks below that first 80px miss
          // the real element entirely).
          h="100%"
          minH="100%"
          bg="transparent"
          color="transparent"
          sx={{ caretColor: 'var(--chakra-colors-text)', ...(rest.sx as object) }}
        />
        {mention.isOpen && (
          <Box
            position="absolute"
            top="100%"
            left={0}
            mt={1}
            zIndex={20}
            bg="surface"
            border="1px solid"
            borderColor="surfaceBorder"
            borderRadius="8px"
            boxShadow="lg"
            minW="180px"
            maxW="280px"
            overflow="hidden"
          >
            {mention.suggestions.map((name, idx) => (
              <Box
                key={name}
                px={3}
                py={2}
                cursor="pointer"
                bg={idx === mention.activeIndex ? 'rgba(28, 161, 241, 0.14)' : 'transparent'}
                _hover={{ bg: 'rgba(28, 161, 241, 0.14)' }}
                onMouseEnter={() => mention.setActiveIndex(idx)}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(name); }}
              >
                <Text fontSize="sm" fontWeight="600">@{name}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    );
  }
);

export default MentionHighlightedTextarea;
