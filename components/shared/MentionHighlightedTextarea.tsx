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
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type UIEvent as ReactUIEvent,
} from 'react';
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
        color={known === true ? 'primary' : known === false ? 'red.400' : undefined}
        fontWeight={known === true ? 600 : undefined}
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
    // one listener covers controlled, uncontrolled, and programmatic writes.
    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      const handleInput = () => setText(el.value);
      el.addEventListener('input', handleInput);
      return () => el.removeEventListener('input', handleInput);
    }, []);

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
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter ? setter.call(el, next.text) : (el.value = next.text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      requestAnimationFrame(() => el.setSelectionRange(next.cursorPos, next.cursorPos));
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
      if (backdropRef.current) {
        backdropRef.current.scrollTop = e.currentTarget.scrollTop;
        backdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
      }
      onScroll?.(e);
    }, [onScroll]);

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
          wordBreak="break-word"
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
