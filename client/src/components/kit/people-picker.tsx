import { Fragment } from 'react';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from '@/components/ui/combobox';
import { Avatar } from '../Avatar';

export interface PickablePerson {
  id: string;
  name: string;
  color?: string;
  title?: string;
  role?: string;
}

/** Choose several people: type to search, chips for who is chosen. */
export function PeoplePicker({
  people,
  value,
  onChange,
  placeholder = 'Add people…',
  exclude = [],
  id,
}: {
  people: PickablePerson[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  exclude?: string[];
  id?: string;
}) {
  const anchor = useComboboxAnchor();
  const items = people.filter((p) => !exclude.includes(p.id));
  const selected = people.filter((p) => value.includes(p.id));
  return (
    <Combobox<PickablePerson, true>
      multiple
      autoHighlight
      items={items}
      value={selected}
      onValueChange={(next) => onChange(next.map((p) => p.id))}
      itemToStringLabel={(p) => p.name}
      itemToStringValue={(p) => p.id}
      isItemEqualToValue={(a, b) => a.id === b.id}
    >
      <ComboboxChips ref={anchor} className="w-full">
        <ComboboxValue>
          {(values: PickablePerson[]) => (
            <Fragment>
              {values.map((p) => (
                <ComboboxChip key={p.id} aria-label={p.name}>
                  <Avatar user={p} size="xs" className="size-4" /> {p.name}
                </ComboboxChip>
              ))}
              <ComboboxChipsInput id={id} placeholder={values.length ? '' : placeholder} aria-label={placeholder} />
            </Fragment>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No matches</ComboboxEmpty>
        <ComboboxList>
          {(p: PickablePerson) => (
            <ComboboxItem key={p.id} value={p}>
              <Avatar user={p} size="xs" />
              <span className="truncate">{p.name}</span>
              {p.title && <span className="truncate text-xs text-muted-foreground">{p.title}</span>}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
