import { useState, type FormEvent } from "react";
import { ApiError, http, setCsrfToken } from "../../shared/api/http";
import ui from "../../shared/ui/controls.module.css";

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await http.post<{ csrfToken: string }>("/auth/login", { body: { username, password } });
      setCsrfToken(data.csrfToken);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "نام کاربری یا رمز عبور نادرست است."
        : err instanceof ApiError && err.status === 429 ? "تلاش‌های ناموفق زیاد بود؛ کمی بعد دوباره امتحان کنید."
        : "ورود ناموفق بود.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={`${ui.card} ${ui.form}`} style={{ maxWidth: 360, margin: "10vh auto" }} onSubmit={submit}>
      <h1 style={{ margin: 0, fontSize: "1.25rem" }}>Industrial Platform — Studio</h1>
      <label className={ui.field}>
        <span className={ui.label}>نام کاربری</span>
        <input className={ui.input} dir="ltr" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
      </label>
      <label className={ui.field}>
        <span className={ui.label}>رمز عبور</span>
        <input className={ui.input} dir="ltr" type="password" autoComplete="current-password" value={password}
               onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && <div className={ui.alert} role="alert">{error}</div>}
      <button className={`${ui.button} ${ui.primary}`} disabled={busy}>ورود</button>
    </form>
  );
}
