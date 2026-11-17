import { TextInput } from '@mantine/core';
import { type ReactNode, useEffect, useState } from 'react';

/** The numbers the list's search schema accepts for this bound. */
interface Range {
  integer: boolean;
  min: number;
  max: number;
}

interface Props extends Partial<Range> {
  label: ReactNode;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

function asText(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

function parse(text: string, { integer, min, max }: Range): number | undefined | null {
  if (text.trim() === '') return undefined;
  const value = Number(text);
  const valid = Number.isFinite(value) && (!integer || Number.isInteger(value)) && value >= min && value <= max;
  return valid ? value : null;
}

/**
 * A number field for a filter bound: it keeps what is typed, reports a number the search accepts or none when empty,
 * and marks anything else as invalid.
 */
export function BoundInput({
  label,
  value,
  integer = true,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  onChange,
}: Props) {
  const [text, setText] = useState(asText(value));
  // A bound changed elsewhere, as by the back button, replaces the text.
  useEffect(() => {
    setText((current) => (parse(current, { integer, min, max }) === value ? current : asText(value)));
  }, [value, integer, min, max]);
  return (
    <TextInput
      label={label}
      type="number"
      inputMode={integer ? 'numeric' : 'decimal'}
      min={min}
      max={max}
      value={text}
      error={parse(text, { integer, min, max }) === null}
      onChange={(event) => {
        setText(event.currentTarget.value);
        const parsed = parse(event.currentTarget.value, { integer, min, max });
        if (parsed !== null) onChange(parsed);
      }}
    />
  );
}
