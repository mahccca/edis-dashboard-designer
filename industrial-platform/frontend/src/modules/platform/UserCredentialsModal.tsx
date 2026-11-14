import { useCallback, useEffect, useState } from "react";
import { ApiError, http } from "../../shared/api/http";
import type { Me } from "../../shared/api/types";
import ui from "../../shared/ui/controls.module.css";
import styles from "./UserCredentialsModal.module.css";

interface ManagedUser {
  id: string;
  username: string;
  displayName: string;
  status: string;
  isPlatformAdmin: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  me: Me;
  onUserUpdated: () => void;
}

export function UserCredentialsModal({ open, onClose, me, onUserUpdated }: Props) {
  const [activeTab, setActiveTab] = useState<"my_profile" | "all_users">("my_profile");

  // My profile fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState(me.user.displayName || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Admin users list
  const [usersList, setUsersList] = useState<ManagedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [addUsername, setAddUsername] = useState("");
  const [addDisplayName, setAddDisplayName] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addIsAdmin, setAddIsAdmin] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Admin edit user
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editPass, setEditPass] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const isPlatformAdmin = Boolean(
    me.platformPermissions?.includes("platform.create_project") || (me.user as Record<string, unknown>).isPlatformAdmin
  );

  const loadAllUsers = useCallback(async () => {
    if (!isPlatformAdmin) return;
    setLoadingUsers(true);
    try {
      const { data } = await http.get<{ items: ManagedUser[] }>("/auth/users");
      setUsersList(data.items);
    } catch {
      /* ignore */
    } finally {
      setLoadingUsers(false);
    }
  }, [isPlatformAdmin]);

  useEffect(() => {
    if (open && activeTab === "all_users") {
      void loadAllUsers();
    }
  }, [open, activeTab, loadAllUsers]);

  if (!open) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentPassword) {
      setErrorMsg("جهت اعمال تغییرات، وارد کردن کلمهٔ عبور فعلی الزامی است.");
      return;
    }

    if (newPassword && newPassword.length < 6) {
      setErrorMsg("کلمهٔ عبور جدید باید حداقل ۶ کاراکتر باشد.");
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setErrorMsg("کلمهٔ عبور جدید با تکرار آن یکسان نیست.");
      return;
    }

    const payload: {
      current_password: string;
      new_username?: string;
      new_display_name?: string;
      new_password?: string;
    } = {
      current_password: currentPassword,
    };

    if (newUsername.trim() && newUsername.trim() !== me.user.username) {
      payload.new_username = newUsername.trim();
    }
    if (newDisplayName.trim() && newDisplayName.trim() !== me.user.displayName) {
      payload.new_display_name = newDisplayName.trim();
    }
    if (newPassword) {
      payload.new_password = newPassword;
    }

    if (!payload.new_username && !payload.new_display_name && !payload.new_password) {
      setErrorMsg("هیچ تغییری وارد نشده است (نام کاربری، نام نمایشی یا رمز جدید).");
      return;
    }

    setSaving(true);
    try {
      await http.put("/auth/credentials", { body: payload });
      setSuccessMsg("اطلاعات حساب کاربری شما با موفقیت ذخیره و به‌روز شد.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onUserUpdated();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.problem?.code === "invalid_current_password") {
          setErrorMsg("کلمهٔ عبور فعلی اشتباه است.");
        } else if (err.problem?.code === "username_taken") {
          setErrorMsg("این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است.");
        } else {
          setErrorMsg(err.problem?.title || err.message || "خطا در به‌روزرسانی مشخصات.");
        }
      } else {
        setErrorMsg("خطا در ارتباط با سرور.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!addUsername.trim() || !addPassword || !addDisplayName.trim()) {
      setAddError("لطفاً تمامی فیلدها را پر کنید.");
      return;
    }
    if (addPassword.length < 6) {
      setAddError("رمز عبور باید حداقل ۶ کاراکتر باشد.");
      return;
    }

    setAddSaving(true);
    try {
      await http.post("/auth/users", {
        body: {
          username: addUsername.trim(),
          password: addPassword,
          display_name: addDisplayName.trim(),
          is_platform_admin: addIsAdmin,
        },
      });
      setAddUsername("");
      setAddPassword("");
      setAddDisplayName("");
      setAddIsAdmin(false);
      setShowAddUser(false);
      void loadAllUsers();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setAddError(err.message);
      } else {
        setAddError("خطا در ایجاد کاربر");
      }
    } finally {
      setAddSaving(false);
    }
  };

  const handleAdminResetPassword = async (user: ManagedUser) => {
    if (!editPass && !editDisplayName) return;
    setEditSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (editPass) body.password = editPass;
      if (editDisplayName) body.display_name = editDisplayName;

      await http.patch(`/auth/users/${user.id}`, { body });
      setEditingUser(null);
      setEditPass("");
      setEditDisplayName("");
      void loadAllUsers();
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : "خطا در تغییر مشخصات کاربر");
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="creds-title">
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <span className={styles.titleIcon}>👤</span>
            <h3 id="creds-title" className={styles.title}>
              مدیریت حساب و امنیت کاربری
            </h3>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} title="بستن">
            ✕
          </button>
        </div>

        {isPlatformAdmin && (
          <div className={styles.tabBar}>
            <button
              type="button"
              className={`${styles.tabButton} ${activeTab === "my_profile" ? styles.tabButtonActive : ""}`}
              onClick={() => setActiveTab("my_profile")}
            >
              🔒 مشخصات و رمز عبور من
            </button>
            <button
              type="button"
              className={`${styles.tabButton} ${activeTab === "all_users" ? styles.tabButtonActive : ""}`}
              onClick={() => setActiveTab("all_users")}
            >
              👥 مدیریت کاربران سیستم ({usersList.length || "…"})
            </button>
          </div>
        )}

        <div className={styles.content}>
          {activeTab === "my_profile" ? (
            <form onSubmit={handleSaveProfile} className={styles.formGrid}>
              <div className={styles.userSummaryCard}>
                <div className={styles.userSummaryInfo}>
                  <div className={styles.userSummaryName}>{me.user.displayName || me.user.username}</div>
                  <div className={styles.userSummaryMeta}>@{me.user.username}</div>
                </div>
                <div className={`${styles.roleBadge} ${isPlatformAdmin ? styles.roleBadgeAdmin : styles.roleBadgeUser}`}>
                  {isPlatformAdmin ? "🛡️ ادمین ارشد پلتفرم" : "👤 کاربر استاندارد"}
                </div>
              </div>

              {errorMsg && <div className={styles.alertError}>⚠️ {errorMsg}</div>}
              {successMsg && <div className={styles.alertSuccess}>✓ {successMsg}</div>}

              <div className={styles.fieldGroup}>
                <label className={styles.label}>
                  <span>کلمهٔ عبور فعلی <span style={{ color: "#ef4444" }}>*</span></span>
                  <span className={styles.hint}>جهت تایید هویت</span>
                </label>
                <div className={styles.inputWrapper}>
                  <input
                    type={showCurrentPass ? "text" : "password"}
                    className={styles.input}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="کلمهٔ عبور فعلی خود را وارد کنید"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className={styles.togglePassBtn}
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    title={showCurrentPass ? "مخفی کردن" : "نمایش"}
                  >
                    {showCurrentPass ? "👁️‍🗨️" : "👁️"}
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>نام کاربری جدید</label>
                  <input
                    type="text"
                    className={styles.input}
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder={`فعلی: ${me.user.username}`}
                    autoComplete="username"
                    dir="ltr"
                  />
                  <span className={styles.hint}>اختیاری (حداقل ۳ کاراکتر انگلیسی)</span>
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.label}>نام نمایشی</label>
                  <input
                    type="text"
                    className={styles.input}
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder="نام و نام خانوادگی"
                  />
                  <span className={styles.hint}>اختیاری</span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>
                    <span>کلمهٔ عبور جدید</span>
                  </label>
                  <div className={styles.inputWrapper}>
                    <input
                      type={showNewPass ? "text" : "password"}
                      className={styles.input}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="حداقل ۶ کاراکتر"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className={styles.togglePassBtn}
                      onClick={() => setShowNewPass(!showNewPass)}
                      title={showNewPass ? "مخفی کردن" : "نمایش"}
                    >
                      {showNewPass ? "👁️‍🗨️" : "👁️"}
                    </button>
                  </div>
                  <span className={styles.hint}>اگر مایل به تغییر رمز نیستید خالی بگذارید</span>
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.label}>
                    <span>تکرار کلمهٔ عبور جدید</span>
                  </label>
                  <input
                    type={showNewPass ? "text" : "password"}
                    className={styles.input}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="تکرار رمز عبور جدید"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className={styles.footerActions}>
                <button type="button" className={ui.button} onClick={onClose}>
                  انصراف
                </button>
                <button
                  type="submit"
                  className={ui.button}
                  style={{
                    background: "#0284c7",
                    color: "#ffffff",
                    borderColor: "#38bdf8",
                    fontWeight: 600,
                  }}
                  disabled={saving}
                >
                  {saving ? "در حال ذخیره…" : "ذخیره تغییرات مشخصات"}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.9rem", color: "#94a3b8" }}>
                  لیست کاربرانی که دسترسی به محیط استودیو و ویرایشگر دارند:
                </span>
                <button
                  type="button"
                  className={ui.button}
                  style={{ background: "#0ea5e9", color: "#ffffff", fontWeight: 600 }}
                  onClick={() => setShowAddUser(!showAddUser)}
                >
                  {showAddUser ? "✕ بستن فرم" : "＋ تعریف کاربر جدید"}
                </button>
              </div>

              {showAddUser && (
                <form onSubmit={handleCreateUser} className={styles.newUserBox}>
                  <strong style={{ color: "#38bdf8", fontSize: "0.92rem" }}>ایجاد کاربر جدید</strong>
                  {addError && <div className={styles.alertError}>⚠️ {addError}</div>}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>نام کاربری (انگلیسی)</label>
                      <input
                        type="text"
                        className={styles.input}
                        value={addUsername}
                        onChange={(e) => setAddUsername(e.target.value)}
                        placeholder="username"
                        dir="ltr"
                        required
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>نام نمایشی</label>
                      <input
                        type="text"
                        className={styles.input}
                        value={addDisplayName}
                        onChange={(e) => setAddDisplayName(e.target.value)}
                        placeholder="نام و نام خانوادگی"
                        required
                      />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>کلمهٔ عبور اولیه</label>
                      <input
                        type="password"
                        className={styles.input}
                        value={addPassword}
                        onChange={(e) => setAddPassword(e.target.value)}
                        placeholder="حداقل ۶ کاراکتر"
                        required
                      />
                    </div>
                    <div className={styles.fieldGroup} style={{ justifyContent: "center" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 20 }}>
                        <input
                          type="checkbox"
                          checked={addIsAdmin}
                          onChange={(e) => setAddIsAdmin(e.target.checked)}
                        />
                        <span style={{ fontSize: "0.85rem", color: "#ffffff" }}>دسترسی مدیر ارشد (Platform Admin)</span>
                      </label>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                    <button
                      type="submit"
                      className={ui.button}
                      style={{ background: "#10b981", color: "#ffffff", fontWeight: 600 }}
                      disabled={addSaving}
                    >
                      {addSaving ? "در حال ایجاد…" : "ثبت کاربر جدید"}
                    </button>
                  </div>
                </form>
              )}

              {loadingUsers ? (
                <div style={{ textAlign: "center", padding: 24, color: "#8b98a5" }}>در حال بارگذاری لیست کاربران…</div>
              ) : (
                <div className={styles.tableContainer}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>نام نمایشی</th>
                        <th>نام کاربری</th>
                        <th>نقش</th>
                        <th>وضعیت</th>
                        <th>عملیات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersList.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <strong>{u.displayName}</strong>
                            {u.id === me.user.id && (
                              <span style={{ color: "#38bdf8", fontSize: "0.75rem", marginInlineStart: 6 }}>
                                (حساب شما)
                              </span>
                            )}
                          </td>
                          <td dir="ltr" style={{ textAlign: "right" }}>@{u.username}</td>
                          <td>
                            <span className={`${styles.roleBadge} ${u.isPlatformAdmin ? styles.roleBadgeAdmin : styles.roleBadgeUser}`}>
                              {u.isPlatformAdmin ? "مدیر ارشد" : "کاربر"}
                            </span>
                          </td>
                          <td>
                            <span style={{ color: u.status === "active" ? "#34d399" : "#f87171", fontSize: "0.8rem" }}>
                              {u.status === "active" ? "فعال" : "غیرفعال"}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={ui.button}
                              style={{ fontSize: "0.75rem", padding: "3px 8px" }}
                              onClick={() => {
                                setEditingUser(u);
                                setEditDisplayName(u.displayName);
                                setEditPass("");
                              }}
                            >
                              🔑 تغییر رمز / ویرایش
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {editingUser && (
                <div className={styles.newUserBox} style={{ borderStyle: "solid", borderColor: "#f59e0b" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ color: "#f59e0b", fontSize: "0.92rem" }}>
                      تغییر رمز و مشخصات کاربر: {editingUser.displayName} (@{editingUser.username})
                    </strong>
                    <button
                      type="button"
                      style={{ background: "transparent", border: "none", color: "#ffffff", cursor: "pointer" }}
                      onClick={() => setEditingUser(null)}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>نام نمایشی جدید</label>
                      <input
                        type="text"
                        className={styles.input}
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        placeholder="نام نمایشی جدید"
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>کلمهٔ عبور جدید (اختیاری)</label>
                      <input
                        type="password"
                        className={styles.input}
                        value={editPass}
                        onChange={(e) => setEditPass(e.target.value)}
                        placeholder="رمز عبور جدید (حداقل ۶ کاراکتر)"
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button type="button" className={ui.button} onClick={() => setEditingUser(null)}>
                      انصراف
                    </button>
                    <button
                      type="button"
                      className={ui.button}
                      style={{ background: "#f59e0b", color: "#000", fontWeight: 700 }}
                      onClick={() => handleAdminResetPassword(editingUser)}
                      disabled={editSaving}
                    >
                      {editSaving ? "در حال ثبت…" : "اعمال رمز و مشخصات جدید"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
