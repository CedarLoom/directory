import { TextInput } from '@mantine/core';
import { type ReactNode, useState } from 'react';

interface Props {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
}

/**
 * A search field that keeps what is typed: the router applies a search in a transition, after the keystroke, and a
 * field bound to it directly would lose characters and its caret.
 */
export function SearchInput({ label, value, onChange }: Props) {
  const [text, setText] = useState(value);
  const [shownValue, setShownValue] = useState(value);
  // The texts sent that have not come back as the value yet.
  const [sent, setSent] = useState<readonly string[]>([]);
  if (value !== shownValue) {
    setShownValue(value);
    const at = sent.lastIndexOf(value);
    if (at >= 0) {
      setSent(sent.slice(at + 1));
    } else {
      // A search changed elsewhere, as by the back button, replaces the text.
      setSent([]);
      setText(value);
    }
  }
  return (
    <TextInput
      type="search"
      label={label}
      value={text}
      onChange={(event) => {
        const next = event.currentTarget.value;
        setText(next);
        setSent((previous) => [...previous, next]);
        onChange(next);
      }}
    />
  );
}
