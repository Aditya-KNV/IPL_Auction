import React from 'react';
import { hasBattingStats, hasBowlingStats } from '../../utils/playerDisplay';

const BATTING_FIELDS = [
  { key: 'top',    label: 'Top Order',    short: 'Top',   value: (p) => p.batting?.phases?.powerplay?.rating },
  { key: 'middle', label: 'Middle Order', short: 'Mid',   value: (p) => p.batting?.phases?.middle?.rating },
  { key: 'lower',  label: 'Lower Order',  short: 'Lower', value: (p) => p.batting?.phases?.death?.rating },
];

const BOWLING_FIELDS = [
  { key: 'powerplay', label: 'Powerplay',    short: 'PP',    value: (p) => p.bowling?.phases?.powerplay },
  { key: 'overs',     label: 'Middle Overs', short: 'Overs', value: (p) => p.bowling?.phases?.middle },
  { key: 'death',     label: 'Death Overs',  short: 'Death', value: (p) => p.bowling?.phases?.death },
];

// The rating groups that apply to a role. All-rounders get batting and bowling.
const groupsFor = (role) => [
  ...(hasBattingStats(role) ? [{ title: 'Batting', color: 'text-blue-400', fields: BATTING_FIELDS }] : []),
  ...(hasBowlingStats(role) ? [{ title: 'Bowling', color: 'text-red-400', fields: BOWLING_FIELDS }] : []),
];

// Filters the user has filled in: [{ ...field, label, min }]. `mins` is
// { fieldKey: text }, as typed into the inputs.
export const activeRatingFilters = (role, mins) =>
  groupsFor(role).flatMap(({ title, fields }) => fields
    .filter((field) => (mins[field.key] ?? '') !== '' && Number.isFinite(Number(mins[field.key])))
    .map((field) => ({
      ...field,
      // "Middle" exists for batting and bowling, so name the group.
      label: `${title === 'Batting' ? 'Bat' : 'Bowl'} ${field.short}`,
      min: Number(mins[field.key]),
    })));

// A player must meet every active minimum.
export const meetsRatingFilters = (player, filters) =>
  filters.every((filter) => {
    const value = filter.value(player);
    return typeof value === 'number' && value >= filter.min;
  });

export default function RatingFilters({ role, mins, onChange }) {
  const groups = groupsFor(role);
  if (!groups.length) return null;

  return (
    <div className="w-full flex flex-col gap-2 lg:flex-row lg:gap-6">
      {groups.map((group) => (
        <fieldset key={group.title} className="min-w-0">
          <legend className={`mb-1 text-[10px] font-black uppercase tracking-widest ${group.color}`}>
            {group.title} · minimum rating
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {group.fields.map((field) => (
              <label key={field.key} className="flex flex-col gap-0.5 min-w-0">
                <span className="truncate text-[11px] text-white/40">{field.label}</span>
                <input
                  type="number" inputMode="decimal" min={0} max={10} step={0.5} placeholder="Any"
                  value={mins[field.key] ?? ''}
                  onChange={(e) => onChange({ ...mins, [field.key]: e.target.value })}
                  className="w-full lg:w-28 bg-surface-2 border border-white/[0.08] text-white rounded-lg px-3 py-1.5 text-sm placeholder-white/20 focus:outline-none focus:border-neon/50"
                />
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
