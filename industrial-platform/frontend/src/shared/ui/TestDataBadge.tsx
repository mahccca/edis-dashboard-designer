import { TEST_DATA_LABEL } from "../i18n";
import styles from "./TestDataBadge.module.css";

export function TestDataBadge() {
  return (
    <span className={styles.badge} role="status" title="دادهٔ شبیه‌سازی‌شده — اندازه‌گیری واقعی نیروگاه نیست" data-test-data="true">
      {TEST_DATA_LABEL.fa}
    </span>
  );
}

export function TestDataBanner() {
  return (
    <div className={styles.banner} role="alert" data-test-data="true">
      <strong>{TEST_DATA_LABEL.fa}</strong>
      <span>مقادیر این صفحه از منبع شبیه‌سازی‌شده می‌آیند و به SCADA واقعی متصل نیستند.</span>
    </div>
  );
}
