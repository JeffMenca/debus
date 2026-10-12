'use client';

import { useState } from 'react';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface Option {
  value: string;
  label: string;
}

interface OptionSelectProps {
  id: string;
  label: string;
  placeholder: string;
  options: Option[];
  // How many the server has, so a list longer than the page it sent gets a search box.
  total: number;
  value: string;
  onChange: (value: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
  searchLabel: string;
  emptyMessage: string;
  error?: string;
  // An option the list may not carry, such as the plant driver of a bus when the search leaves them out.
  pinned?: Option;
}

// The options with the selected one on top when the page the server sent leaves it out.
function withSelected(
  options: Option[],
  value: string,
  extras: (Option | null | undefined)[],
): Option[] {
  if (options.some((option) => option.value === value)) return options;
  const selected = extras.find((extra) => extra?.value === value);
  return selected ? [selected, ...options] : options;
}

// A choice from a list the server searches: the box appears only when the list does not fit in one page.
export function OptionSelect({
  id,
  label,
  placeholder,
  options,
  total,
  value,
  onChange,
  search,
  onSearchChange,
  searchLabel,
  emptyMessage,
  error,
  pinned,
}: OptionSelectProps) {
  // The one picked stays on the list while the search narrows it to others.
  const [picked, setPicked] = useState<Option | null>(null);
  const shown = withSelected(options, value, [pinned, picked]);
  const showSearch = search !== '' || total > options.length;

  return (
    <Field id={id} label={label} error={error}>
      {showSearch && (
        <Input
          type="search"
          aria-label={searchLabel}
          placeholder={searchLabel}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      )}
      <Select
        value={value}
        onValueChange={(next) => {
          // There is no empty option: Radix reports '' when an option appears as its value is set.
          if (!next) return;
          setPicked(shown.find((option) => option.value === next) ?? null);
          onChange(next);
        }}
      >
        <SelectTrigger id={id} aria-invalid={error ? true : undefined}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {shown.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {shown.length === 0 && (
        <span className="text-xs text-muted-foreground">
          {search ? 'No encontramos coincidencias.' : emptyMessage}
        </span>
      )}
    </Field>
  );
}
