import { minuteLabel } from '../../libs/workspace';

export function ScheduleTimeSelect({
  value,
  onChange,
  end,
  label: caption,
}: {
  value: number;
  onChange: (value: number) => void;
  end?: boolean;
  label: string;
}) {
  return (
    <label>
      {caption}
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {Array.from({ length: 48 }, (_, i) => (i + (end ? 1 : 0)) * 30).map(
          (minute) => (
            <option key={minute} value={minute}>
              {minuteLabel(minute)}
            </option>
          ),
        )}
      </select>
    </label>
  );
}
