import type { DataBinding } from "../../shared/api/types";
import ui from "../../shared/ui/controls.module.css";

/** Studio helper shown when inserting a repeater container. */
export function RepeaterEditorHint({ bindings }: { bindings: DataBinding[] }) {
  return (
    <div className={ui.info}>
      <strong>Repeater</strong>
      <p className={ui.muted} style={{ margin: 0 }}>
        یک بایندینگ که به آرایه resolve می‌شود انتخاب کنید ({bindings.filter(Boolean).length} بایندینگ در پروژه).
        سپس داخل قالب، فیلدها را به مسیرهای نسبی <code dir="ltr">item.*</code> وصل کنید.
      </p>
    </div>
  );
}
