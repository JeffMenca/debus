'use client';

import { SEARCH_MAX_LENGTH } from '@debus/contracts';
import { useState } from 'react';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { inputRules } from '@/lib/forms/input-rules';

export interface Option {
  value: string;
  label: string;
  // Shown but not choosable, such as a bus too small for the group.
  disabled?: boolean;
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
  // Shows the box from the start, for a list people would rather filter than read.
  alwaysSearch?: boolean;
  // An option the list may not carry, such as the plant driver of a bus when the search leaves them out.
  pinned?: Option;
  // For a filter: an option on top that stands for "no choice" and reports an empty value.
  noneLabel?: string;
}

const NONE = '__none__';

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
  alwaysSearch = false,
  pinned,
  noneLabel,
}: OptionSelectProps) {
  // The one picked stays on the list while the search narrows it to others.
  const [picked, setPicked] = useState<Option | null>(null);
  const shown = withSelected(options, value, [pinned, picked]);
  const showSearch = alwaysSearch || search !== '' || total > options.length;

  return (
    <Field id={id} label={label} error={error}>
      {showSearch && (
        <Input
          type="search"
          rule={inputRules.text(SEARCH_MAX_LENGTH)}
          aria-label={searchLabel}
          placeholder={searchLabel}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      )}
      <Select
        value={value === '' && noneLabel ? NONE : value}
        onValueChange={(next) => {
          // Radix reports '' when an option appears as its value is set, which is no choice at all.
          if (!next) return;
          if (next === NONE) {
            setPicked(null);
            onChange('');
            return;
          }
          setPicked(shown.find((option) => option.value === next) ?? null);
          onChange(next);
        }}
      >
        <SelectTrigger id={id} {...invalidProps(id, error)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
          {shown.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
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
