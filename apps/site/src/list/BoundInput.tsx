import { TextInput } from '@mantine/core';
import { type ReactNode, useEffect, useState } from 'react';

interface Props {
  label: ReactNode;
  value: number | undefined;
  integer?: boolean;
  onChange: (value: number | undefined) => void;
}

function asText(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

function parse(text: string, integer: boolean): number | undefined | null {
  if (text.trim() === '') return undefined;
  const value = Number(text);
  return Number.isFinite(value) && (!integer || Number.isInteger(value)) ? value : null;
}

/** A number field for a filter bound: it keeps what is typed and reports a valid number, or none when empty. */
export function BoundInput({ label, value, integer = true, onChange }: Props) {
  const [text, setText] = useState(asText(value));
  // A bound changed elsewhere, as by the back button, replaces the text.
  useEffect(() => {
    setText((current) => (parse(current, integer) === value ? current : asText(value)));
  }, [value, integer]);
  return (
    <TextInput
      label={label}
      type="number"
      inputMode={integer ? 'numeric' : 'decimal'}
      value={text}
      onChange={(event) => {
        setText(event.currentTarget.value);
        const parsed = parse(event.currentTarget.value, integer);
        if (parsed !== null) onChange(parsed);
      }}
    />
  );
}
