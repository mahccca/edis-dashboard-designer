import { useEffect, useMemo, useState } from "react";
import type { ApiOption, ApiOptionGroup } from "./ApiOptionPicker";
import styles from "./BindingExplorer.module.css";

interface Props {
  groups?: ApiOptionGroup[];
  options: ApiOption[];
  value: string;
  onChange: (value: string) => void;
  onApply?: (value: string) => void;
  disabled?: boolean;
  emptyHint?: string;
}

function OptionButtons({
  items, value, onChange, onApply, disabled, ariaLabel, showSample,
}: {
  items: ApiOption[];
  value: string;
  onChange: (v: string) => void;
  onApply?: (v: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  showSample?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul className={styles.optionList} role="listbox" aria-label={ariaLabel}>
      {items.map((o) => {
        const selected = value === o.value;
        const hint = showSample && o.sampleValue !== undefined && o.sampleValue !== null
          ? String(o.sampleValue)
          : undefined;
        return (
          <li key={o.value}>
            <button
              type="button"
              role="option"
              aria-selected={selected}
              className={`${styles.optionBtn}${selected ? ` ${styles.optionBtnSelected}` : ""}`}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              onDoubleClick={() => {
                onChange(o.value);
                onApply?.(o.value);
              }}
            >
              <span className={styles.optionLabel}>{o.label}</span>
              {hint && !o.label.includes("=") && (
                <span className={styles.optionHint} dir="ltr">{hint}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function HierarchicalOptionList({
  groups, options, value, onChange, onApply, disabled, emptyHint = "آیتمی نیست.",
}: Props) {
  const usableGroups = useMemo(
    () => (groups ?? []).filter((g) => g.options.length > 0),
    [groups],
  );
  const needsParent = usableGroups.length > 1;
  const [parentValue, setParentValue] = useState<string | null>(null);

  useEffect(() => {
    setParentValue(null);
  }, [usableGroups]);

  const selectedParent = needsParent
    ? usableGroups.find((g) => g.value === parentValue)
    : usableGroups[0];

  const itemOptions = usableGroups.length > 0
    ? (selectedParent?.options ?? [])
    : options;

  if (usableGroups.length === 0 && options.length === 0) {
    return <div className={styles.empty}>{emptyHint}</div>;
  }

  if (needsParent && !parentValue) {
    return (
      <div className={styles.panel}>
        <div className={styles.crumb}>
          <span className={styles.crumbStrong}>انتخاب گروه</span>
        </div>
        <OptionButtons
          items={usableGroups.map((g) => ({
            value: g.value,
            label: g.label,
            sampleValue: g.options.length,
          }))}
          value=""
          onChange={(v) => {
            setParentValue(v);
            onChange("");
          }}
          disabled={disabled}
          ariaLabel="والد"
          showSample
        />
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.crumb}>
        {needsParent && selectedParent ? (
          <>
            <button
              type="button"
              className={styles.tab}
              style={{ flex: "0 0 auto", padding: "2px 8px" }}
              disabled={disabled}
              onClick={() => {
                setParentValue(null);
                onChange("");
              }}
            >
              ← گروه‌ها
            </button>
            <span>/</span>
            <span className={styles.crumbStrong} dir="ltr">{selectedParent.label}</span>
          </>
        ) : (
          <span className={styles.crumbStrong}>انتخاب مقدار</span>
        )}
      </div>
      {itemOptions.length === 0 ? (
        <div className={styles.empty}>{emptyHint}</div>
      ) : (
        <OptionButtons
          items={itemOptions}
          value={value}
          onChange={onChange}
          onApply={onApply}
          disabled={disabled}
          ariaLabel="آیتم"
          showSample
        />
      )}
    </div>
  );
}
