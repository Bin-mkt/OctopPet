use std::fs;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose, Engine};
use tauri::{AppHandle, Manager};

/// Decode base64 attachment bytes.
fn decode(data: &str) -> Result<Vec<u8>, String> {
    let bytes = general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|error| format!("failed to decode attachment: {error}"))?;
    if bytes.is_empty() {
        return Err("attachment is empty".into());
    }
    Ok(bytes)
}

/// Append ` (1)`, ` (2)`… before the extension until the path is free.
fn unique_target(dir: &Path, filename: &str) -> PathBuf {
    let cleaned = filename.trim();
    let base = if cleaned.is_empty() {
        "attachment"
    } else {
        cleaned
    };
    let candidate = dir.join(base);
    if !candidate.exists() {
        return candidate;
    }
    let stem = candidate
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(base);
    let ext = candidate
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    for index in 1..1024 {
        let next = dir.join(format!("{stem} ({index}){ext}"));
        if !next.exists() {
            return next;
        }
    }
    candidate
}

/// Save an attachment from the chat into the user's Downloads folder.
///
/// A modal save dialog is not used on purpose: the pet runs as an accessory
/// app without a main window, so a sheet-attached NSSavePanel can fail to
/// appear at all and hang the caller forever. Returns the written path so
/// the UI can confirm where the file landed.
#[tauri::command]
pub async fn save_attachment(
    app: AppHandle,
    data: String,
    filename: String,
) -> Result<String, String> {
    let bytes = decode(&data)?;
    let dir = app
        .path()
        .download_dir()
        .map_err(|error| format!("failed to resolve Downloads folder: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("failed to create Downloads folder: {error}"))?;
    let target = unique_target(&dir, &filename);
    fs::write(&target, &bytes)
        .map_err(|error| format!("failed to write {}: {error}", target.display()))?;
    Ok(target.to_string_lossy().to_string())
}
