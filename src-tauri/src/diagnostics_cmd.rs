use std::{fs, io::Write, sync::Mutex};

use tauri::{AppHandle, Manager};

/// Keep at most this much diagnostics history; the log rotates in place so it
/// never grows without bound while still capturing a full bug session.
const DIAGNOSTICS_MAX_BYTES: u64 = 2 * 1024 * 1024;

static DIAGNOSTICS_LOCK: Mutex<()> = Mutex::new(());

fn diagnostics_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("failed to resolve config directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("failed to create config directory: {error}"))?;
    Ok(dir.join("diagnostics.log"))
}

#[tauri::command]
pub fn append_diagnostic_line(app: AppHandle, line: String) -> Result<(), String> {
    let _guard = DIAGNOSTICS_LOCK
        .lock()
        .map_err(|_| "diagnostics lock is poisoned".to_string())?;
    let path = diagnostics_path(&app)?;
    if let Ok(metadata) = fs::metadata(&path) {
        if metadata.len() > DIAGNOSTICS_MAX_BYTES {
            // Rotate in place: drop everything but the newest 64 KiB so recent
            // context survives while a runaway log cannot fill the disk.
            if let Ok(text) = fs::read_to_string(&path) {
                let kept = text.chars().rev().take(64 * 1024).collect::<String>();
                let rotated = kept.chars().rev().collect::<String>();
                fs::write(&path, rotated)
                    .map_err(|error| format!("failed to rotate diagnostics: {error}"))?;
            }
        }
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| format!("failed to open diagnostics: {error}"))?;
    writeln!(file, "{line}").map_err(|error| format!("failed to write diagnostics: {error}"))
}
