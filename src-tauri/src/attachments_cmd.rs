use std::fs;

use base64::{engine::general_purpose, Engine};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FilePath;

/// Save base64-encoded attachment bytes after asking the user where to put
/// them. A declined dialog succeeds silently — this is not an error.
#[tauri::command]
pub async fn save_attachment(app: AppHandle, data: String, filename: String) -> Result<(), String> {
    let bytes = general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|error| format!("failed to decode attachment: {error}"))?;
    if bytes.is_empty() {
        return Err("attachment is empty".into());
    }
    let file_path = app
        .dialog()
        .file()
        .set_file_name(&filename)
        .blocking_save_file();
    let Some(file_path) = file_path else {
        return Ok(());
    };
    let path = match file_path {
        FilePath::Path(path) => path,
        FilePath::Url(_) => return Err("unsupported save location".into()),
    };
    fs::write(&path, &bytes).map_err(|error| format!("failed to write {}: {error}", path.display()))
}
